import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./SegmentedControl";

const items = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
] as const;

describe("SegmentedControl", () => {
  it("renders one labelled button per item inside a named group", () => {
    render(
      <SegmentedControl
        aria-label="platform"
        items={items}
        onChange={vi.fn()}
        value="codex"
      />,
    );

    const group = screen.getByRole("group", { name: "platform" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: "Claude Code" }),
    ).toBeInTheDocument();
  });

  it("marks only the selected segment with aria-pressed", () => {
    render(<SegmentedControl items={items} onChange={vi.fn()} value="codex" />);

    expect(screen.getByRole("button", { name: "Codex" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Claude Code" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Cursor" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("raises the selected segment on a surface with a shadow", () => {
    render(<SegmentedControl items={items} onChange={vi.fn()} value="codex" />);

    const selected = screen.getByRole("button", { name: "Codex" });
    expect(selected).toHaveClass("bg-[var(--surface)]");
    expect(selected).toHaveClass("shadow-[var(--shadow-card)]");
    expect(screen.getByRole("button", { name: "Cursor" })).not.toHaveClass(
      "bg-[var(--surface)]",
    );
  });

  it("reports the clicked segment id through onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl items={items} onChange={onChange} value="codex" />);

    await user.click(screen.getByRole("button", { name: "Cursor" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("cursor");
  });

  it("supports keyboard activation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl items={items} onChange={onChange} value="codex" />);

    screen.getByRole("button", { name: "Claude Code" }).focus();
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledExactlyOnceWith("claude");
  });

  it("renders optional icons as decorative content", () => {
    render(
      <SegmentedControl
        items={[
          {
            id: "codex",
            label: "Codex",
            icon: <svg data-testid="segment-icon" />,
          },
        ]}
        onChange={vi.fn()}
        value="codex"
      />,
    );

    const icon = screen.getByTestId("segment-icon");
    expect(icon).toBeInTheDocument();
    expect(icon.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByRole("button", { name: "Codex" }),
    ).toBeInTheDocument();
  });
});
