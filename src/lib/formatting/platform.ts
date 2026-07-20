import type { AgentPlatform } from "../../contracts";

export const platformLabels = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
} satisfies Record<AgentPlatform, string>;

export const platformFileFormats = {
  claude: "YAML frontmatter + Markdown",
  codex: "Standalone TOML",
  cursor: "YAML frontmatter + Markdown",
} satisfies Record<AgentPlatform, string>;

export function platformLabel(platform: AgentPlatform): string {
  return platformLabels[platform];
}
