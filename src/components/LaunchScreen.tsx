import { useState } from "react";
import { CLIENT_ID, SANDBOX_FHIR_BASE_URL } from "../config";
import { NO_CLIENT_ID, type ErrInfo } from "../errors";
import ErrorBox from "./ErrorBox";
import Logo from "./Logo";

export interface LaunchValues {
  iss: string;
  clientId: string;
  launch: string;
}

interface Props {
  error?: ErrInfo;
  prefill?: Partial<LaunchValues>;
  onLaunch: (v: LaunchValues) => void;
}

/**
 * Turns whatever was pasted into the raw launch value: a full launcher URL, "launch=xyz",
 * or a still URL-encoded value. This only undoes URL encoding from copy-pasting. The token
 * itself stays opaque and is never decoded or inspected.
 */
function normaliseLaunchInput(raw: string): { launch: string; iss?: string } {
  const s = raw.trim();
  const query = s.includes("?") ? s.slice(s.indexOf("?") + 1) : s.startsWith("launch=") || s.includes("&launch=") ? s : null;
  if (query !== null) {
    const q = new URLSearchParams(query);
    const launch = q.get("launch");
    if (launch) return { launch, iss: q.get("iss") ?? undefined };
  }
  if (/%[0-9A-Fa-f]{2}/.test(s)) {
    try {
      return { launch: decodeURIComponent(s) };
    } catch {
      /* not valid encoding: use as typed */
    }
  }
  return { launch: s };
}

export default function LaunchScreen({ error, prefill, onLaunch }: Props) {
  const [iss, setIss] = useState(prefill?.iss ?? SANDBOX_FHIR_BASE_URL);
  const [clientId, setClientId] = useState(prefill?.clientId ?? CLIENT_ID);
  const [launch, setLaunch] = useState(prefill?.launch ?? "");
  const ready = iss.trim() !== "" && clientId.trim() !== "" && launch.trim() !== "";
  const showNoClientId = !CLIENT_ID && error?.message !== NO_CLIENT_ID;

  return (
    <main className="launch-screen">
      <h1 className="brand">
        <Logo size={36} />
        VitalCheck
      </h1>
      <p>VitalCheck is opened from inside Epic. Epic passes the patient and the visit, and the app shows that patient's vitals.</p>

      {error && <ErrorBox error={error} />}
      {showNoClientId && <div className="warn-box">{NO_CLIENT_ID}</div>}

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          const n = normaliseLaunchInput(launch);
          // If a whole launcher URL was pasted, its iss wins over the prefilled base URL.
          onLaunch({ iss: (n.iss ?? iss).trim(), clientId: clientId.trim(), launch: n.launch });
        }}
      >
        <h2>Launch manually</h2>
        <label className="field">
          <span>FHIR base URL</span>
          <input value={iss} onChange={(e) => setIss(e.target.value)} spellCheck={false} autoComplete="off" />
        </label>
        <label className="field">
          <span>Client ID</span>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} spellCheck={false} autoComplete="off" />
        </label>
        <label className="field">
          <span>Launch token</span>
          <input value={launch} onChange={(e) => setLaunch(e.target.value)} spellCheck={false} autoComplete="off" />
          <small className="hint">
            Paste the launch value from Epic's launcher URL. Open fhir.epic.com, go to Documentation, Launching your app from Epic, and use Try It.
          </small>
        </label>
        <button type="submit" className="btn primary" disabled={!ready}>
          Launch
        </button>
      </form>
      <p className="muted small">In a hospital this screen is never seen. Epic opens the app with the patient already selected.</p>
    </main>
  );
}
