import type { ErrInfo } from "./errors";

export type SectionState<T> =
  | { status: "loading" }
  | { status: "skipped" }
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "error"; error: ErrInfo };

export type StepStatus = "pending" | "active" | "done" | "failed";
export interface Step {
  label: string;
  status: StepStatus;
  note?: string;
}

export const STEP_LABELS = [
  "Reading launch parameters",
  "Discovering Epic endpoints",
  "Redirecting to Epic",
  "Verifying launch",
  "Loading patient",
  "Loading encounter",
  "Loading vitals",
  "Loading medications",
] as const;

export const FORBIDDEN_MSG = "Epic did not grant access to this data type.";
