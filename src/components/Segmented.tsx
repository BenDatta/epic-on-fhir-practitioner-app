interface Props<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export default function Segmented<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div className="seg-group">
      <span className="seg-label">{label}</span>
      <div className="seg-track" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`seg ${o.value === value ? "on" : ""}`}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
