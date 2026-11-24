// SMART on FHIR EHR launch with PKCE, implemented with fetch and Web Crypto only.
import { REDIRECT_URI, SCOPES } from "./config";
import { AppError } from "./errors";
import { loggedFetch, NETWORK_ERROR as NETWORK_ERROR_MSG } from "./http";
import {
  deleteLaunchEntry,
  loadLaunchEntry,
  saveLaunchEntry,
  saveSession,
  type Session,
} from "./session";

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64url(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256Base64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64url(new Uint8Array(digest));
}

/** Validates iss and returns the FHIR base URL with any trailing slash removed. */
export function normaliseIss(iss: string): string {
  const trimmed = iss.trim();
  if (!trimmed.startsWith("https://")) {
    throw new AppError({ message: "The FHIR base URL must use https." });
  }
  return trimmed.replace(/\/+$/, "");
}

export type LaunchStep = "discover" | "redirect";

/**
 * Runs discovery, PKCE and the redirect to Epic's authorize endpoint.
 * Used for both an EHR launch and the manual launch form.
 */
export async function startLaunch(
  issRaw: string,
  launch: string,
  clientId: string,
  onStepDone: (step: LaunchStep) => void,
): Promise<void> {
  const iss = normaliseIss(issRaw);

  // 1. Discovery. Single header, no Authorization.
  const discoveryHeaders = { Accept: "application/json" };
  const res = await loggedFetch("discovery", "GET", `${iss}/.well-known/smart-configuration`, discoveryHeaders);
  const failMsg = `Could not discover Epic's OAuth endpoints from ${iss}.`;
  if (res.networkError) {
    throw new AppError({ message: `${failMsg} ${NETWORK_ERROR_MSG}` });
  }
  const doc = res.json as { authorization_endpoint?: unknown; token_endpoint?: unknown } | undefined;
  const authorization_endpoint = typeof doc?.authorization_endpoint === "string" ? doc.authorization_endpoint : "";
  const token_endpoint = typeof doc?.token_endpoint === "string" ? doc.token_endpoint : "";
  if (!res.ok || !authorization_endpoint || !token_endpoint) {
    throw new AppError({ message: failMsg, status: res.status, details: res.text || "Empty response body." });
  }
  onStepDone("discover");

  // 2. PKCE + state.
  const code_verifier = randomBase64url(64);
  const code_challenge = await sha256Base64url(code_verifier);
  const state = randomBase64url(32);

  // Keyed by state so two Hyperspace windows sharing storage cannot overwrite each other.
  saveLaunchEntry(state, { code_verifier, iss, authorization_endpoint, token_endpoint, client_id: clientId, launch });

  // 3. Authorize URL. The launch token is passed through untouched and never decoded.
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    aud: iss,
    launch,
    code_challenge,
    code_challenge_method: "S256",
  });
  const url = new URL(authorization_endpoint);
  // Keep any query the endpoint already has, then append ours.
  for (const [k, v] of params) url.searchParams.set(k, v);
  onStepDone("redirect");
  window.location.assign(url.toString());
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Handles ?code&state: verifies state, exchanges the code, saves vc_session. */
export async function completeCallback(code: string, state: string): Promise<Session> {
  const entry = state ? loadLaunchEntry(state) : null;
  if (!entry) {
    throw new AppError({ message: "Launch could not be verified (unknown state). Start the launch again from Epic." });
  }
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: entry.client_id,
      code_verifier: entry.code_verifier,
    }).toString();
    // Content-Type only. No Authorization, no client_secret, no Accept: this is a public client.
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    const res = await loggedFetch("token", "POST", entry.token_endpoint, headers, body);
    if (res.networkError) throw new AppError({ message: NETWORK_ERROR_MSG });
    if (res.status !== 200) {
      throw new AppError({
        message: `The token exchange failed (HTTP ${res.status}).`,
        status: res.status,
        details: res.text || "Empty response body.",
      });
    }
    const t = res.json as Record<string, unknown> | undefined;
    if (!t || typeof t.access_token !== "string" || typeof t.patient !== "string") {
      throw new AppError({
        message: "The token response did not contain an access token and a patient.",
        status: res.status,
        details: res.text,
      });
    }
    const expiresIn = Number(t.expires_in);
    let fhirUser: string | null = null;
    if (typeof t.id_token === "string") {
      const payload = decodeJwtPayload(t.id_token);
      if (payload && typeof payload.fhirUser === "string") fhirUser = payload.fhirUser;
    }
    const session: Session = {
      access_token: t.access_token,
      // expires_in comes from Epic; no lifetime is hardcoded. If it is missing the session is
      // treated as already expired, which sends the clinician back to relaunch.
      expires_at: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : Date.now(),
      patient: t.patient,
      encounter: typeof t.encounter === "string" && t.encounter ? t.encounter : null,
      fhir_base_url: entry.iss,
      token_endpoint: entry.token_endpoint,
      scope: typeof t.scope === "string" ? t.scope : "",
      fhirUser,
    };
    saveSession(session);
    return session;
  } finally {
    deleteLaunchEntry(state);
  }
}
