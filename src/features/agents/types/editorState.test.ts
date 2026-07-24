import { describe, expect, it } from "vitest";

import type { AgentDraft, TemplatePackage } from "../../../contracts";
import { templatePackageSchema } from "../../../contracts";
import {
  agentEditorReducer,
  createDraftFromTemplate,
  createInitialEditorState,
} from "./editorState";

const draft: AgentDraft = {
  logicalName: "pr_explorer",
  description: "Read-only codebase explorer.",
  developerInstructions: "Stay in exploration mode and report findings.",
  platformOverrides: {
    codex: {
      platform: "codex",
      config: {
        nicknameCandidates: [],
        modelReasoningEffort: "medium",
        sandboxMode: "read-only",
      },
    },
  },
  provenance: {
    kind: "builtinTemplate",
    templateId: "pr_explorer",
    templateVersion: "1.0.0",
  },
};

const template: TemplatePackage = templatePackageSchema.parse({
  manifest: {
    id: "pr_explorer",
    version: "1.0.0",
    name: "PR 探索者",
    description: "只读梳理 PR 变更与影响面。",
    author: "OpenAI Codex 官方文档示例",
    source: "builtin",
    tags: [],
    supportedPlatforms: ["codex"],
    risk: { level: "low", summary: "只读沙盒运行。" },
    adapterContracts: { codex: "codex-custom-agent-2026-07" },
  },
  logicalName: "pr_explorer",
  defaultDescription: "Read-only codebase explorer.",
  developerInstructions: "Stay in exploration mode and report findings.",
  platformOverrides: {
    codex: {
      platform: "codex",
      config: {
        nicknameCandidates: [],
        modelReasoningEffort: "medium",
        sandboxMode: "read-only",
      },
    },
  },
});

describe("createDraftFromTemplate", () => {
  it("copies the template developer instructions into the draft", () => {
    const created = createDraftFromTemplate(template);

    expect(created.logicalName).toBe("pr_explorer");
    expect(created.developerInstructions).toBe(
      "Stay in exploration mode and report findings.",
    );
    expect(Object.keys(created.platformOverrides)).toEqual(["codex"]);
    expect(created.provenance).toEqual({
      kind: "builtinTemplate",
      templateId: "pr_explorer",
      templateVersion: "1.0.0",
    });
  });

  it("derives the initial targets from the template overrides", () => {
    const state = createInitialEditorState(createDraftFromTemplate(template));

    expect(state.status).toBe("editing");
    expect(state.targets).toEqual([
      { platform: "codex", conflictAction: "fail" },
    ]);
  });
});

describe("agentEditorReducer", () => {
  it("invalidates a preview when the draft changes", () => {
    const initial = createInitialEditorState(draft);
    const reviewing = agentEditorReducer(
      agentEditorReducer(initial, { type: "previewStarted" }),
      {
        type: "previewSucceeded",
        preview: { token: "token", expiresAtMs: 1, targets: [] },
      },
    );
    const changed = agentEditorReducer(reviewing, {
      type: "replaceDraft",
      draft: { ...draft, description: "Changed" },
    });

    expect(changed.status).toBe("editing");
    expect(changed.draft.description).toBe("Changed");
  });

  it("preserves a manual recovery action after commit failure", () => {
    const initial = createInitialEditorState(draft);
    const reviewing = agentEditorReducer(
      agentEditorReducer(initial, { type: "previewStarted" }),
      {
        type: "previewSucceeded",
        preview: { token: "token", expiresAtMs: 1, targets: [] },
      },
    );
    const committing = agentEditorReducer(reviewing, { type: "commitStarted" });

    const failed = agentEditorReducer(committing, {
      type: "commitFailed",
      error: "需要人工恢复。",
      recovery: {
        action: "revealRecoveryDirectory",
        recoveryId: "operation-id",
      },
    });

    expect(failed.status).toBe("failed");
    if (failed.status === "failed") {
      expect(failed.recovery).toEqual({
        action: "revealRecoveryDirectory",
        recoveryId: "operation-id",
      });
    }
  });
});
