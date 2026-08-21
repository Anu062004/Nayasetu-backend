import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  buildGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
  fetchGoogleVerifiedEmail,
  signOAuthState,
  verifyOAuthState,
} from "../../../adapters/google-oauth.js";
import { issueGoogleCitizenSession } from "../../../modules/identity/application/issue-google-session.js";
import { AppError } from "../errors.js";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

interface ResolvedGoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  frontendUrl: string;
  authUri: string;
  tokenUri: string;
  userinfoUri: string;
  pepper: string;
}

function requireLiveGoogleAuth(app: FastifyInstance): ResolvedGoogleAuthConfig {
  const google = app.config.authGoogle;
  const pepper = app.config.sessionTokenPepper;
  if (
    google.mode !== "LIVE" ||
    !google.clientId ||
    !google.clientSecret ||
    !google.redirectUri ||
    !google.frontendUrl ||
    app.config.authMode !== "SESSION" ||
    !pepper
  ) {
    throw new AppError(503, "CAPABILITY_UNAVAILABLE", "Google authentication is not configured");
  }
  return {
    clientId: google.clientId,
    clientSecret: google.clientSecret,
    redirectUri: google.redirectUri,
    frontendUrl: google.frontendUrl,
    authUri: google.authUri,
    tokenUri: google.tokenUri,
    userinfoUri: google.userinfoUri,
    pepper,
  };
}

export async function registerGoogleAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/auth/google/start",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      const google = requireLiveGoogleAuth(app);
      const state = signOAuthState(
        randomBytes(16).toString("base64url"),
        Date.now(),
        google.pepper,
      );
      const authorizationUrl = buildGoogleAuthorizationUrl(
        {
          clientId: google.clientId,
          clientSecret: google.clientSecret,
          redirectUri: google.redirectUri,
        },
        { authUri: google.authUri, tokenUri: google.tokenUri, userinfoUri: google.userinfoUri },
        state,
      );
      return reply.redirect(authorizationUrl);
    },
  );

  app.get(
    "/v1/auth/google/callback",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const query = request.query as { code?: unknown; state?: unknown; error?: unknown };
      if (typeof query.error === "string" && query.error.length > 0) {
        throw new AppError(400, "OAUTH_REQUEST_DENIED", "The authorization request was denied");
      }
      if (
        typeof query.code !== "string" ||
        query.code.length === 0 ||
        typeof query.state !== "string" ||
        query.state.length === 0
      ) {
        throw new AppError(400, "MISSING_OAUTH_PARAMETERS", "Missing authorization code or state");
      }
      const google = requireLiveGoogleAuth(app);
      if (!verifyOAuthState(query.state, google.pepper, STATE_MAX_AGE_MS)) {
        throw new AppError(400, "INVALID_OAUTH_STATE", "The OAuth state parameter is invalid");
      }
      let identity: { subject: string; email: string };
      try {
        const accessToken = await exchangeGoogleAuthorizationCode({
          client: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            redirectUri: google.redirectUri,
          },
          endpoints: { tokenUri: google.tokenUri },
          code: query.code,
        });
        identity = await fetchGoogleVerifiedEmail({
          accessToken,
          userinfoUri: google.userinfoUri,
        });
      } catch {
        throw new AppError(502, "IDENTITY_PROVIDER_UNAVAILABLE", "Google identity exchange failed");
      }
      const issued = await issueGoogleCitizenSession(app.db, {
        email: identity.email,
        pepper: google.pepper,
        ttlHours: app.config.sessionTtlHours,
        requestId: request.id,
      });
      const frontendUrl = new URL(google.frontendUrl);
      frontendUrl.hash = new URLSearchParams({
        sessionToken: issued.sessionToken,
        expiresAt: issued.expiresAt.toISOString(),
        userId: issued.userId,
        ...(issued.accountCreated ? { accountCreated: "true" } : {}),
      }).toString();
      return reply.redirect(frontendUrl.toString());
    },
  );
}
