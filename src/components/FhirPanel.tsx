// Learner panel. It shows the real access token and raw payloads on purpose. That is acceptable
// only because this app runs against the Epic sandbox with test patients. Remove the token and
// the payloads from this panel before using the app with real patient data.
import { useState } from "react";
import type { Resource } from "../fhir";
import { displayUnit, formatDateTime } from "../format";
import { useLog, type LogEntry, type Section } from "../log";
import type { Session } from "../session";
import type { SectionState } from "../types";
import { chartUnit, isPlottable, type VitalType } from "../vitals";

const GROUPS: { section: Section; label: string }[] = [
  { section: "discovery", label: "Discovery" },
  { section: "token", label: "Token" },
  { section: "patient", label: "Patient" },
  { section: "encounter", label: "Encounter" },
  { section: "vitals", label: "Vitals" },
  { section: "medications", label: "Medications" },
  { section: "create", label: "Writes" },
];

const REUSED = "No request was made on this page load. The saved session was reused. Launch again from Epic to see it.";

function prettyBody(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function requestBodyText(e: LogEntry): string {
  if (e.requestBody === null) return "No request body. GET requests do not send one.";
  if (e.section === "token") return e.requestBody.split("&").join("\n");
  return prettyBody(e.requestBody);
}

function Row({ e }: { e: LogEntry }) {
  const [open, setOpen] = useState(false);
  const status = e.networkError ? "network error" : e.status === null ? "…" : String(e.status);
  const bad = e.networkError || (e.status !== null && (e.status < 200 || e.status >= 300));
  return (
    <li className="log-row">
      <button type="button" className="log-summary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="log-method">{e.method}</span>
        <span className={`log-status ${bad ? "bad" : ""}`}>{status}</span>
        {e.count !== null && <span className="log-count">{e.count} resources</span>}
        <span className="log-url">{e.url}</span>
      </button>
      {open && (
        <div className="log-detail">
          <h5>Request headers</h5>
          <pre className="payload">{Object.entries(e.requestHeaders).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
          <h5>Request body</h5>
          <pre className="payload">{requestBodyText(e)}</pre>
          <h5>Response body</h5>
          <pre className="payload">
            {e.networkError
              ? e.networkError
              : e.responseText === null
                ? "Waiting for response…"
                : e.responseText.trim() === ""
                  ? `Empty response body.${e.section === "create" ? `\nLocation: ${e.location ?? "(not present or not exposed to the browser)"}` : ""}`
                  : prettyBody(e.responseText)}
          </pre>
        </div>
      )}
    </li>
  );
}

function Grouping({ observations, groups }: { observations: number; groups: VitalType[] }) {
  const withData = groups.filter((g) => g.readings.length);
  return (
    <div className="grouping">
      <h5>How the response was grouped</h5>
      <p>
        {observations} observation{observations === 1 ? "" : "s"} grouped into {withData.length} vital type
        {withData.length === 1 ? "" : "s"}.
      </p>
      {withData.length > 0 && (
        <div className="table-scroll">
          <table className="readings small">
            <thead>
              <tr>
                <th>Type</th>
                <th>Matched on</th>
                <th className="num">Readings</th>
                <th className="num">On graph</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {withData.map((g) => {
                const unit = chartUnit(g);
                return (
                  <tr key={g.key}>
                    <td>{g.label}</td>
                    <td>{g.known ? `LOINC ${g.codes.join(", ")}` : "code text"}</td>
                    <td className="num">{g.readings.length}</td>
                    <td className="num">{g.readings.filter((r) => isPlottable(r, unit)).length}</td>
                    <td>{unit ? displayUnit(unit) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface Props {
  session: Session;
  launchedThisLoad: boolean;
  vitals: SectionState<Resource[]>;
  groups: VitalType[];
}

export default function FhirPanel({ session, launchedThisLoad, vitals, groups }: Props) {
  const log = useLog();
  return (
    <div className="fhir-panel">
      <h2>FHIR panel</h2>
      <dl className="kv">
        <dt>FHIR base URL</dt>
        <dd>{session.fhir_base_url}</dd>
        <dt>Patient ID</dt>
        <dd>{session.patient}</dd>
        <dt>Encounter ID</dt>
        <dd>{session.encounter ?? "none"}</dd>
        <dt>fhirUser</dt>
        <dd>{session.fhirUser ?? "Not in ID token"}</dd>
        <dt>Granted scope</dt>
        <dd>{session.scope || "Not recorded"}</dd>
        <dt>Expires at</dt>
        <dd>{formatDateTime(new Date(session.expires_at))}</dd>
      </dl>

      {GROUPS.map(({ section, label }) => {
        const rows = log.filter((e) => e.section === section);
        const reused = !launchedThisLoad && (section === "discovery" || section === "token");
        if (rows.length === 0 && !reused && section !== "vitals") return null;
        return (
          <section key={section} className="log-group">
            <h4>{label}</h4>
            {rows.length === 0 && reused && <p className="muted small">{REUSED}</p>}
            {rows.length === 0 && section === "vitals" && <p className="muted small">No request yet.</p>}
            {rows.length > 0 && (
              <ul className="log-list">
                {rows.map((e) => (
                  <Row key={e.id} e={e} />
                ))}
              </ul>
            )}
            {section === "vitals" && vitals.status === "ok" && <Grouping observations={vitals.data.length} groups={groups} />}
          </section>
        );
      })}
    </div>
  );
}
