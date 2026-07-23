import type { ReactNode } from "react";

import { cn } from "../../lib/formatting/cn";

export interface SegmentedControlItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  items: readonly SegmentedControlItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible name for the whole control. */
  "aria-label"?: string;
  className?: string;
}

/**
 * macOS-style segmented control built as a plain button group: a recessed
 * muted track where the selected segment floats on a raised surface with a
 * soft shadow. Selection state is exposed through `aria-pressed`.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-[var(--surface-muted)] p-1",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              onChange(item.id);
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
              selected
                ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-card)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {item.icon != null ? (
              <span aria-hidden="true" className="inline-flex shrink-0">
                {item.icon}
              </span>
            ) : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
