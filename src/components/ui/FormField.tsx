import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
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
          className="text-sm font-semibold text-[var(--text)]"
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
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-soft)] disabled:opacity-50";

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
      className={cn(fieldClassName, "min-h-28 resize-y leading-6", className)}
      {...props}
    />
  );
}

export function Select(
  { className, ...props }: SelectHTMLAttributes<HTMLSelectElement>,
) {
  return <select className={cn(fieldClassName, className)} {...props} />;
}
