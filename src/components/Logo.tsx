/** Small inline mark: a rounded square with a pulse line. No image files, no web fonts. */
export default function Logo({ size = 28, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill={inverted ? "#ffffff" : "var(--primary)"} />
      <path
        d="M5 17h5l2.5-6 4 11 3-8 1.8 3H27"
        fill="none"
        stroke={inverted ? "var(--primary)" : "#ffffff"}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
