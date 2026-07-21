import type { ReactNode } from "react";

import { cn } from "../../lib/formatting/cn";

interface StatusDotProps {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  className?: string;
  children: ReactNode;
}

const toneClasses = {
  neutral: {
    dot: "bg-[var(--text-subtle)]",
    text: "text-[var(--text-muted)]",
  },
  accent: {
    dot: "bg-[var(--accent)]",
    text: "text-[var(--accent-strong)]",
  },
  success: {
    dot: "bg-[var(--success)]",
    text: "text-[var(--success)]",
  },
  warning: {
    dot: "bg-[var(--warning)]",
    text: "text-[var(--warning)]",
  },
  danger: {
    dot: "bg-[var(--danger)]",
    text: "text-[var(--danger)]",
  },
} as const;

/**
 * Compact status indicator: a 6px tone-colored dot next to an 11px label.
 * The label text is required so color is never the only status signal.
 */
export function StatusDot({
  tone = "neutral",
  className,
  children,
}: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        toneClasses[tone].text,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", toneClasses[tone].dot)}
      />
      {children}
    </span>
  );
}
