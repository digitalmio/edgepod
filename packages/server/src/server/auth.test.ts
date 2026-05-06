import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("jose", () => {
  const mockJwtVerify = vi.fn(async (token: string, _keyGetter: any, _options?: any) => {
    if (token === "expired-token") {
      const err = new Error("jwt expired");
      throw err;
    }
    if (token === "invalid-signature") {
      const err = new Error("signature verification failed");
      throw err;
    }
    if (token === "valid-token") {
      return { payload: { sub: "user-123", email: "test@example.com" } };
    }
    const err = new Error("invalid token");
    throw err;
  });

  const mockCreateRemoteJWKSet = vi.fn(() => mockJwtVerify);
  const mockCreateLocalJWKSet = vi.fn(() => mockJwtVerify);
  const mockImportReturnValue = { type: "secret" };
  const mockImportJWK = vi.fn(async () => mockImportReturnValue);
  const mockSignJWT = vi.fn(async () => "signed-jwt-token");

  const MockSignJWT = vi.fn(function (this: any, claims: Record<string, unknown>) {
    this.claims = claims;
    this.setProtectedHeader = vi.fn(() => this);
    this.setIssuedAt = vi.fn(() => this);
    this.setExpirationTime = vi.fn(() => this);
    this.sign = mockSignJWT;
  });

  return {
    createRemoteJWKSet: mockCreateRemoteJWKSet,
    createLocalJWKSet: mockCreateLocalJWKSet,
    importJWK: mockImportJWK,
    jwtVerify: mockJwtVerify,
    SignJWT: MockSignJWT,
  };
});

describe("verifyJwt", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns payload for valid token with remote JWKS", async () => {
    const { verifyJwt } = await import("./auth");

    const result = await verifyJwt("valid-token", {
      EDGEPOD_JWKS_URL: "https://example.com/.well-known/jwks.json",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sub).toBe("user-123");
      expect(result.value.email).toBe("test@example.com");
    }
  });

  it("returns error for expired token", async () => {
    const { verifyJwt } = await import("./auth");

    const result = await verifyJwt("expired-token", {
      EDGEPOD_JWKS_URL: "https://example.com/.well-known/jwks.json",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("Token expired");
    }
  });

  it("returns error for invalid signature", async () => {
    const { verifyJwt } = await import("./auth");

    const result = await verifyJwt("invalid-signature", {
      EDGEPOD_JWKS_URL: "https://example.com/.well-known/jwks.json",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("Invalid signature");
    }
  });

  it("calls createRemoteJWKSet with the configured URL", async () => {
    const { verifyJwt } = await import("./auth");
    const { createRemoteJWKSet } = await import("jose");

    await verifyJwt("valid-token", {
      EDGEPOD_JWKS_URL: "https://example.com/.well-known/jwks.json",
    });

    expect(createRemoteJWKSet).toHaveBeenCalledWith(
      new URL("https://example.com/.well-known/jwks.json"),
    );
  });

  it("uses local JWKS from ASSETS when no remote URL", async () => {
    const { verifyJwt } = await import("./auth");
    const { createLocalJWKSet } = await import("jose");

    const jwksJson = { keys: [{ kty: "EC", crv: "P-256", x: "test", y: "test" }] };
    const mockAssets = {
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => jwksJson,
      })),
    };

    await verifyJwt("valid-token", {
      ASSETS: mockAssets as any,
    });

    expect(mockAssets.fetch).toHaveBeenCalledWith("http://localhost/.well-known/jwks.json");
    expect(createLocalJWKSet).toHaveBeenCalledWith(jwksJson);
  });

  it("caches remote JWKS across calls", async () => {
    const { verifyJwt } = await import("./auth");
    const { createRemoteJWKSet } = await import("jose");

    await verifyJwt("valid-token", {
      EDGEPOD_JWKS_URL: "https://example.com/.well-known/jwks.json",
    });

    (createRemoteJWKSet as ReturnType<typeof vi.fn>).mockClear();

    await verifyJwt("valid-token", {
      EDGEPOD_JWKS_URL: "https://example.com/.well-known/jwks.json",
    });

    expect(createRemoteJWKSet).not.toHaveBeenCalled();
  });

  it("returns error when no JWKS configured", async () => {
    const { verifyJwt } = await import("./auth");

    const result = await verifyJwt("valid-token", {});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("No JWKS URL or local JWKS configured");
    }
  });

  it("returns error when local JWKS fetch fails", async () => {
    const { verifyJwt } = await import("./auth");

    const mockAssets = {
      fetch: vi.fn(async () => ({
        ok: false,
        status: 404,
      })),
    };

    const result = await verifyJwt("valid-token", {
      ASSETS: mockAssets as any,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toContain("Failed to fetch local JWKS");
    }
  });

  it("returns error when local JWKS JSON is malformed", async () => {
    const { verifyJwt } = await import("./auth");

    const mockAssets = {
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })),
    };

    const result = await verifyJwt("valid-token", {
      ASSETS: mockAssets as any,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toContain("Failed to parse local JWKS");
    }
  });
});

