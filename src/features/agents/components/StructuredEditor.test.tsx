import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AgentDraft, TargetSelection } from "../../../contracts";
import { StructuredEditor } from "./StructuredEditor";

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

const targets: TargetSelection[] = [
  { platform: "claude", conflictAction: "fail" },
];

function renderEditor(personalTemplateSaveMessage: string | null = null) {
  const callbacks = {
    onBack: vi.fn(),
    onDraftChange: vi.fn(),
    onPreview: vi.fn(),
    onSavePersonalTemplate: vi.fn(),
    onTargetsChange: vi.fn(),
  };
  render(
    <StructuredEditor
      draft={draft}
      error={null}
      isPreviewing={false}
      isSavingPersonalTemplate={false}
      personalTemplateSaveMessage={personalTemplateSaveMessage}
      targets={targets}
      {...callbacks}
    />,
  );
  return callbacks;
}

describe("StructuredEditor", () => {
  it("creates a missing platform override when that target is selected", async () => {
    const user = userEvent.setup();
    const callbacks = renderEditor();

    await user.click(screen.getByRole("checkbox", { name: "Codex" }));

    expect(callbacks.onDraftChange).toHaveBeenCalledWith({
      ...draft,
      platformOverrides: {
        ...draft.platformOverrides,
        codex: {
          platform: "codex",
          config: { nicknameCandidates: [] },
        },
      },
    });
    expect(callbacks.onTargetsChange).toHaveBeenCalledWith([
      ...targets,
      { platform: "codex", conflictAction: "fail" },
    ]);
  });

  it("trims the personal template name before saving", async () => {
    const user = userEvent.setup();
    const callbacks = renderEditor();
    const name = screen.getByRole("textbox", { name: /模板名称/ });

    await user.clear(name);
    await user.type(name, "  自定义模板  ");
    await user.click(screen.getByRole("button", { name: "保存个人模板" }));

    expect(callbacks.onSavePersonalTemplate).toHaveBeenCalledWith("自定义模板");
  });

  it("announces the personal template save result", () => {
    renderEditor("保存失败，请重试。");

    expect(screen.getByRole("status")).toHaveTextContent("保存失败，请重试。");
  });
});
