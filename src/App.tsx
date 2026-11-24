import { useCallback, useEffect, useState } from "react";
import { completeCallback, startLaunch } from "./auth";
import type { Boot } from "./boot";
import { CLIENT_ID } from "./config";
import { AppError, NO_CLIENT_ID, SESSION_EXPIRED, type ErrInfo } from "./errors";
import { readResource, searchAll, type FetchResult, type Resource } from "./fhir";
import { clearLog } from "./log";
import { clearAllStorage, clearSession, type Session } from "./session";
import { STEP_LABELS, type SectionState, type Step, type StepStatus } from "./types";
import LaunchScreen, { type LaunchValues } from "./components/LaunchScreen";
import LaunchingScreen from "./components/LaunchingScreen";
import ChartScreen from "./components/ChartScreen";

type View =
  | { kind: "launch"; error?: ErrInfo; prefill?: Partial<LaunchValues> }
  | { kind: "launching"; steps: Step[]; error?: ErrInfo }
  | { kind: "chart" };

export interface ChartData {
  patient: SectionState<Resource>;
  encounter: SectionState<Resource>;
  vitals: SectionState<Resource[]>;
  meds: SectionState<Resource[]>;
}

const LOADING: ChartData = {
  patient: { status: "loading" },
  encounter: { status: "loading" },
  vitals: { status: "loading" },
  meds: { status: "loading" },
};

function initialSteps(doneCount: number): Step[] {
  return STEP_LABELS.map((label, i) => ({ label, status: i < doneCount ? "done" : i === doneCount ? "active" : "pending" }));
}

function toSection<T>(r: Exclude<FetchResult<T>, { kind: "unauthorized" }>): SectionState<T> {
  if (r.kind === "ok") return { status: "ok", data: r.data };
  if (r.kind === "forbidden") return { status: "forbidden" };
  return { status: "error", error: r.error };
}

function errInfo(e: unknown): ErrInfo {
  if (e instanceof AppError) return e.info;
  return { message: e instanceof Error ? e.message : String(e) };
}

// Guards against running the boot action twice (for example on a hot reload).
let bootHandled = false;

