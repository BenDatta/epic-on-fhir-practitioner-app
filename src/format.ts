import type { Resource } from "./fhir";

export const NOT_RECORDED = "Not recorded";

/** General rule: .text, else coding[0].display, else coding[0].code labelled "(code)". */
export function conceptText(cc: Resource | undefined | null): string {
  if (!cc) return NOT_RECORDED;
  if (typeof cc.text === "string" && cc.text.trim()) return cc.text;
  const c = Array.isArray(cc.coding) ? cc.coding[0] : undefined;
  if (c?.display) return c.display;
  if (c?.code) return `${c.code} (code)`;
  return NOT_RECORDED;
}

const UNIT_DISPLAY: Record<string, string> = {
  "mm[Hg]": "mmHg",
  Cel: "°C",
  "[degF]": "°F",
  "[lb_av]": "lb",
  "[oz_av]": "oz",
  "[in_i]": "in",
  "kg/m2": "kg/m²",
  "{beats}/min": "/min",
  "{breaths}/min": "/min",
};

/** Display mapping only. Never used for what is sent to Epic. */
export function displayUnit(u: string | null | undefined): string {
  if (!u) return "";
  return UNIT_DISPLAY[u] ?? u;
}

export function parseDate(s: unknown): Date | null {
  if (typeof s !== "string" || !s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** "12 Mar 1987". Date-only strings are parsed as local dates so the day does not shift. */
export function formatDate(s: string | null | undefined): string {
  if (!s) return NOT_RECORDED;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : parseDate(s);
  if (!d) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(d: Date | null): string {
  if (!d) return NOT_RECORDED;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${formatTime(d)}`;
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function ageYears(birthDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return null;
  const now = new Date();
  let age = now.getFullYear() - +m[1];
  if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) age--;
  return age;
}

export function capitalise(s: string | undefined | null): string {
  if (!s) return NOT_RECORDED;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Most recent first; missing dates last. */
export function byDateDesc<T>(get: (t: T) => Date | null) {
  return (a: T, b: T) => {
    const da = get(a);
    const db = get(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.getTime() - da.getTime();
  };
}
