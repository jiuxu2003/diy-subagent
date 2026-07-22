import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentDraft, BatchCommitResult } from "../../../contracts";
import { InstallSuccess } from "./InstallSuccess";

const draft: AgentDraft = {
  logicalName: "test-agent",
  description: "Use this agent for focused analysis.",
  shared: {
    roleGoal: "Inspect the requested work.",
    whenToUse: ["The task needs focused analysis."],
    whenNotToUse: ["The task is already complete."],
    inputRequirements: ["The original request."],
    executionSteps: ["Inspect the evidence."],
    outputContract: "Return a verifiable result.",
    constraints: ["Do not invent evidence."],
    stopConditions: ["The result is verified."],
    failureHandling: "Report missing evidence.",
  },
  responseLanguage: "followUser",
  usage: {
    explicitInvocationExamples: ["Inspect this task."],
    autoDelegationGuidance: "Use for focused analysis.",
    verificationTask: "Verify the result against the source.",
  },
  platformOverrides: {
    claude: {
      platform: "claude",
      config: { tools: [], disallowedTools: [], skills: [] },
    },
  },
  provenance: {
    kind: "personalTemplate",
    templateId: "personal-test-agent",
    templateVersion: "1.0.0",
  },
};

const result: BatchCommitResult = {
  operationId: "op-20260721-0001",
  targets: [
    {
      platform: "claude",
      status: "committed",
      targetPath: "~/.claude/agents/test-agent.md",
      committedRevision: "rev-1",
      backupId: null,
      recoveryPath: null,
    },
  ],
  requiresManualRecovery: false,
};

const claudeInvocation = "Use the test-agent subagent for this task.";

function renderSuccess() {
  render(
    <InstallSuccess draft={draft} onCreateAnother={vi.fn()} result={result} />,
  );
}

function copyLine() {
  return screen.getByRole("button", { name: /Use the test-agent subagent/ });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InstallSuccess", () => {
  it("copies the invocation text and announces 已复制", async () => {
    const user = userEvent.setup();
    renderSuccess();

    await user.click(copyLine());

    expect(await screen.findByText("已复制")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
    await expect(navigator.clipboard.readText()).resolves.toBe(
      claudeInvocation,
    );
  });

  it("announces 复制失败 when the clipboard write is rejected", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("clipboard denied"),
    );
    renderSuccess();

    await user.click(copyLine());

    expect(await screen.findByText("复制失败")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("复制失败");
  });

  it("resets the copied feedback about two seconds later", async () => {
    // fireEvent + a local clipboard stub keep fake timers decoupled from
    // user-event's internal waits, which hang under mocked setTimeout.
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      renderSuccess();

      fireEvent.click(copyLine());
      // Flush the resolved clipboard promise before asserting.
      await act(() => Promise.resolve());
      expect(writeText).toHaveBeenCalledWith(claudeInvocation);
      expect(screen.getByText("已复制")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.queryByText("已复制")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
