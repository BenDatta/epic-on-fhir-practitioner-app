// The one place that calls fetch. Each request is logged by the same function that sends it,
// with the same headers object, so the FHIR panel shows exactly what was sent.
import { addEntry, updateEntry, type Section } from "./log";

export const NETWORK_ERROR = "Could not reach Epic. Check your connection and try again.";

export interface HttpResult {
  logId: number;
  ok: boolean;
  status: number | null; // null on network failure
  text: string;
  json: unknown; // undefined when the body is empty or not JSON
  location: string | null;
  networkError: boolean;
}

export async function loggedFetch(
  section: Section,
  method: "GET" | "POST",
  url: string,
  headers: Record<string, string>,
  body: string | null = null,
): Promise<HttpResult> {
  const logId = addEntry({ section, method, url, requestHeaders: headers, requestBody: body });
  try {
    const res = await fetch(url, { method, headers, body: body ?? undefined });
    // Always read as text first; parse JSON only when non-empty. Never response.json().
    const text = await res.text();
    let json: unknown = undefined;
    if (text.trim() !== "") {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    // Location is only readable if Epic exposes it via CORS; null otherwise.
    const location = res.headers.get("Location");
    updateEntry(logId, { status: res.status, responseText: text, location });
    return { logId, ok: res.ok, status: res.status, text, json, location, networkError: false };
  } catch {
    updateEntry(logId, { networkError: NETWORK_ERROR });
    return { logId, ok: false, status: null, text: "", json: undefined, location: null, networkError: true };
  }
}
