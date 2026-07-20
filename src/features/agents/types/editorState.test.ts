import { describe, expect, it } from "vitest";

import type { AgentDraft } from "../../../contracts";
import { agentEditorReducer, createInitialEditorState } from "./editorState";

const draft: AgentDraft = {
  logicalName: "requirements-clarifier",
  description: "Clarifies requirements.",
  shared: {
    roleGoal: "Clarify requirements.",
    whenToUse: ["Requirements are ambiguous."],
    whenNotToUse: ["Requirements are complete."],
    inputRequirements: ["Original request."],
    executionSteps: ["Inspect evidence."],
    outputContract: "Return testable requirements.",
    constraints: ["Ask one question at a time."],
    stopConditions: ["Acceptance is testable."],
    failureHandling: "Report missing evidence.",
  },
  responseLanguage: "followUser",
  usage: {
    explicitInvocationExamples: ["Clarify this request."],
    autoDelegationGuidance: "Use for ambiguous work.",
    verificationTask: "Check every criterion is testable.",
  },
  platformOverrides: {
    claude: {
      platform: "claude",
      config: { tools: [], disallowedTools: [], skills: [] },
    },
    codex: {
      platform: "codex",
      config: { nicknameCandidates: [] },
    },
    cursor: {
      platform: "cursor",
      config: {},
    },
  },
  provenance: {
    kind: "builtinTemplate",
    templateId: "requirements-clarifier",
    templateVersion: "1.0.0",
  },
};

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
