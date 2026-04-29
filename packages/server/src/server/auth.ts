import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type FlattenedJWSInput,
  type GetKeyFunction,
  type JSONWebKeySet,
  type JWTHeaderParameters,
  type JWTPayload,
} from "jose";

type AuthEnv = {
  EDGEPOD_JWKS_URL?: string;
  ASSETS?: Fetcher;
};

type JwksGetter = GetKeyFunction<JWTHeaderParameters, FlattenedJWSInput>;

// Module-level cache — persists across requests on the same Worker isolate
let jwks: JwksGetter | null = null;

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

export async function verifyJwt(token: string, env: AuthEnv): Promise<JWTPayload | null> {
  const keyGetter = await resolveJwks(env);
  if (!keyGetter) return null;

  try {
    const { payload } = await jwtVerify(token, keyGetter);
    return payload;
  } catch {
    return null;
  }
}
