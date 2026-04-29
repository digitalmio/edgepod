import { consola } from "consola";

export type AuthChoice = { mode: "none" } | { mode: "remote"; jwksUrl: string } | { mode: "local" };

async function fetchJwks(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL.";
  }
  if (parsed.protocol !== "https:") return "JWKS URL must use HTTPS.";

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    return "Could not reach the URL — check it is publicly accessible.";
  }

  if (!res.ok) return `Server returned ${res.status}.`;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return "Response is not valid JSON.";
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("keys" in body) ||
    !Array.isArray((body as Record<string, unknown>).keys)
  ) {
    return 'Response does not look like a JWKS (missing "keys" array).';
  }

  const keys = (body as { keys: unknown[] }).keys;
  if (keys.length === 0) return "JWKS contains no keys.";

  const invalid = keys.find(
    (k) =>
      typeof k !== "object" || k === null || typeof (k as Record<string, unknown>).kty !== "string"
  );
  if (invalid) return 'One or more keys are missing the required "kty" field.';

  return null;
}

export async function promptAuthConfig(): Promise<AuthChoice> {
  const choice = (await consola.prompt("Enable user authentication?", {
    type: "select",
    options: ["Local JWKS store", "Remote JWKS (Auth0, Clerk, Supabase, etc.)", "Skip"],
  })) as string;

  if (choice.startsWith("Remote")) {
    let jwksUrl = "";
    while (true) {
      jwksUrl = (await consola.prompt("Enter your JWKS endpoint URL:", {
        type: "text",
      })) as string;

      const error = await fetchJwks(jwksUrl);
      if (!error) break;
      consola.error(`Invalid JWKS URL: ${error}`);
    }
    return { mode: "remote", jwksUrl };
  }

  if (choice.startsWith("Local")) return { mode: "local" };

  return { mode: "none" };
}
