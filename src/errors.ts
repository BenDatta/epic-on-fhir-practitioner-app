export interface ErrInfo {
  message: string;
  status?: number | null;
  details?: string; // raw response body, shown in a collapsible "Details" block
}

export class AppError extends Error {
  info: ErrInfo;
  constructor(info: ErrInfo) {
    super(info.message);
    this.info = info;
  }
}

export const NO_CLIENT_ID =
  "No client ID is configured. Set VITE_EPIC_CLIENT_ID in .env and restart the dev server, or paste a client ID below.";
export const SESSION_EXPIRED = "Your session has expired. Launch the app again from Epic.";
