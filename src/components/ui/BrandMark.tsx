/**
 * Brand identity mark: rounded square filled with the brand tint and the
 * app icon's hub-spoke glyph stroked on top. Identity only — never used
 * for functional states (buttons, selection, focus, status).
 */

/**
 * Hub-spoke glyph shared by the filled mark and line-art illustrations.
 * Spoke segments are pre-trimmed to the circle edges so the glyph renders
 * cleanly with `fill: none` and needs no masking.
 */
export function BrandGlyph({ stroke }: { stroke: string }) {
  return (
    <g
      fill="none"
      stroke={stroke}
      strokeLinecap="round"
      strokeWidth={1.5}
    >
      <circle cx={12} cy={8} r={2.6} />
      <circle cx={6.5} cy={16.5} r={2} />
      <circle cx={12} cy={16.5} r={2} />
      <circle cx={17.5} cy={16.5} r={2} />
      <path d="M12 10.6V14.5M10.59 10.18 7.59 14.82M13.41 10.18l3 4.64" />
    </g>
  );
}

interface BrandMarkProps {
  className?: string;
  "aria-hidden"?: boolean;
}

export function BrandMark(
  { className, "aria-hidden": ariaHidden = true }: BrandMarkProps,
) {
  return (
    <svg
      aria-hidden={ariaHidden}
      className={className}
      focusable="false"
      viewBox="0 0 24 24"
    >
      <rect fill="var(--brand)" height={24} rx={6} width={24} />
      {/* Fixed white stroke reads fine on both light/dark brand tints. */}
      <BrandGlyph stroke="#ffffff" />
    </svg>
  );
}
