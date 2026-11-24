// Writes a new vital as an Observation. Everything except the value is copied from the most
// recent reading Epic returned, so the code is one Epic already maps to a flowsheet row.
//
// Deviation from the spec ("copy code whole, do not remove codings"): Epic's sandbox returns
// vitals whose code carries several codings (for example LOINC 85354-9, LOINC 55284-4 and an
// Epic flowsheet ID). Each resolves to a flowsheet row, and a create that names more than one
// fails with "Multiple FLO IDs provided" (59101/59102). So we send exactly ONE coding, copied
// unchanged from the reading: the type's standard LOINC first, then Epic flowsheet IDs, then
// other codings. If Epic rejects the code itself, the next candidate is tried (max 3 attempts).
// Every attempt is a separate row in the FHIR panel.
import { useState } from "react";
import { createObservation, type Resource } from "../fhir";
import type { ErrInfo } from "../errors";
import { conceptText, displayUnit, formatTime } from "../format";
import type { Session } from "../session";
import { DIASTOLIC, findComponent, SYSTOLIC, type VitalType } from "../vitals";
import ErrorBox from "./ErrorBox";

const UCUM = "http://unitsofmeasure.org";

function usableQty(q: Resource | undefined): boolean {
  return !!q && typeof q.value === "number" && Number.isFinite(q.value) && !!(q.unit ?? q.code);
}

function qty(value: number, src: Resource) {
  return {
    value,
    unit: src.unit ?? src.code,
    system: src.system ?? UCUM,
    code: src.code ?? src.unit,
  };
}

const LOINC = "http://loinc.org";
const EPIC_OID = "1.2.840.114350"; // Epic's OID root; flowsheet row IDs live under it
const MAX_ATTEMPTS = 3;

