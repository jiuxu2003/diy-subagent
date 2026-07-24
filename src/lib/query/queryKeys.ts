import type { AgentPlatform } from "../../contracts";

export const queryKeys = {
  templates: {
    all: ["templates"] as const,
    detail: (templateId: string) => ["templates", templateId] as const,
  },
  directories: ["platform-directories"] as const,
  codexModels: ["codex-models"] as const,
  inventory: {
    all: ["inventory"] as const,
    platforms: (platforms?: AgentPlatform[]) =>
      ["inventory", ...(platforms ?? [])] as const,
  },
};
