import type { ErrInfo } from "../errors";

export default function ErrorBox({ error, title }: { error: ErrInfo; title?: string }) {
  return (
    <div className="error-box" role="alert">
      {title && <strong>{title} </strong>}
      <span>{error.message}</span>
      {error.status != null && !error.message.includes(String(error.status)) && <div>HTTP status: {error.status}</div>}
      {error.details !== undefined && (
        <details>
          <summary>Details</summary>
          <pre className="payload">{error.details || "Empty response body."}</pre>
        </details>
      )}
    </div>
  );
}