/** Single-coding versions of the reading's code, most likely to be accepted first. */
function codeCandidates(code: Resource | undefined, preferredLoinc: string[]): Resource[] {
  const codings: Resource[] = Array.isArray(code?.coding) ? code!.coding : [];
  const out: Resource[] = [];
  const seen = new Set<string>();
  const push = (c: Resource | undefined) => {
    if (!c?.code) return;
    const k = `${c.system}|${c.code}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ coding: [c], ...(code?.text ? { text: code.text } : {}) });
  };
  push(codings.find((c) => c?.system === LOINC && preferredLoinc.includes(c.code)));
  codings.filter((c) => typeof c?.system === "string" && c.system.includes(EPIC_OID)).forEach(push);
  codings.filter((c) => c?.system === LOINC).forEach(push);
  codings.forEach(push);
  return out.length ? out.slice(0, MAX_ATTEMPTS) : code ? [code] : [];
}

/** A BP component's code reduced to its matching LOINC coding (the one we matched it on). */
function componentCode(code: Resource | undefined, loinc: string): Resource | undefined {
  const c = (code?.coding ?? []).find((x: Resource) => x?.system === LOINC && x?.code === loinc);
  return c ? { coding: [c], ...(code?.text ? { text: code.text } : {}) } : code;
}

function describeCode(code: Resource | undefined): string {
  const c = code?.coding?.[0];
  if (!c?.code) return "code not recorded";
  if (c.system === LOINC) return `LOINC ${c.code}`;
  if (typeof c.system === "string" && c.system.includes(EPIC_OID)) return `Epic flowsheet ID ${c.code}`;
  return `code ${c.code}`;
}

/** True when Epic's 400 is about the code / flowsheet row, so another coding is worth trying. */
function isCodeProblem(e: ErrInfo): boolean {
  return e.status === 400 && /FLO|flowsheet|\/f:code|5918[7-9]|5910[12]/i.test(`${e.message} ${e.details ?? ""}`);
}

const validNum = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

interface Props {
  type: VitalType;
  session: Session;
  onSaved: () => Promise<void>;
  onExpired: () => void;
}

export default function AddReading({ type, session, onSaved, onExpired }: Props) {
  const [openedAt] = useState(() => new Date());
  const [v1, setV1] = useState("");
  const [v2, setV2] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<ErrInfo | null>(null);

  const latest = type.readings[0]?.obs as Resource | undefined;
  const sysC = latest && type.isBP ? findComponent(latest, SYSTOLIC) : undefined;
  const diaC = latest && type.isBP ? findComponent(latest, DIASTOLIC) : undefined;

  let reason: string | null = null;
  if (!latest) reason = "No existing reading to copy the code and unit from";
  else if (!session.encounter) reason = "No encounter in this launch. Epic needs an open visit to file a vital.";
  else if (type.isBP ? !(usableQty(sysC?.valueQuantity) && usableQty(diaC?.valueQuantity)) : !usableQty(latest.valueQuantity))
    reason = "The latest reading has no numeric value and unit to copy.";

  if (reason || !latest) {
    return (
      <section className="card add-reading disabled" aria-disabled="true">
        <h3>Add a reading</h3>
        <p className="muted">{reason}</p>
      </section>
    );
  }

  const candidates = codeCandidates(latest.code, type.codes);
  const unit1 = type.isBP ? sysC!.valueQuantity : latest.valueQuantity;
  const unit2 = type.isBP ? diaC!.valueQuantity : null;
  const canSave = !saving && validNum(v1) && (!type.isBP || validNum(v2));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    const base = (code: Resource): Resource => {
      const body: Resource = {
        resourceType: "Observation",
        status: "final",
        category: [
          {
            coding: [
              { system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" },
            ],
          },
        ],
        code, // one coding copied unchanged from Epic's reading, never built from the LOINC table
        subject: { reference: `Patient/${session.patient}` },
        encounter: { reference: `Encounter/${session.encounter}` },
        effectiveDateTime: new Date().toISOString(),
      };
      if (type.isBP) {
        body.component = [
          { code: componentCode(sysC!.code, SYSTOLIC), valueQuantity: qty(Number(v1), sysC!.valueQuantity) },
          { code: componentCode(diaC!.code, DIASTOLIC), valueQuantity: qty(Number(v2), diaC!.valueQuantity) },
        ];
      } else {
        body.valueQuantity = qty(Number(v1), latest.valueQuantity);
      }
      return body;
    };

    let newId: string | null = null;
    let usedCode: Resource | null = null;
    let lastError: ErrInfo | null = null;
    const tried: Resource[] = [];
    for (const code of candidates) {
      tried.push(code);
      const res = await createObservation(session, base(code));
      if (res.kind === "unauthorized") {
        setSaving(false);
        return onExpired();
      }
      if (res.kind === "ok") {
        newId = res.newId;
        usedCode = code;
        lastError = null;
        break;
      }
      lastError = res.error;
      if (!isCodeProblem(res.error)) break; // e.g. closed encounter: another code will not help
    }
    setSaving(false);
    if (lastError || !usedCode) {
      const triedText = tried.length > 1 ? ` Tried ${tried.length} codes: ${tried.map(describeCode).join(", ")}.` : "";
      setError(lastError ? { ...lastError, message: lastError.message + triedText } : { message: "Nothing was sent." });
      return; // typed values are kept
    }
    const via = usedCode !== candidates[0] ? ` Filed with ${describeCode(usedCode)}.` : "";
    setSaved(`Saved. Reading ${newId ?? "created"} is now in the chart.${via}`);
    setV1("");
    setV2("");
    await onSaved();
  };

  const input = (label: string, value: string, set: (s: string) => void, q: Resource) => (
    <label className="field inline">
      <span>{label}</span>
      <span className="input-unit">
        <input type="number" step="any" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
        <span className="unit-suffix">{displayUnit(q.unit ?? q.code)}</span>
      </span>
    </label>
  );

  return (
    <section className="card add-reading">
      <h3>Add a reading</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="add-inputs">
          {type.isBP ? (
            <>
              {input("Systolic", v1, setV1, unit1)}
              {input("Diastolic", v2, setV2, unit2!)}
            </>
          ) : (
            input("Value", v1, setV1, unit1)
          )}
        </div>
        <p className="muted small">
          Will be filed as {conceptText(latest.code)} ({describeCode(candidates[0])}) at {formatTime(openedAt)} for Encounter/
          {session.encounter}.
        </p>
        <button type="submit" className="btn primary" disabled={!canSave}>
          {saving ? "Saving…" : "Save to Epic"}
        </button>
      </form>
      {saved && <p className="success">{saved}</p>}
      {error && <ErrorBox error={error} />}
    </section>
  );
}
