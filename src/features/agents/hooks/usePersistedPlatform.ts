import { useState } from "react";

import { agentPlatformSchema, type AgentPlatform } from "../../../contracts";

const STORAGE_KEY = "diy-subagent.platform";
const DEFAULT_PLATFORM: AgentPlatform = "codex";

function readPersistedPlatform(): AgentPlatform {
  try {
    const parsed = agentPlatformSchema.safeParse(
      window.localStorage.getItem(STORAGE_KEY),
    );
    return parsed.success ? parsed.data : DEFAULT_PLATFORM;
  } catch {
    // localStorage can throw in locked-down webviews; use the default.
    return DEFAULT_PLATFORM;
  }
}

/**
 * Top-bar platform selection remembered across launches (PRD D4).
 * localStorage acts as a UI preference cache only — never application
 * data — and any stored garbage falls back to the Codex default.
 */
export function usePersistedPlatform(): readonly [
  AgentPlatform,
  (platform: AgentPlatform) => void,
] {
  const [platform, setPlatform] = useState<AgentPlatform>(
    readPersistedPlatform,
  );

  const selectPlatform = (next: AgentPlatform) => {
    setPlatform(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the in-session selection still applies.
    }
  };

  return [platform, selectPlatform] as const;
}
