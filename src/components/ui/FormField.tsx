import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "../../lib/formatting/cn";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}

export function FieldShell({
  label,
  hint,
  error,
  htmlFor,
  children,
}: FieldShellProps) {
  const descriptionId = `${htmlFor}-description`;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <label
          className="text-sm font-medium text-[var(--text-muted)]"
          htmlFor={htmlFor}
        >
          {label}
        </label>
        {hint
          ? <span className="text-xs text-[var(--text-subtle)]">{hint}</span>
          : null}
      </div>
      {children}
      {error
        ? (
          <p
            className="text-xs font-medium text-[var(--danger)]"
            id={descriptionId}
          >
            {error}
          </p>
        )
        : null}
    </div>
  );
}

const fieldClassName =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-soft)] disabled:opacity-50";

export function Input(
  { className, ...props }: InputHTMLAttributes<HTMLInputElement>,
) {
  return <input className={cn(fieldClassName, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(fieldClassName, "min-h-28 resize-y", className)}
      {...props}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  "aria-label"?: string;
  className?: string;
}

/**
 * Radix-based replacement for the native `<select>`: the popup is rendered
 * by us (token-styled, both themes) instead of the macOS system menu.
 * Note: Radix forbids empty-string item values, so "inherit" style options
 * must map to a sentinel value at the call site.
 */
export function Select({
  id,
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  className,
}: SelectProps) {
  return (
    <SelectPrimitive.Root onValueChange={onValueChange} value={value}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          fieldClassName,
          "flex items-center justify-between gap-2 text-left",
          className,
        )}
        id={id}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 shrink-0 text-[var(--text-muted)]"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-50 max-h-[var(--radix-select-content-available-height)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl"
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="min-w-[var(--radix-select-trigger-width)] p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                className="flex cursor-default items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-[var(--surface-hover)]"
                key={option.value}
                value={option.value}
              >
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator asChild>
                  <Check
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-[var(--accent)]"
                  />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
