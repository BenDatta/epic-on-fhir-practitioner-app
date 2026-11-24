import { useEffect, useMemo, useState } from "react";
import type { Resource } from "../fhir";
import { displayUnit, formatDateTime, NOT_RECORDED, plural } from "../format";
import type { Session } from "../session";
import type { SectionState } from "../types";
import { chartUnit, formatReadingValue, isPlottable, type Reading, type VitalType } from "../vitals";
import AddReading from "./AddReading";
import SectionStatus from "./SectionStatus";
import Segmented from "./Segmented";
import VitalsChart from "./VitalsChart";

type Range = "all" | "30" | "90" | "365" | "custom";
type ViewMode = "graph" | "table";
const TABLE_LIMIT = 10;

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
  { value: "custom", label: "Custom" },
];

function toInputDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fromInputDate(s: string, endOfDay: boolean): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return endOfDay ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999) : new Date(+m[1], +m[2] - 1, +m[3]);
}

interface TabProps {
  state: SectionState<Resource[]>;
  groups: VitalType[];
  session: Session;
  onRefetch: () => Promise<void>;
  onExpired: () => void;
}

export default function VitalsTab({ state, groups, session, onRefetch, onExpired }: TabProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Select the first type with data on load, and again if the selected type disappears.
  useEffect(() => {
    if (selectedKey && groups.some((g) => g.key === selectedKey && g.readings.length)) return;
    setSelectedKey(groups.find((g) => g.readings.length)?.key ?? null);
  }, [groups, selectedKey]);

  if (state.status !== "ok") return <SectionStatus state={state} what="vitals" />;

  const known = groups.filter((g) => g.known);
  const other = groups.filter((g) => !g.known);
  const selected = groups.find((g) => g.key === selectedKey) ?? null;

  const tile = (g: VitalType) => {
    const latest = g.readings[0];
    if (!latest) {
      return (
        <div key={g.key} className="tile empty" aria-disabled="true">
          <div className="tile-label">{g.label}</div>
          <div className="tile-value muted">Not recorded</div>
        </div>
      );
    }
    const on = g.key === selectedKey;
    return (
      <button key={g.key} type="button" className={`tile ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setSelectedKey(g.key)}>
        <div className="tile-label">{g.label}</div>
        <div className="tile-value">{formatReadingValue(g, latest)}</div>
        <div className="tile-meta">{latest.date ? formatDateTime(latest.date) : "Date not recorded"}</div>
        <div className="tile-meta">{plural(g.readings.length, "reading")}</div>
      </button>
    );
  };

  return (
    <div>
      {state.data.length === 0 && <p className="muted">No vital signs on file for this patient.</p>}
      <div className="tiles">{known.map(tile)}</div>
      {other.length > 0 && (
        <>
          <h3 className="subhead">Other vitals</h3>
          <div className="tiles">{other.map(tile)}</div>
        </>
      )}
      {/* Keyed by type so range, view and "Show all" reset when another type is selected. */}
      {selected && <VitalDetail key={selected.key} type={selected} session={session} onRefetch={onRefetch} onExpired={onExpired} />}
    </div>
  );
}

function VitalDetail({ type, session, onRefetch, onExpired }: { type: VitalType; session: Session; onRefetch: () => Promise<void>; onExpired: () => void }) {
  const [range, setRange] = useState<Range>("all");
  const [mode, setMode] = useState<ViewMode>("graph");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showAll, setShowAll] = useState(false);

  const dated = type.readings.filter((r) => r.date);
  const pickRange = (r: Range) => {
    if (r === "custom" && dated.length) {
      setTo(toInputDate(dated[0].date!));
      setFrom(toInputDate(dated[dated.length - 1].date!));
    }
    setRange(r);
  };

  const inRange = useMemo(() => {
    if (range === "all") return type.readings;
    let start: Date | null = null;
    let end: Date | null = null;
    if (range === "custom") {
      start = fromInputDate(from, false);
      end = fromInputDate(to, true);
    } else {
      const today = new Date();
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(range));
    }
    // Readings with no date are shown under "All time" only.
    return type.readings.filter((r) => r.date && (!start || r.date >= start) && (!end || r.date <= end));
  }, [type.readings, range, from, to]);

  const unit = chartUnit(type);
  const plottable = inRange.filter((r) => isPlottable(r, unit));
  const leftOff = inRange.length - plottable.length;

  return (
    <section className="detail">
      <div className="detail-head">
        <h2>{type.label}</h2>
        <span className="muted">
          {plural(inRange.length, "reading")} in range · Unit: {unit ? displayUnit(unit) : NOT_RECORDED}
        </span>
      </div>

      <div className="toolbar">
        <Segmented label="Date range" options={RANGE_OPTIONS} value={range} onChange={pickRange} />
        <Segmented
          label="View"
          options={[
            { value: "graph", label: "Graph" },
            { value: "table", label: "Table" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      {range === "custom" && (
        <div className="custom-range">
          <label className="field inline">
            <span>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field inline">
            <span>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      )}

      {mode === "graph" ? (
        <div className="graph-area">
          {inRange.length === 0 ? (
            <p className="muted">No readings in this date range.</p>
          ) : plottable.length >= 2 && unit ? (
            <VitalsChart type={type} points={plottable} unit={unit} />
          ) : plottable.length === 1 ? (
            <p className="muted">Only one reading can be plotted. A graph needs at least two. Switch to the table view to see it.</p>
          ) : (
            <p className="muted">These readings have no numeric value, so there is no graph.</p>
          )}
          {leftOff > 0 && plottable.length > 0 && (
            <p className="muted small">
              {leftOff === 1 ? "1 reading is" : `${leftOff} readings are`} in the table but not on the graph, because{" "}
              {leftOff === 1 ? "it has" : "they have"} no date, no numeric value, or a different unit.
            </p>
          )}
        </div>
      ) : (
        <ReadingsTable type={type} readings={inRange} unit={unit} showAll={showAll} setShowAll={setShowAll} />
      )}

      <AddReading type={type} session={session} onSaved={onRefetch} onExpired={onExpired} />
    </section>
  );
}

function ReadingsTable({
  type,
  readings,
  unit,
  showAll,
  setShowAll,
}: {
  type: VitalType;
  readings: Reading[];
  unit: string | null;
  showAll: boolean;
  setShowAll: (b: boolean) => void;
}) {
  if (readings.length === 0) return <p className="muted">No readings in this date range.</p>;
  const shown = showAll ? readings : readings.slice(0, TABLE_LIMIT);
  const u = displayUnit(unit);
  const cell = (v: number | null, r: Reading) =>
    v === null ? NOT_RECORDED : r.unit !== unit ? `${v} ${displayUnit(r.unit)}`.trim() : String(v);

  return (
    <>
      <div className="table-scroll">
        <table className="readings">
          <thead>
            <tr>
              <th>Date</th>
              {type.isBP ? (
                <>
                  <th className="num">Systolic{u && ` (${u})`}</th>
                  <th className="num">Diastolic{u && ` (${u})`}</th>
                </>
              ) : (
                <th className="num">Value</th>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.obs.id ?? i}>
                <td>{r.date ? formatDateTime(r.date) : NOT_RECORDED}</td>
                {type.isBP ? (
                  <>
                    <td className="num">{cell(r.values[0], r)}</td>
                    <td className="num">{cell(r.values[1], r)}</td>
                  </>
                ) : (
                  <td className="num">{formatReadingValue(type, r)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {readings.length > TABLE_LIMIT && (
        <button className="btn link" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all (${readings.length})`}
        </button>
      )}
    </>
  );
}
