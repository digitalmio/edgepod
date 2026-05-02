import {
  createLocalJWKSet,
  createRemoteJWKSet,
  importJWK,
  jwtVerify,
  SignJWT,
  type FlattenedJWSInput,
  type GetKeyFunction,
  type JSONWebKeySet,
  type JWTHeaderParameters,
  type JWTPayload,
  type JWTClaimVerificationOptions,
} from "jose";

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

async function resolveJwks(env: AuthEnv): Promise<JwksGetter | null> {
  if (jwks) return jwks;

  if (env.EDGEPOD_JWKS_URL) {
    jwks = createRemoteJWKSet(new URL(env.EDGEPOD_JWKS_URL));
    return jwks;
  }

  if (env.ASSETS) {
    const res = await env.ASSETS.fetch("http://localhost/.well-known/jwks.json");
    if (!res.ok) return null;
    const json = (await res.json()) as JSONWebKeySet;
    jwks = createLocalJWKSet(json);
    return jwks;
  }

  return null;
}

async function resolveSigningKey(env: AuthEnv): Promise<CryptoKey | null> {
  if (signingKey) return signingKey;
  if (!env.EDGEPOD_JWT_PRIVATE_KEY) return null;

  const jwk = JSON.parse(env.EDGEPOD_JWT_PRIVATE_KEY) as JsonWebKey;
  signingKey = (await importJWK(jwk, "ES256")) as CryptoKey;
  return signingKey;
}

export async function verifyJwt(
  token: string,
  env: AuthEnv,
  options?: JWTClaimVerificationOptions,
): Promise<JWTPayload | null> {
  const keyGetter = await resolveJwks(env);
  if (!keyGetter) return null;

  try {
    const { payload } = await jwtVerify(token, keyGetter, options);
    return payload;
  } catch {
    return null;
  }
}

export async function initJwtSigner(env: AuthEnv): Promise<void> {
  if (signer !== null) return;
  const key = await resolveSigningKey(env);
  if (!key) return;

  signer = (claims, expiresIn = "1h") =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "edgepod-local-key" })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(key);
}

export function getJwtSigner(): typeof signer {
  return signer;
}
