import { useState } from "react";

import { cn } from "../../lib/formatting/cn";

interface ToastProps {
  /** Text to announce; null hides the pill (its exit transition still plays). */
  message: string | null;
}

/**
 * Transient floating status pill, bottom-centered above the page content.
 *
 * The element stays mounted so the fade/slide runs as a real CSS transition
 * in both directions, and so the `role="status"` live region exists before
 * its text changes (screen readers announce content changes, not mounts).
 * The global prefers-reduced-motion rule in globals.css collapses the
 * transition to a near-zero duration. Deliberately minimal: no queue, no
 * variants — the owner holds the message state and its dismiss timer.
 */
export function Toast({ message }: ToastProps) {
  // Guarded render-phase state adjustment (documented React pattern): retain
  // the last message while fading out so the text does not vanish before the
  // exit transition finishes.
  const [lastMessage, setLastMessage] = useState(message);
  if (message !== null && message !== lastMessage) {
    setLastMessage(message);
  }
  const visible = message !== null;

  return (
    <div
      aria-hidden={visible ? undefined : true}
      className={cn(
        "pointer-events-none fixed bottom-8 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text)] shadow-[var(--shadow-card-hover)] transition-[opacity,translate] duration-300",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
      role="status"
    >
      {lastMessage}
    </div>
  );
}
