import type { ErrInfo } from "../errors";
import type { Step } from "../types";
import ErrorBox from "./ErrorBox";
import Logo from "./Logo";

const ICON: Record<Step["status"], string> = { pending: "○", active: "…", done: "✓", failed: "✕" };

export default function LaunchingScreen({ steps, error, onStartOver }: { steps: Step[]; error?: ErrInfo; onStartOver: () => void }) {
  return (
    <main className="launch-screen">
      <h1 className="brand">
        <Logo size={36} />
        VitalCheck
      </h1>
      <p className="muted">{error ? "The launch stopped." : "Opening the chart…"}</p>
      <ol className="steps" aria-live="polite">
        {steps.map((s) => (
          <li key={s.label} className={`step ${s.status}`}>
            <span className="step-icon" aria-hidden="true">{ICON[s.status]}</span>
            <span>
              {s.label}
              {s.note && <span className="muted"> ({s.note})</span>}
            </span>
            <span className="sr-only">{s.status}</span>
          </li>
        ))}
      </ol>
      {error && (
        <>
          <ErrorBox error={error} />
          <button className="btn primary" onClick={onStartOver}>Start over</button>
        </>
      )}
    </main>
  );
}
