import type { Resource } from "../fhir";
import { ageYears, capitalise, formatDate, NOT_RECORDED } from "../format";
import type { SectionState } from "../types";
import SectionStatus from "./SectionStatus";

function patientName(p: Resource): string {
  const names: Resource[] = Array.isArray(p.name) ? p.name : [];
  const n = names.find((x) => x?.use === "official") ?? names[0];
  if (!n) return NOT_RECORDED;
  if (n.text) return n.text;
  const s = [...(n.given ?? []), n.family ?? ""].join(" ").trim();
  return s || NOT_RECORDED;
}

function mrn(p: Resource): string | null {
  const id = (p.identifier ?? []).find(
    (i: Resource) =>
      (i?.type?.coding ?? []).some((c: Resource) => c?.code === "MR") ||
      (typeof i?.type?.text === "string" && i.type.text.includes("MRN")),
  );
  return id?.value ?? null;
}

export default function PatientBanner({ state }: { state: SectionState<Resource> }) {
  if (state.status !== "ok") {
    return (
      <section className="banner">
        <div className="banner-label">Showing chart for</div>
        <SectionStatus state={state} what="the patient" />
      </section>
    );
  }
  const p = state.data;
  const age = p.birthDate ? ageYears(p.birthDate) : null;
  const dob = p.birthDate ? `${formatDate(p.birthDate)}${age !== null ? ` (${age} y)` : ""}` : NOT_RECORDED;
  const m = mrn(p);
  return (
    <section className="banner" aria-label="Patient">
      <div className="banner-label">Showing chart for</div>
      <div className="banner-line">
        <strong className="banner-name">{patientName(p)}</strong>
        <span>DOB {dob}</span>
        <span>{capitalise(p.gender)}</span>
        {m && <span>MRN: {m}</span>}
      </div>
    </section>
  );
}
