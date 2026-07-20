import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PreviewBatch, TargetSelection } from "../../../contracts";
import { PreviewReview } from "./PreviewReview";

const preview: PreviewBatch = {
  token: "preview-token",
  expiresAtMs: 1_900_000_000_000,
  targets: [
    {
      platform: "claude",
      targetPath: "~/.claude/agents/test-agent.md",
      nativeFormat: "markdownYaml",
      nativeContent: "---\nname: test-agent\n---",
      unifiedDiff: "+name: test-agent",
      currentRevision: null,
      willCreateDirectory: false,
      willCreateBackup: false,
      conflictDetected: false,
      validationIssues: [],
      capabilityIssues: [],
    },
  ],
};

const targets: TargetSelection[] = [
  { platform: "claude", conflictAction: "fail" },
];

describe("PreviewReview", () => {
  it("offers the backend-provided manual recovery directory action", async () => {
    const user = userEvent.setup();
    const onRevealRecovery = vi.fn();
    render(
      <PreviewReview
        error="批次写入失败，需要人工恢复。"
        isCommitting={false}
        isRevealingRecovery={false}
        onBack={vi.fn()}
        onCommit={vi.fn()}
        onRevealRecovery={onRevealRecovery}
        preview={preview}
        recovery={{
          action: "revealRecoveryDirectory",
          recoveryId: "operation-id",
        }}
        targets={targets}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "在 Finder 中显示恢复目录" }),
    );

    expect(onRevealRecovery).toHaveBeenCalledWith("operation-id");
  });
});
