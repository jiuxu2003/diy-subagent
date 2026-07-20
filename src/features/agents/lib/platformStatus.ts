import type { AgentPlatform, InventoryScan } from "../../../contracts";

export interface PlatformInstallStatus {
  platform: AgentPlatform;
  /** True when the platform root directory (e.g. `~/.claude`) exists. */
  platformDetected: boolean;
  /** True when at least one native agent source was discovered. */
  hasSources: boolean;
}

/**
 * Derive a per-platform install status from an inventory scan so the
 * installed page can distinguish "platform installed but no subagents"
 * from "platform not detected".
 */
export function platformInstallStatuses(
  scan: InventoryScan,
): PlatformInstallStatus[] {
  const platformsWithSources = new Set<AgentPlatform>();
  for (const group of scan.groups) {
    for (const source of group.sources) {
      platformsWithSources.add(source.platform);
    }
  }
  return scan.directories.map((directory) => ({
    platform: directory.platform,
    platformDetected: directory.platformDetected,
    hasSources: platformsWithSources.has(directory.platform),
  }));
}
