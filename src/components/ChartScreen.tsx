import { useMemo, useState } from "react";
import type { ChartData } from "../App";
import { formatTime } from "../format";
import type { Session } from "../session";
import { groupVitals } from "../vitals";
import EncounterLine from "./EncounterLine";
import Logo from "./Logo";
import FhirPanel from "./FhirPanel";
import MedicationsTab from "./MedicationsTab";
import PatientBanner from "./PatientBanner";
import VitalsTab from "./VitalsTab";

interface Props {
  session: Session;
  data: ChartData;
  launchedThisLoad: boolean;
  onCloseSession: () => void;
  onExpired: () => void;
  onRefetchVitals: () => Promise<void>;
}

export default function ChartScreen({ session, data, launchedThisLoad, onCloseSession, onExpired, onRefetchVitals }: Props) {
  const [tab, setTab] = useState<"vitals" | "meds">("vitals");
  const [panelOpen, setPanelOpen] = useState(false);
  const groups = useMemo(() => (data.vitals.status === "ok" ? groupVitals(data.vitals.data) : []), [data.vitals]);

  return (
    <div className="chart-screen">
      <header className="app-header">
        <span className="app-title">
          <Logo size={26} inverted />
          VitalCheck
        </span>
        <div className="header-actions">
          <button type="button" className="btn small panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
            FHIR panel
          </button>
          <button type="button" className="btn small" onClick={onCloseSession}>
            Close session
          </button>
        </div>
      </header>

      <div className="layout">
        <main className="main-col">
          <PatientBanner state={data.patient} />
          <EncounterLine encounterId={session.encounter} state={data.encounter} />

          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "vitals"} className={`tab ${tab === "vitals" ? "on" : ""}`} onClick={() => setTab("vitals")}>
              Vitals
            </button>
            <button type="button" role="tab" aria-selected={tab === "meds"} className={`tab ${tab === "meds" ? "on" : ""}`} onClick={() => setTab("meds")}>
              Medications
            </button>
          </div>
          {/* Both tabs stay mounted so switching never refetches or loses state. */}
          <div role="tabpanel" hidden={tab !== "vitals"}>
            <VitalsTab state={data.vitals} groups={groups} session={session} onRefetch={onRefetchVitals} onExpired={onExpired} />
          </div>
          <div role="tabpanel" hidden={tab !== "meds"}>
            <MedicationsTab state={data.meds} />
          </div>

          <footer className="app-footer muted small">
            Data from {session.fhir_base_url} via Epic FHIR. Access token expires at {formatTime(new Date(session.expires_at))}.
          </footer>
        </main>

        <aside className={`side-col ${panelOpen ? "open" : ""}`}>
          <FhirPanel session={session} launchedThisLoad={launchedThisLoad} vitals={data.vitals} groups={groups} />
        </aside>
      </div>
    </div>
  );
}
