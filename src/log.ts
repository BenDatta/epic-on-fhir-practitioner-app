// In-memory request log behind the FHIR panel. Never persisted (spec section 9).
import { useSyncExternalStore } from "react";

export type Section =
  | "discovery"
  | "token"
  | "patient"
  | "encounter"
  | "vitals"
  | "medications"
  | "create";

export interface LogEntry {
  id: number;
  section: Section;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  status: number | null; // null while pending or on network failure
  responseText: string | null;
  location: string | null;
  count: number | null; // resources returned, for searches
  networkError: string | null;
}

let entries: LogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function addEntry(e: Omit<LogEntry, "id" | "status" | "responseText" | "location" | "count" | "networkError">): number {
  const id = nextId++;
  entries = [...entries, { ...e, id, status: null, responseText: null, location: null, count: null, networkError: null }];
  emit();
  return id;
}

export function updateEntry(id: number, patch: Partial<LogEntry>) {
  entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
  emit();
}

export function clearLog() {
  entries = [];
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLog(): LogEntry[] {
  return useSyncExternalStore(subscribe, () => entries);
}
