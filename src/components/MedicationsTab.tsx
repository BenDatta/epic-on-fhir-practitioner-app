import { useState } from "react";
import type { Resource } from "../fhir";
import { byDateDesc, conceptText, formatDate, parseDate } from "../format";
import type { SectionState } from "../types";
import SectionStatus from "./SectionStatus";

const LIMIT = 10;

function drugName(m: Resource): string {
  if (m.medicationCodeableConcept) return conceptText(m.medicationCodeableConcept);
  if (m.medicationReference) return m.medicationReference.display ?? "Medication (details not available)";
  return "Not recorded";
}

export default function MedicationsTab({ state }: { state: SectionState<Resource[]> }) {
  const [showAll, setShowAll] = useState(false);
  if (state.status !== "ok") return <SectionStatus state={state} what="medications" />;

  const byDate = byDateDesc<Resource>((m) => parseDate(m.authoredOn));
  const meds = state.data
    .filter((r) => r.resourceType === "MedicationRequest")
    .sort((a, b) => {
      const aa = a.status === "active" ? 0 : 1;
      const bb = b.status === "active" ? 0 : 1;
      return aa - bb || byDate(a, b);
    });
  if (meds.length === 0) return <p className="muted">No medications on file.</p>;
  const shown = showAll ? meds : meds.slice(0, LIMIT);

  return (
    <div>
      <ul className="med-list">
        {shown.map((m, i) => (
          <li key={m.id ?? i} className="med">
            <div className="med-head">
              <strong>{drugName(m)}</strong>
              <span className={`tag ${m.status === "active" ? "tag-active" : ""}`}>{m.status ?? "Not recorded"}</span>
            </div>
            <div>{m.dosageInstruction?.[0]?.text ?? "No instructions on file"}</div>
            <div className="muted small">
              {m.authoredOn ? `Ordered ${formatDate(m.authoredOn)}` : "Order date not recorded"}
              {m.requester?.display ? ` · ${m.requester.display}` : ""}
            </div>
          </li>
        ))}
      </ul>
      {meds.length > LIMIT && (
        <button className="btn link" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show fewer" : `Show all (${meds.length})`}
        </button>
      )}
    </div>
  );
}
