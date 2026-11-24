import { FORBIDDEN_MSG, type SectionState } from "../types";
import ErrorBox from "./ErrorBox";

/** Renders loading / forbidden / error states. Returns null when the section has data. */
export default function SectionStatus({ state, what }: { state: SectionState<unknown>; what: string }) {
  if (state.status === "loading") return <p className="muted">Loading {what}…</p>;
  if (state.status === "forbidden") return <div className="warn-box">{FORBIDDEN_MSG}</div>;
  if (state.status === "error") return <ErrorBox error={state.error} title={`Could not load ${what}.`} />;
  return null;
}
