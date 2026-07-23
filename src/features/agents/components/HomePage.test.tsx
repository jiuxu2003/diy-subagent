import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import importAgentResultFixture from "../../../../tests/fixtures/import-agent-result-claude.json?raw";
import type {
  AgentDraft,
  AgentPlatform,
  DiscoveredAgent,
  PlatformDirectory,
} from "../../../contracts";
import {
  importAgentResultSchema,
  inventoryScanSchema,
} from "../../../contracts";
import { HomePage } from "./HomePage";

// Mock function constants avoid unbound-method references to appIpc members.
const ipcMocks = vi.hoisted(() => ({
  scanInstalledAgents: vi.fn(),
  importAgentForEditing: vi.fn(),
}));

vi.mock("../../../lib/ipc/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, appIpc: ipcMocks };
});

function directory(
  platform: AgentPlatform,
  platformDetected: boolean,
): PlatformDirectory {
  return {
    platform,
    absolutePath: `/Users/tester/.${platform}/agents`,
    source: "default",
    availability: platformDetected ? "ready" : "missing",
    platformDetected,
    canRead: platformDetected,
    canWrite: platformDetected,
  };
}

function discovered(
  platform: AgentPlatform,
  logicalName: string,
  overrides: Partial<DiscoveredAgent> = {},
): DiscoveredAgent {
  return {
    sourceId: `${platform}-${logicalName}`,
    platform,
    logicalName,
    description: "Reviews the requested changes.",
    revision: `${platform}-rev-1`,
    pathLabel: `~/.${platform}/agents/${logicalName}.md`,
    parseStatus: "valid",
    ownership: "external",
    errorCode: null,
    compatibilityExposure: false,
    ...overrides,
  };
}

const allDirectories = [
  directory("claude", true),
  directory("codex", true),
  directory("cursor", false),
];

const scanWithSources = inventoryScanSchema.parse({
  inventoryRevision: "rev-1",
  directories: allDirectories,
  groups: [
    {
      logicalName: "code-reviewer",
      sources: [
        discovered("claude", "code-reviewer"),
        // Imported ownership must NOT surface a pill on the home card.
        discovered("codex", "code-reviewer", { ownership: "imported" }),
      ],
      hasConflict: false,
    },
    {
      logicalName: "docs-writer",
      sources: [discovered("claude", "docs-writer")],
      hasConflict: false,
    },
  ],
});

const scanWithClaudeOnly = inventoryScanSchema.parse({
  inventoryRevision: "rev-2",
  directories: allDirectories,
  groups: [
    {
      logicalName: "docs-writer",
      sources: [discovered("claude", "docs-writer")],
      hasConflict: false,
    },
  ],
});

const scanWithBrokenSources = inventoryScanSchema.parse({
  inventoryRevision: "rev-3",
  directories: allDirectories,
  groups: [
    {
      logicalName: "broken-agent",
      sources: [
        discovered("codex", "broken-agent", {
          parseStatus: "invalid",
          errorCode: "parseError",
        }),
      ],
      hasConflict: false,
    },
    {
      logicalName: "readonly-agent",
      sources: [
        discovered("codex", "readonly-agent", {
          parseStatus: "readOnlyUnsupported",
        }),
      ],
      hasConflict: false,
    },
  ],
});

const importResult = importAgentResultSchema.parse(
  JSON.parse(importAgentResultFixture),
);

function renderHomePage(
  platform: AgentPlatform,
  onImported: (draft: AgentDraft) => void = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomePage onImported={onImported} platform={platform} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("HomePage", () => {
  it("renders only the selected platform's sources as cards", async () => {
    ipcMocks.scanInstalledAgents.mockResolvedValue(scanWithSources);

    renderHomePage("codex");

    expect(
      await screen.findByRole("heading", { name: "code-reviewer" }),
    ).toBeVisible();
    expect(screen.getByText("~/.codex/agents/code-reviewer.md")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "docs-writer" }))
      .not.toBeInTheDocument();
  });

  it("keeps a healthy card clean: no status pill, edit as the only action", async () => {
    ipcMocks.scanInstalledAgents.mockResolvedValue(scanWithSources);

    renderHomePage("codex");

    expect(await screen.findByRole("button", { name: "编辑" })).toBeEnabled();
    // valid + imported sources carry no pill; these labels are retired.
    expect(screen.queryByText("可导入")).not.toBeInTheDocument();
    expect(screen.queryByText("已导入")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看文件" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finder" }))
      .not.toBeInTheDocument();
  });

  it("pills abnormal parse states and disables editing with a hint", async () => {
    ipcMocks.scanInstalledAgents.mockResolvedValue(scanWithBrokenSources);

    renderHomePage("codex");

    expect(await screen.findByText("解析失败")).toBeVisible();
    expect(screen.getByText("只读")).toBeVisible();

    const editButtons = screen.getAllByRole("button", { name: "编辑" });
    expect(editButtons).toHaveLength(2);
    for (const button of editButtons) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByTitle("该文件无法解析，暂不能编辑")).toBeInTheDocument();
    expect(screen.getByTitle("该文件为只读格式，暂不能编辑"))
      .toBeInTheDocument();
  });

  it("shows the not-detected empty state for an undetected platform", async () => {
    ipcMocks.scanInstalledAgents.mockResolvedValue(scanWithSources);

    renderHomePage("cursor");

    expect(await screen.findByText("未检测到 Cursor")).toBeVisible();
    expect(screen.queryByText("点右上角 + 从模板开始")).not.toBeInTheDocument();
  });

  it("shows the no-subagent empty state for a detected platform", async () => {
    ipcMocks.scanInstalledAgents.mockResolvedValue(scanWithClaudeOnly);

    renderHomePage("codex");

    expect(await screen.findByText("已安装 Codex，暂无 subagent"))
      .toBeVisible();
    expect(screen.getByText("点右上角 + 从模板开始")).toBeVisible();
  });

  it("imports a source and hands the draft to onImported", async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    ipcMocks.scanInstalledAgents.mockResolvedValue(scanWithSources);
    ipcMocks.importAgentForEditing.mockResolvedValue(importResult);

    renderHomePage("codex", onImported);

    await user.click(
      await screen.findByRole("button", { name: "编辑" }),
    );

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledWith(importResult.draft);
    });
    expect(ipcMocks.importAgentForEditing).toHaveBeenCalledWith(
      "codex-code-reviewer",
      "codex-rev-1",
    );
  });
});
