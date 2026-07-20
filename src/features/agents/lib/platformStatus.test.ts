import { describe, expect, it } from "vitest";

import type { DiscoveredAgent, InventoryScan } from "../../../contracts";
import { platformInstallStatuses } from "./platformStatus";

function directory(
  platform: "claude" | "codex" | "cursor",
  platformDetected: boolean,
): InventoryScan["directories"][number] {
  return {
    platform,
    absolutePath: `/Users/example/.${platform}/agents`,
    source: "default",
    availability: "missing",
    platformDetected,
    canRead: false,
    canWrite: false,
  };
}

function source(platform: "claude" | "codex" | "cursor"): DiscoveredAgent {
  return {
    sourceId: `${platform}-source`,
    platform,
    logicalName: "reviewer",
    description: null,
    revision: "rev",
    pathLabel: `~/.${platform}/agents/reviewer`,
    parseStatus: "valid",
    ownership: "external",
    errorCode: null,
    compatibilityExposure: false,
  };
}

describe("platformInstallStatuses", () => {
  it("distinguishes detected platforms without subagents from undetected ones", () => {
    const scan: InventoryScan = {
      inventoryRevision: "r1",
      directories: [
        directory("claude", true),
        directory("codex", false),
        directory("cursor", true),
      ],
      groups: [
        {
          logicalName: "reviewer",
          sources: [source("cursor")],
          hasConflict: false,
        },
      ],
    };

    expect(platformInstallStatuses(scan)).toEqual([
      { platform: "claude", platformDetected: true, hasSources: false },
      { platform: "codex", platformDetected: false, hasSources: false },
      { platform: "cursor", platformDetected: true, hasSources: true },
    ]);
  });
});
