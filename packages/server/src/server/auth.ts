import {
  createLocalJWKSet,
  createRemoteJWKSet,
  importJWK,
  jwtVerify,
  SignJWT,
  errors,
  type FlattenedJWSInput,
  type GetKeyFunction,
  type JSONWebKeySet,
  type JWTHeaderParameters,
  type JWTPayload,
  type JWTClaimVerificationOptions,
} from "jose";
import { ResultAsync, okAsync, errAsync } from "neverthrow";

type AuthEnv = {
  EDGEPOD_JWKS_URL?: string;
  EDGEPOD_JWT_PRIVATE_KEY?: string;
  ASSETS?: Fetcher;
};

type JwksGetter = GetKeyFunction<JWTHeaderParameters, FlattenedJWSInput>;

// Module-level caches — persist across requests on the same Worker isolate
let jwks: JwksGetter | null = null;
let signingKey: CryptoKey | null = null;
let signer: ((claims: Record<string, unknown>, expiresIn?: string) => Promise<string>) | null =
  null;

function resolveJwks(env: AuthEnv): ResultAsync<JwksGetter, string> {
  if (jwks) return okAsync(jwks);

  if (env.EDGEPOD_JWKS_URL) {
    jwks = createRemoteJWKSet(new URL(env.EDGEPOD_JWKS_URL));
    return okAsync(jwks);
  }

  if (!env.ASSETS) {
    return errAsync("No JWKS URL or local JWKS configured");
  }

  return ResultAsync.fromPromise(
    env.ASSETS.fetch("http://localhost/.well-known/jwks.json"),
    () => "Failed to fetch local JWKS",
  ).andThen((res) => {
    if (!res.ok) {
      return errAsync(`Failed to fetch local JWKS: ${res.status}`);
    }
    return ResultAsync.fromPromise(
      res.json() as Promise<JSONWebKeySet>,
      () => "Failed to parse local JWKS JSON",
    ).andThen((json) => {
      jwks = createLocalJWKSet(json);
      return okAsync(jwks);
    });
  });
}

function resolveSigningKey(env: AuthEnv): ResultAsync<CryptoKey, string> {
  if (signingKey) return okAsync(signingKey);
  if (!env.EDGEPOD_JWT_PRIVATE_KEY) return errAsync("No JWT private key configured");

  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(env.EDGEPOD_JWT_PRIVATE_KEY) as JsonWebKey;
  } catch {
    return errAsync("Malformed JWT private key JSON");
  }

  return ResultAsync.fromPromise(importJWK(jwk, "ES256"), () => "Failed to import signing key").map(
    (key) => {
      signingKey = key as CryptoKey;
      return signingKey;
    },
  );
}

export function verifyJwt(
  token: string,
  env: AuthEnv,
  options?: JWTClaimVerificationOptions,
): ResultAsync<JWTPayload, string> {
  return resolveJwks(env).andThen((keyGetter) => {
    return ResultAsync.fromPromise(jwtVerify(token, keyGetter, options), (e) => {
      if (e instanceof errors.JWTExpired) return "Token expired";
      if (e instanceof errors.JWSSignatureVerificationFailed) return "Invalid signature";
      if (e instanceof Error) return e.message;
      return "Invalid token";
    }).map(({ payload }) => payload);
  });
}

export function initJwtSigner(env: AuthEnv): ResultAsync<void, string> {
  if (signer !== null) return okAsync(undefined);

  return resolveSigningKey(env).andThen((key) => {
    signer = (claims, expiresIn = "1h") =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "ES256", kid: "edgepod-local-key" })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key);
    return okAsync(undefined);
  });
}

export function getJwtSigner(): typeof signer {
  return signer;
}
