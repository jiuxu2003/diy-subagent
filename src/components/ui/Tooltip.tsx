import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/formatting/cn";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

/**
 * Radix tooltip wrapper. The global TooltipProvider is mounted once in
 * AppProviders, so this component only renders Root/Trigger/Content.
 */
export function Tooltip({ content, children }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="z-50 max-w-72 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--text)] shadow-2xl"
          sideOffset={6}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

interface HelpTipProps {
  /** Accessible name for the icon-only trigger button. */
  "aria-label": string;
  content: string;
  className?: string;
}

/** Question-mark icon button revealing an explanation on hover or focus. */
export function HelpTip(
  { "aria-label": ariaLabel, content, className }: HelpTipProps,
) {
  return (
    <Tooltip content={content}>
      <button
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center justify-center rounded-full text-[var(--text-subtle)] outline-none transition-colors hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
          className,
        )}
        type="button"
      >
        <CircleHelp aria-hidden="true" className="size-3.5" />
      </button>
    </Tooltip>
  );
}
