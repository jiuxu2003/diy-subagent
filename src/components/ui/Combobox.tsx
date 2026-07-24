import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "../../lib/formatting/cn";
import { Input } from "./FormField";

interface ComboboxProps {
  id?: string;
  /** Controlled free-text value; picking an option replaces it wholesale. */
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  /** Accessible name for the panel trigger button and the listbox. */
  triggerLabel: string;
  /** Panel content when no options were provided at all. */
  emptyState: ReactNode;
  /** Panel content when options exist but none matches the input. */
  noMatchState: ReactNode;
  spellCheck?: boolean;
  className?: string;
}

/**
 * Free-text input with an attached option panel. Unlike a native
 * `<datalist>` (which WKWebView never renders as a popup), the panel is a
 * Radix Popover anchored under the input row, matching its width. Typing
 * stays free-form; the list is only a shortcut that fills the input.
 *
 * Filtering: case-insensitive substring of the input value. An empty input
 * or an exact option match shows the full list.
 */
export function Combobox({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  triggerLabel,
  emptyState,
  noMatchState,
  spellCheck,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const query = value.trim().toLowerCase();
  const showAll = query.length === 0 ||
    options.some((option) => option.toLowerCase() === query);
  const visibleOptions = showAll
    ? options
    : options.filter((option) => option.toLowerCase().includes(query));

  return (
    <PopoverPrimitive.Root onOpenChange={setOpen} open={open}>
      <PopoverPrimitive.Anchor asChild>
        <div className={cn("relative", className)} ref={anchorRef}>
          <Input
            className="pr-9"
            id={id}
            onChange={(event) => {
              onValueChange(event.currentTarget.value);
            }}
            placeholder={placeholder}
            spellCheck={spellCheck}
            value={value}
          />
          <PopoverPrimitive.Trigger asChild>
            <button
              aria-haspopup="listbox"
              aria-label={triggerLabel}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-xl text-[var(--text-muted)] outline-none transition-colors hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              type="button"
            >
              <ChevronDown aria-hidden="true" className="size-3.5" />
            </button>
          </PopoverPrimitive.Trigger>
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl"
          onInteractOutside={(event) => {
            // Keep the panel open while the user types in the anchored
            // input so substring filtering stays visible.
            if (
              event.target instanceof Node &&
              anchorRef.current?.contains(event.target)
            ) {
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={(event) => {
            // Leave focus on the input/trigger for type-to-filter.
            event.preventDefault();
          }}
          sideOffset={4}
        >
          <div
            aria-label={triggerLabel}
            className="max-h-60 overflow-y-auto p-1"
            role="listbox"
          >
            {visibleOptions.length === 0
              ? (options.length === 0 ? emptyState : noMatchState)
              : visibleOptions.map((option) => {
                const selected = option === value.trim();
                return (
                  <button
                    aria-selected={selected}
                    className={cn(
                      "flex w-full cursor-default items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]",
                      selected && "font-medium",
                    )}
                    key={option}
                    onClick={() => {
                      onValueChange(option);
                      setOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="truncate">{option}</span>
                    {selected
                      ? (
                        <Check
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-[var(--accent)]"
                        />
                      )
                      : null}
                  </button>
                );
              })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
