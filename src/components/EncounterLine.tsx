import type { Resource } from "../fhir";
import { formatDateTime, parseDate } from "../format";
import type { SectionState } from "../types";

export default function EncounterLine({ encounterId, state }: { encounterId: string | null; state: SectionState<Resource> }) {
  if (!encounterId) {
    return <p className="encounter amber">Visit: none in this launch. New readings cannot be saved.</p>;
  }
  if (state.status === "loading") return <p className="encounter muted">Visit: loading…</p>;
  if (state.status !== "ok") {
    return <p className="encounter">Visit: Encounter/{encounterId} (details could not be loaded)</p>;
  }
  const e = state.data;
  const cls = e.class?.display ?? e.class?.code ?? "Visit";
  const start = parseDate(e.period?.start);
  const where = e.serviceProvider?.display ?? e.location?.[0]?.location?.display;
  return (
    <p className="encounter">
      Visit: {cls} · {e.status ?? "status not recorded"} · started {start ? formatDateTime(start) : "start not recorded"}
      {where ? ` · ${where}` : ""}
    </p>
  );
}
