import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/formatting/cn";

const pillVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--surface-muted)] text-[var(--text-muted)]",
        accent: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
        success: "bg-[var(--success-soft)] text-[var(--success)]",
        warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
        danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

type PillProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof pillVariants> & {
    /** Label text is required so color is never the only status signal. */
    children: ReactNode;
  };

/**
 * Soft status pill: tinted background with a darker text tone, fully rounded.
 * Replaces the dot-style status indicator in the CC-Switch visual language.
 */
export function Pill({ className, tone, ...props }: PillProps) {
  return <span className={cn(pillVariants({ tone }), className)} {...props} />;
}
