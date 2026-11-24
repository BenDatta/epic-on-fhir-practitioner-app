// sessionStorage only. Nothing is ever written to localStorage or cookies.

export interface Session {
  access_token: string;
  expires_at: number;
  patient: string;
  encounter: string | null;
  fhir_base_url: string;
  token_endpoint: string;
  scope: string;
  fhirUser: string | null;
}

export interface LaunchEntry {
  code_verifier: string;
  iss: string;
  authorization_endpoint: string;
  token_endpoint: string;
  client_id: string;
  launch: string;
}

const SESSION_KEY = "vc_session";
export const launchKey = (state: string) => `vc_launch_${state}`;

function safeGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadSession(): Session | null {
  const raw = safeGet(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function isSessionValid(s: Session | null): s is Session {
  return !!s && typeof s.expires_at === "number" && s.expires_at > Date.now() + 30000;
}

export function saveSession(s: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function clearAllStorage() {
  try {
    sessionStorage.clear();
  } catch {
    /* storage unavailable */
  }
}

export function saveLaunchEntry(state: string, entry: LaunchEntry) {
  sessionStorage.setItem(launchKey(state), JSON.stringify(entry));
}

export function loadLaunchEntry(state: string): LaunchEntry | null {
  const raw = safeGet(launchKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LaunchEntry;
  } catch {
    return null;
  }
}

export function deleteLaunchEntry(state: string) {
  try {
    sessionStorage.removeItem(launchKey(state));
  } catch {
    /* storage unavailable */
  }
}
