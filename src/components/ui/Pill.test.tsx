import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pill } from "./Pill";

describe("Pill", () => {
  it("renders the required label text", () => {
    render(<Pill>readable label</Pill>);

    expect(screen.getByText("readable label")).toBeInTheDocument();
  });

  it("defaults to the neutral tone", () => {
    render(<Pill>neutral</Pill>);

    const pill = screen.getByText("neutral");
    expect(pill).toHaveClass("bg-[var(--surface-muted)]");
    expect(pill).toHaveClass("rounded-full");
  });

  it.each([
    ["success", "bg-[var(--success-soft)]", "text-[var(--success)]"],
    ["warning", "bg-[var(--warning-soft)]", "text-[var(--warning)]"],
    ["danger", "bg-[var(--danger-soft)]", "text-[var(--danger)]"],
    ["accent", "bg-[var(--accent-soft)]", "text-[var(--accent-strong)]"],
  ] as const)(
    "renders the %s tone with a soft background and darker text",
    (tone, backgroundClass, textClass) => {
      render(<Pill tone={tone}>{tone}</Pill>);

      const pill = screen.getByText(tone);
      expect(pill).toHaveClass(backgroundClass);
      expect(pill).toHaveClass(textClass);
    },
  );

  it("merges a custom className", () => {
    render(<Pill className="ml-2">custom</Pill>);

    expect(screen.getByText("custom")).toHaveClass("ml-2");
  });
});
