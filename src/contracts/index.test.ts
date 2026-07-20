import { describe, expect, it } from "vitest";

import importAgentResultFixture from "../../tests/fixtures/import-agent-result-claude.json?raw";
import { importAgentResultSchema } from "./index";

const shared = {
  roleGoal: "Inspect the requested work.",
  whenToUse: ["The task needs focused analysis."],
  whenNotToUse: ["The task is already complete."],
  inputRequirements: ["The original request."],
  executionSteps: ["Inspect the evidence."],
  outputContract: "Return a verifiable result.",
  constraints: ["Do not invent evidence."],
  stopConditions: ["The result is verified."],
  failureHandling: "Report the missing evidence.",
};

const usage = {
  explicitInvocationExamples: ["Inspect this task."],
  autoDelegationGuidance: "Use for focused analysis.",
  verificationTask: "Verify the result against the source.",
};

const importedFixtures = [
  {
    platform: "claude",
    platformOverrides: {
      claude: {
        platform: "claude",
        config: { tools: [], disallowedTools: [], skills: [] },
      },
    },
  },
  {
    platform: "codex",
    platformOverrides: {
      codex: {
        platform: "codex",
        config: { nicknameCandidates: [] },
      },
    },
  },
  {
    platform: "cursor",
    platformOverrides: {
      cursor: { platform: "cursor", config: {} },
    },
  },
] as const;

describe("importAgentResultSchema", () => {
  it("accepts the shared Rust import DTO fixture", () => {
    const fixture: unknown = JSON.parse(importAgentResultFixture);

    const parsed = importAgentResultSchema.parse(fixture);

    expect(parsed.draft.provenance).toEqual({
      kind: "imported",
      sourceId: "source-id",
      expectedRevision: "revision",
    });
    expect(Object.keys(parsed.draft.platformOverrides)).toEqual(["claude"]);
  });

  for (const fixture of importedFixtures) {
    it(`accepts a ${fixture.platform} import with only its native override`, () => {
      const parsed = importAgentResultSchema.safeParse({
        draft: {
          logicalName: "imported-agent",
          description: "Imported native agent.",
          shared,
          responseLanguage: "followUser",
          usage,
          platformOverrides: fixture.platformOverrides,
          provenance: {
            kind: "imported",
            sourceId: "source-id",
            expectedRevision: "revision",
          },
        },
        platform: fixture.platform,
        sourceId: "source-id",
        sourceRevision: "revision",
        adapterContractVersion: "1.0.0",
        preservedFields: [],
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(Object.keys(parsed.data.draft.platformOverrides)).toEqual([
          fixture.platform,
        ]);
      }
    });
  }
});
