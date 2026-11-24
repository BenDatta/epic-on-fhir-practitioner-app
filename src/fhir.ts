// FHIR reads, searches (with pagination) and the Observation create.
import type { ErrInfo } from "./errors";
import { loggedFetch, NETWORK_ERROR, type HttpResult } from "./http";
import { updateEntry, type Section } from "./log";
import type { Session } from "./session";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Resource = Record<string, any>;

export type FetchResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "error"; error: ErrInfo };

const MAX_NEXT_LINKS = 5;

function readHeaders(s: Session): Record<string, string> {
  return { Authorization: `Bearer ${s.access_token}`, Accept: "application/fhir+json" };
}

function outcomeText(oo: Resource | undefined): string | null {
  const issue = oo?.issue?.[0];
  return issue?.diagnostics ?? issue?.details?.text ?? null;
}

function httpFailure<T>(res: HttpResult): FetchResult<T> {
  if (res.networkError) return { kind: "error", error: { message: NETWORK_ERROR } };
  if (res.status === 401) return { kind: "unauthorized" };
  if (res.status === 403) return { kind: "forbidden" };
  const oo = (res.json as Resource | undefined)?.resourceType === "OperationOutcome" ? (res.json as Resource) : undefined;
  const text = outcomeText(oo);
  return {
    kind: "error",
    error: {
      message: `Epic returned HTTP ${res.status}${text ? `: ${text}` : "."}`,
      status: res.status,
      details: res.text || "Empty response body.",
    },
  };
}

export async function readResource(section: Section, s: Session, path: string): Promise<FetchResult<Resource>> {
  const res = await loggedFetch(section, "GET", `${s.fhir_base_url}/${path}`, readHeaders(s));
  if (!res.ok) return httpFailure(res);
  const json = res.json as Resource | undefined;
  if (!json) {
    return { kind: "error", error: { message: "Epic returned a response that is not JSON.", status: res.status, details: res.text || "Empty response body." } };
  }
  return { kind: "ok", data: json };
}

export async function searchAll(section: Section, s: Session, path: string): Promise<FetchResult<Resource[]>> {
  const headers = readHeaders(s);
  let url: string | null = `${s.fhir_base_url}/${path}`;
  const all: Resource[] = [];
  let nextFollowed = 0;
  let firstPage = true;

  while (url) {
    const res = await loggedFetch(section, "GET", url, headers);
    if (!res.ok) {
      // A failed first page fails the section. A failed later page keeps what we already have.
      if (firstPage) return httpFailure(res);
      break;
    }
    const bundle = res.json as Resource | undefined;
    if (!bundle) {
      if (firstPage) {
        return { kind: "error", error: { message: "Epic returned a response that is not JSON.", status: res.status, details: res.text || "Empty response body." } };
      }
      break;
    }
    const entries: Resource[] = Array.isArray(bundle.entry) ? bundle.entry : [];
    const resources: Resource[] = [];
    const outcomes: Resource[] = [];
    for (const e of entries) {
      const r = e?.resource;
      if (!r) continue;
      if (r.resourceType === "OperationOutcome") outcomes.push(r);
      else resources.push(r);
    }
    if (bundle.resourceType === "OperationOutcome") outcomes.push(bundle);
    updateEntry(res.logId, { count: resources.length });

    if (resources.length === 0 && outcomes.length > 0 && firstPage) {
      const errorOutcome = outcomes.find((o) =>
        (o.issue ?? []).some((i: Resource) => i?.severity === "error" || i?.severity === "fatal"),
      );
      if (errorOutcome) {
        return {
          kind: "error",
          error: { message: outcomeText(errorOutcome) ?? "Epic returned an error.", status: res.status, details: res.text },
        };
      }
    }
    all.push(...resources);
    firstPage = false;

    const next: string | undefined = (bundle.link ?? []).find((l: Resource) => l?.relation === "next")?.url;
    if (next && nextFollowed < MAX_NEXT_LINKS) {
      nextFollowed++;
      url = next;
    } else {
      url = null;
    }
  }
  return { kind: "ok", data: all };
}

export type CreateResult =
  | { kind: "ok"; newId: string | null }
  | { kind: "unauthorized" }
  | { kind: "error"; error: ErrInfo };

export async function createObservation(s: Session, body: Resource): Promise<CreateResult> {
  const headers = {
    Authorization: `Bearer ${s.access_token}`,
    Accept: "application/fhir+json",
    "Content-Type": "application/fhir+json",
  };
  const res = await loggedFetch("create", "POST", `${s.fhir_base_url}/Observation`, headers, JSON.stringify(body, null, 2));
  if (res.networkError) return { kind: "error", error: { message: NETWORK_ERROR } };
  if (res.status === 401) return { kind: "unauthorized" };
  if (res.ok) {
    const m = res.location?.match(/\/Observation\/([^/?#]+)/);
    const fromBody = (res.json as Resource | undefined)?.id;
    return { kind: "ok", newId: m?.[1] ?? (typeof fromBody === "string" ? fromBody : null) };
  }
  const oo = (res.json as Resource | undefined)?.resourceType === "OperationOutcome" ? (res.json as Resource) : undefined;
  const text = outcomeText(oo);
  return {
    kind: "error",
    error: {
      message: text ? `Epic did not save the reading (HTTP ${res.status}): ${text}` : `Epic did not save the reading (HTTP ${res.status}).`,
      status: res.status,
      details: res.text || "Empty response body.",
    },
  };
}
