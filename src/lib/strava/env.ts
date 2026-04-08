import "server-only";

/**
 * Centralized loader for Strava-related environment variables.
 *
 * Throws early with an explanatory message if anything is missing, so we
 * don't end up with "undefined" baked into OAuth URLs or callback addresses.
 * Call this from each route handler — it's cheap and the throw makes
 * misconfiguration loud.
 */
export interface StravaEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webhookVerifyToken: string;
  appUrl: string;
}

export function getStravaEnv(): StravaEnv {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;
  const webhookVerifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const missing: string[] = [];
  if (!clientId) missing.push("STRAVA_CLIENT_ID");
  if (!clientSecret) missing.push("STRAVA_CLIENT_SECRET");
  if (!redirectUri) missing.push("STRAVA_REDIRECT_URI");
  if (!webhookVerifyToken) missing.push("STRAVA_WEBHOOK_VERIFY_TOKEN");
  if (!appUrl) missing.push("NEXT_PUBLIC_APP_URL");

  if (missing.length > 0) {
    throw new Error(
      `Strava integration misconfigured — missing env vars: ${missing.join(", ")}`,
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    webhookVerifyToken: webhookVerifyToken!,
    appUrl: appUrl!,
  };
}
