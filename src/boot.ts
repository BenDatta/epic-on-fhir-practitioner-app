// Decides what to do on page load from the query string and sessionStorage (spec section 4).
// Runs once, synchronously, before React renders anything.
import type { ErrInfo } from "./errors";
import { SESSION_EXPIRED } from "./errors";
import { clearSession, isSessionValid, loadSession, type Session } from "./session";

export type Boot =
  | { kind: "ehr"; iss: string; launch: string }
  | { kind: "error"; error: ErrInfo }
  | { kind: "callback"; code: string; state: string }
  | { kind: "resume"; session: Session }
  | { kind: "fresh"; error?: ErrInfo };

function clearQuery() {
  history.replaceState({}, "", "/");
}

export function decideBoot(): Boot {
  const q = new URLSearchParams(window.location.search);
  const iss = q.get("iss"); // URLSearchParams has already decoded it
  const launch = q.get("launch");
  const error = q.get("error");
  const code = q.get("code");

  // Case 1: EHR launch. Always starts fresh, even if a valid session exists.
  if (iss && launch) {
    clearQuery();
    return { kind: "ehr", iss, launch };
  }
  // Only one of iss / launch: treated like case 2.
  if (iss || launch) {
    clearQuery();
    return { kind: "error", error: { message: "Incomplete launch. Both iss and launch are required." } };
  }
  // Case 2: OAuth error from the redirect, shown verbatim.
  if (error !== null) {
    const desc = q.get("error_description");
    clearQuery();
    return { kind: "error", error: { message: desc ? `${error}: ${desc}` : error } };
  }
  // Case 3: callback. Cleared immediately so a refresh never resends a used code.
  if (code !== null) {
    const state = q.get("state") ?? "";
    clearQuery();
    return { kind: "callback", code, state };
  }
  // Case 4: page refresh.
  const saved = loadSession();
  if (isSessionValid(saved)) return { kind: "resume", session: saved };
  if (saved) {
    clearSession();
    return { kind: "fresh", error: { message: SESSION_EXPIRED } };
  }
  return { kind: "fresh" };
}