describe("initJwtSigner", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("initializes signer with valid private key", async () => {
    const { initJwtSigner, getJwtSigner } = await import("./auth");

    const mockPrivateKey = JSON.stringify({
      kty: "EC",
      crv: "P-256",
      d: "test-private-key",
      x: "test-x",
      y: "test-y",
    });

    const result = await initJwtSigner({ EDGEPOD_JWT_PRIVATE_KEY: mockPrivateKey });

    expect(result.isOk()).toBe(true);
    expect(getJwtSigner()).toBeDefined();
  });

  it("calls importJWK with parsed key", async () => {
    const { initJwtSigner } = await import("./auth");
    const { importJWK } = await import("jose");

    const mockPrivateKey = JSON.stringify({
      kty: "EC",
      crv: "P-256",
      d: "test-private-key",
      x: "test-x",
      y: "test-y",
    });

    await initJwtSigner({ EDGEPOD_JWT_PRIVATE_KEY: mockPrivateKey });

    expect(importJWK).toHaveBeenCalledWith(
      expect.objectContaining({ kty: "EC", crv: "P-256" }),
      "ES256",
    );
  });

  it("returns error when no private key configured", async () => {
    const { initJwtSigner } = await import("./auth");

    const result = await initJwtSigner({});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("No JWT private key configured");
    }
  });

  it("returns error for malformed private key JSON", async () => {
    const { initJwtSigner } = await import("./auth");

    const result = await initJwtSigner({ EDGEPOD_JWT_PRIVATE_KEY: "not-json" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("Malformed JWT private key JSON");
    }
  });

  it("returns ok when signer already initialized", async () => {
    const { initJwtSigner } = await import("./auth");

    const mockPrivateKey = JSON.stringify({
      kty: "EC",
      crv: "P-256",
      d: "test-private-key",
      x: "test-x",
      y: "test-y",
    });

    await initJwtSigner({ EDGEPOD_JWT_PRIVATE_KEY: mockPrivateKey });
    const secondResult = await initJwtSigner({ EDGEPOD_JWT_PRIVATE_KEY: mockPrivateKey });

    expect(secondResult.isOk()).toBe(true);
  });
});

describe("getJwtSigner", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null before initialization", async () => {
    const { getJwtSigner } = await import("./auth");

    expect(getJwtSigner()).toBeNull();
  });

  it("returns a callable signer after initialization", async () => {
    const { initJwtSigner, getJwtSigner } = await import("./auth");

    const mockPrivateKey = JSON.stringify({
      kty: "EC",
      crv: "P-256",
      d: "test-private-key",
      x: "test-x",
      y: "test-y",
    });

    await initJwtSigner({ EDGEPOD_JWT_PRIVATE_KEY: mockPrivateKey });

    const signer = getJwtSigner();
    expect(signer).toBeDefined();
    expect(typeof signer).toBe("function");
  });

  it("signer calls SignJWT with correct claims and header", async () => {
    const { initJwtSigner, getJwtSigner } = await import("./auth");
    const { SignJWT } = await import("jose");

    const mockPrivateKey = JSON.stringify({
      kty: "EC",
      crv: "P-256",
      d: "test-private-key",
      x: "test-x",
      y: "test-y",
    });

    await initJwtSigner({ EDGEPOD_JWT_PRIVATE_KEY: mockPrivateKey });

    const signer = getJwtSigner()!;
    const token = await signer({ sub: "user-1", role: "admin" });

    expect(token).toBe("signed-jwt-token");
    expect(SignJWT).toHaveBeenCalledWith({ sub: "user-1", role: "admin" });
  });
});
