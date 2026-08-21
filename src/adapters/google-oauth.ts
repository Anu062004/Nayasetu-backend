import { createHmac, timingSafeEqual } from "node:crypto";

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleOAuthEndpointConfig {
  authUri: string;
  tokenUri: string;
  userinfoUri: string;
}

export function buildGoogleAuthorizationUrl(
  client: GoogleOAuthClientConfig,
  endpoints: GoogleOAuthEndpointConfig,
  state: string,
): string {
  const url = new URL(endpoints.authUri);
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", client.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function signOAuthState(nonce: string, issuedAtMs: number, pepper: string): string {
  const payload = `${nonce}.${issuedAtMs}`;
  const signature = createHmac("sha256", pepper).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string, pepper: string, maxAgeMs: number): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, issuedAtMs, signature] = parts;
  if (!nonce || !issuedAtMs || !signature) return false;
  const expected = createHmac("sha256", pepper)
    .update(`${nonce}.${issuedAtMs}`)
    .digest("base64url");
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
    return false;
  }
  const issuedAt = Number(issuedAtMs);
  if (!Number.isFinite(issuedAt)) return false;
  const now = Date.now();
  if (now < issuedAt - 60_000) return false;
  return now - issuedAt <= maxAgeMs;
}

export interface GoogleVerifiedIdentity {
  subject: string;
  email: string;
}

export async function exchangeGoogleAuthorizationCode(input: {
  client: GoogleOAuthClientConfig;
  endpoints: Pick<GoogleOAuthEndpointConfig, "tokenUri">;
  code: string;
}): Promise<string> {
  const response = await fetch(input.endpoints.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.client.redirectUri,
      client_id: input.client.clientId,
      client_secret: input.client.clientSecret,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed with status ${response.status}`);
  }
  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
    throw new Error("Google token exchange returned no access token");
  }
  return payload.access_token;
}

export async function fetchGoogleVerifiedEmail(input: {
  accessToken: string;
  userinfoUri: string;
}): Promise<GoogleVerifiedIdentity> {
  const response = await fetch(input.userinfoUri, {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google userinfo request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
  };
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Google userinfo response is missing a subject identifier");
  }
  if (typeof payload.email !== "string" || !payload.email.includes("@")) {
    throw new Error("Google userinfo response is missing a usable email");
  }
  if (payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }
  return { subject: payload.sub, email: payload.email };
}
