import { describe, expect, it } from "vitest";

import importAgentResultFixture from "../../tests/fixtures/import-agent-result-claude.json?raw";
import platformDirectoryFixture from "../../tests/fixtures/platform-directory-claude.json?raw";
import {
  codexModelListSchema,
  importAgentResultSchema,
  platformDirectorySchema,
} from "./index";

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

    expect(parsed.draft.developerInstructions).toContain(
      "Inspect the requested work.",
    );
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
          developerInstructions: "Inspect the requested work.",
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

describe("codexModelListSchema", () => {
  it("accepts a model catalog payload", () => {
    const parsed = codexModelListSchema.parse({
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-5.4", "gpt-5.6-sol"],
      fetchedAtMs: 1_753_000_000_000,
      fromCache: true,
    });

    expect(parsed.models).toEqual(["gpt-5.4", "gpt-5.6-sol"]);
    expect(parsed.fromCache).toBe(true);
  });

  it("rejects a payload without a models array", () => {
    const parsed = codexModelListSchema.safeParse({
      baseUrl: "https://api.openai.com/v1",
      fetchedAtMs: 0,
      fromCache: false,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("platformDirectorySchema", () => {
  it("accepts the shared Rust platform directory fixture", () => {
    const fixture: unknown = JSON.parse(platformDirectoryFixture);

    const parsed = platformDirectorySchema.parse(fixture);

    expect(parsed.availability).toBe("missing");
    expect(parsed.platformDetected).toBe(true);
  });
});