export default function App({ boot }: { boot: Boot }) {
  const [view, setView] = useState<View>(() => {
    if (boot.kind === "ehr") return { kind: "launching", steps: initialSteps(1) };
    if (boot.kind === "callback") return { kind: "launching", steps: initialSteps(3) };
    if (boot.kind === "resume") return { kind: "chart" };
    if (boot.kind === "error") return { kind: "launch", error: boot.error };
    return { kind: "launch", error: boot.error };
  });
  const [session, setSession] = useState<Session | null>(boot.kind === "resume" ? boot.session : null);
  const [data, setData] = useState<ChartData>(LOADING);
  // True only on the page load that handled the launch and the redirect.
  const [launchedThisLoad, setLaunchedThisLoad] = useState(false);

  const setStep = useCallback((index: number, status: StepStatus, note?: string) => {
    setView((v) => {
      if (v.kind !== "launching") return v;
      const steps = v.steps.map((s, i) => {
        if (i === index) return { ...s, status, note };
        if (status === "done" && i === index + 1 && s.status === "pending") return { ...s, status: "active" as const };
        return s;
      });
      return { ...v, steps };
    });
  }, []);

  const failLaunching = useCallback((error: ErrInfo) => {
    setView((v) => {
      if (v.kind !== "launching") return { kind: "launch", error };
      const steps = v.steps.map((s) => (s.status === "active" ? { ...s, status: "failed" as const } : s));
      return { kind: "launching", steps, error };
    });
  }, []);

  const expire = useCallback(() => {
    clearSession();
    setSession(null);
    setView({ kind: "launch", error: { message: SESSION_EXPIRED } });
  }, []);

  const runLaunch = useCallback(
    async (iss: string, launch: string, clientId: string) => {
      setView({ kind: "launching", steps: initialSteps(1) });
      try {
        // "Redirecting to Epic" stays active while the browser navigates away. It shows as
        // done after the redirect back (initialSteps(3)). Marking it done here would move the
        // highlight to "Verifying launch" while the browser is still on its way to Epic.
        await startLaunch(iss, launch, clientId, (step) => {
          if (step === "discover") setStep(1, "done");
        });
      } catch (e) {
        failLaunching(errInfo(e));
      }
    },
    [setStep, failLaunching],
  );

  /** Sequential loads, so each failure is attributable. Returns false on a 401. */
  const loadAll = useCallback(
    async (s: Session, withSteps: boolean): Promise<boolean> => {
      const step = (i: number, st: StepStatus, note?: string) => withSteps && setStep(i, st, note);
      const noteFor = (r: FetchResult<unknown>) => (r.kind === "ok" ? undefined : r.kind === "forbidden" ? "not granted" : "failed, see chart");

      const p = await readResource("patient", s, `Patient/${encodeURIComponent(s.patient)}`);
      if (p.kind === "unauthorized") return false;
      setData((d) => ({ ...d, patient: toSection(p) }));
      step(4, "done", noteFor(p));

      if (s.encounter) {
        const e = await readResource("encounter", s, `Encounter/${encodeURIComponent(s.encounter)}`);
        if (e.kind === "unauthorized") return false;
        setData((d) => ({ ...d, encounter: toSection(e) }));
        step(5, "done", e.kind === "ok" ? undefined : "could not be loaded");
      } else {
        setData((d) => ({ ...d, encounter: { status: "skipped" } }));
        step(5, "done", "no encounter in this launch");
      }

      const v = await searchAll("vitals", s, `Observation?patient=${encodeURIComponent(s.patient)}&category=vital-signs`);
      if (v.kind === "unauthorized") return false;
      setData((d) => ({ ...d, vitals: toSection(v) }));
      step(6, "done", noteFor(v));

      const m = await searchAll("medications", s, `MedicationRequest?patient=${encodeURIComponent(s.patient)}`);
      if (m.kind === "unauthorized") return false;
      setData((d) => ({ ...d, meds: toSection(m) }));
      step(7, "done", noteFor(m));
      return true;
    },
    [setStep],
  );

  /** Re-runs the vitals search after a write. The new reading comes from Epic, never local state. */
  const refetchVitals = useCallback(async () => {
    if (!session) return;
    const v = await searchAll("vitals", session, `Observation?patient=${encodeURIComponent(session.patient)}&category=vital-signs`);
    if (v.kind === "unauthorized") return expire();
    setData((d) => ({ ...d, vitals: toSection(v) }));
  }, [session, expire]);

  useEffect(() => {
    if (bootHandled) return;
    bootHandled = true;
    (async () => {
      if (boot.kind === "ehr") {
        if (!CLIENT_ID) {
          // Prefill the form so the learner can paste a client ID and continue with the same launch.
          setView({ kind: "launch", error: { message: NO_CLIENT_ID }, prefill: { iss: boot.iss, launch: boot.launch } });
          return;
        }
        await runLaunch(boot.iss, boot.launch, CLIENT_ID);
      } else if (boot.kind === "callback") {
        let s: Session;
        try {
          s = await completeCallback(boot.code, boot.state);
        } catch (e) {
          failLaunching(errInfo(e));
          return;
        }
        setLaunchedThisLoad(true);
        setSession(s);
        setStep(3, "done");
        const ok = await loadAll(s, true);
        if (!ok) return expire();
        setView({ kind: "chart" });
      } else if (boot.kind === "resume") {
        const ok = await loadAll(boot.session, false);
        if (!ok) expire();
      }
    })();
  }, [boot, runLaunch, failLaunching, loadAll, setStep, expire]);

  const startOver = () => {
    clearAllStorage();
    clearLog();
    setSession(null);
    setData(LOADING);
    setView({ kind: "launch" });
  };

  if (view.kind === "launch") {
    return (
      <LaunchScreen
        error={view.error}
        prefill={view.prefill}
        onLaunch={(v) => {
          clearLog();
          if (!v.clientId.trim()) {
            setView({ kind: "launch", error: { message: NO_CLIENT_ID }, prefill: v });
            return;
          }
          runLaunch(v.iss, v.launch.trim(), v.clientId.trim());
        }}
      />
    );
  }
  if (view.kind === "launching") {
    return <LaunchingScreen steps={view.steps} error={view.error} onStartOver={startOver} />;
  }
  if (!session) return null;
  return (
    <ChartScreen
      session={session}
      data={data}
      launchedThisLoad={launchedThisLoad}
      onCloseSession={startOver}
      onExpired={expire}
      onRefetchVitals={refetchVitals}
    />
  );
}
