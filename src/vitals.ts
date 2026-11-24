// Groups vital-sign Observations by type. Matching is on LOINC code; everything else is an "other" vital.
import type { Resource } from "./fhir";
import { byDateDesc, conceptText, displayUnit, NOT_RECORDED, parseDate } from "./format";

const LOINC = "http://loinc.org";
export const BP_CODE = "85354-9";
export const SYSTOLIC = "8480-6";
export const DIASTOLIC = "8462-4";

export const KNOWN_TYPES: { key: string; label: string; codes: string[] }[] = [
  { key: "bp", label: "Blood pressure", codes: [BP_CODE] },
  { key: "hr", label: "Heart rate", codes: ["8867-4"] },
  { key: "temp", label: "Body temperature", codes: ["8310-5"] },
  { key: "rr", label: "Respiratory rate", codes: ["9279-1"] },
  { key: "spo2", label: "Oxygen saturation", codes: ["2708-6", "59408-5"] },
  { key: "height", label: "Height", codes: ["8302-2"] },
  { key: "weight", label: "Weight", codes: ["29463-7"] },
  { key: "bmi", label: "BMI", codes: ["39156-5"] },
];

export interface Reading {
  obs: Resource; // original resource, kept for the write-back
  date: Date | null;
  values: (number | null)[]; // [value] or [systolic, diastolic]
  unit: string | null; // raw unit (unit, else code)
  text: string | null; // non-numeric value text, if any
}

export interface VitalType {
  key: string;
  label: string;
  known: boolean;
  isBP: boolean;
  codes: string[]; // LOINC codes matched on (known types)
  readings: Reading[]; // most recent first
}

function loincCodes(cc: Resource | undefined): string[] {
  return (cc?.coding ?? []).filter((c: Resource) => c?.system === LOINC && c?.code).map((c: Resource) => String(c.code));
}

export function quantityUnit(q: Resource | undefined): string | null {
  return q?.unit ?? q?.code ?? null;
}

function num(q: Resource | undefined): number | null {
  const v = q?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function findComponent(obs: Resource, code: string): Resource | undefined {
  return (obs.component ?? []).find((c: Resource) => loincCodes(c?.code).includes(code));
}

function toReading(obs: Resource, isBP: boolean): Reading {
  const date = parseDate(obs.effectiveDateTime) ?? parseDate(obs.issued);
  if (isBP) {
    const s = findComponent(obs, SYSTOLIC);
    const d = findComponent(obs, DIASTOLIC);
    return {
      obs,
      date,
      values: [num(s?.valueQuantity), num(d?.valueQuantity)],
      unit: quantityUnit(s?.valueQuantity) ?? quantityUnit(d?.valueQuantity),
      text: null,
    };
  }
  const q = obs.valueQuantity;
  let text: string | null = null;
  if (num(q) === null) {
    if (typeof obs.valueString === "string") text = obs.valueString;
    else if (obs.valueCodeableConcept) text = conceptText(obs.valueCodeableConcept);
  }
  return { obs, date, values: [num(q)], unit: quantityUnit(q), text };
}

export function groupVitals(observations: Resource[]): VitalType[] {
  const known: VitalType[] = KNOWN_TYPES.map((t) => ({
    key: t.key,
    label: t.label,
    known: true,
    isBP: t.key === "bp",
    codes: t.codes,
    readings: [],
  }));
  const other = new Map<string, VitalType>();

  for (const obs of observations) {
    if (obs?.resourceType !== "Observation") continue;
    const codes = loincCodes(obs.code);
    const kt = known.find((t) => t.codes.some((c) => codes.includes(c)));
    if (kt) {
      kt.readings.push(toReading(obs, kt.isBP));
      continue;
    }
    const name = conceptText(obs.code);
    let t = other.get(name);
    if (!t) {
      t = { key: `other:${name}`, label: name, known: false, isBP: false, codes: [], readings: [] };
      other.set(name, t);
    }
    t.readings.push(toReading(obs, false));
  }
  const sort = byDateDesc<Reading>((r) => r.date);
  const all = [...known, ...other.values()];
  for (const t of all) t.readings.sort(sort);
  return all;
}

export function hasNumeric(r: Reading): boolean {
  return r.values.some((v) => v !== null);
}

/** The chart's unit: the unit of the most recent numeric reading. */
export function chartUnit(t: VitalType): string | null {
  return t.readings.find(hasNumeric)?.unit ?? null;
}

/** Plottable = has a date, a numeric value, and the chart unit. */
export function isPlottable(r: Reading, unit: string | null): boolean {
  return !!r.date && hasNumeric(r) && unit !== null && r.unit === unit;
}

export function formatReadingValue(t: VitalType, r: Reading): string {
  const u = displayUnit(r.unit);
  if (t.isBP) {
    const [s, d] = r.values;
    if (s === null && d === null) return NOT_RECORDED;
    return `${s ?? "–"}/${d ?? "–"}${u ? ` ${u}` : ""}`;
  }
  const v = r.values[0];
  if (v !== null) return `${v}${u ? ` ${u}` : ""}`;
  return r.text ?? NOT_RECORDED;
}
