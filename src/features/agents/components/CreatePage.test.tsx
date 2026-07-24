import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import importAgentResultFixture from "../../../../tests/fixtures/import-agent-result-claude.json?raw";
import type {
  AgentDraft,
  TemplatePackage,
  TemplateSummary,
} from "../../../contracts";
import {
  importAgentResultSchema,
  templatePackageSchema,
  templateSummarySchema,
} from "../../../contracts";
import { CreatePage } from "./CreatePage";

// Mock function constants avoid unbound-method references to appIpc members.
const ipcMocks = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  savePersonalTemplate: vi.fn(),
  listCodexModels: vi.fn(),
}));

vi.mock("../../../lib/ipc/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, appIpc: ipcMocks };
});

function summary(
  id: string,
  name: string,
  description: string,
): TemplateSummary {
  return templateSummarySchema.parse({
    id,
    version: "1.0.0",
    name,
    description,
    tags: [],
    supportedPlatforms: ["codex"],
    risk: { level: "low", summary: "默认只读，不预设写权限。" },
  });
}

function templatePackage(
  id: string,
  name: string,
  logicalName: string,
  developerInstructions = "Follow the scoped instructions.",
): TemplatePackage {
  return templatePackageSchema.parse({
    manifest: {
      id,
      version: "1.0.0",
      name,
      description: `${name}模板`,
      author: "OpenAI Codex 官方文档示例",
      source: "builtin",
      tags: [],
      supportedPlatforms: ["codex"],
      risk: { level: "low", summary: "默认只读，不预设写权限。" },
      adapterContracts: { codex: "codex-custom-agent-2026-07" },
    },
    logicalName,
    defaultDescription: "处理指定范围内的任务。",
    developerInstructions,
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
}

// The backend returns summaries alphabetically by id, so custom-blank
// arrives in the middle; the page must still pin it first.
const summaries = [
  summary("browser_debugger", "浏览器调试员", "在浏览器中复现并调试 UI 问题。"),
  summary("code_mapper", "代码地图师", "只读梳理代码结构与调用路径。"),
  summary("custom-blank", "自定义", "从空白开始定制一个 subagent。"),
  summary("docs_researcher", "文档研究员", "检索并核对官方文档。"),
  summary("pr_explorer", "PR 探索者", "只读梳理 PR 变更与影响面。"),
  summary("reviewer", "代码评审员", "审查代码变更。"),
  summary("ui_fixer", "UI 修复师", "修复界面样式问题。"),
];

// Mirrors resources/templates/custom-blank.json: empty starter values plus
// the codex defaults (medium effort, read-only sandbox).
const customBlankPackage: TemplatePackage = templatePackageSchema.parse({
  manifest: {
    id: "custom-blank",
    version: "1.0.0",
    name: "自定义",
    description: "从空白开始定制一个 subagent。",
    author: "DIY Subagent",
    source: "builtin",
    tags: ["自定义"],
    supportedPlatforms: ["claude", "codex", "cursor"],
    risk: { level: "low", summary: "空白起点，不预设任何工具或权限。" },
    adapterContracts: {
      claude: "claude-subagent-2026-07",
      codex: "codex-custom-agent-2026-07",
      cursor: "cursor-subagent-2026-07",
    },
  },
  logicalName: "",
  defaultDescription: "",
  developerInstructions: "",
  platformOverrides: {
    claude: { platform: "claude", config: {} },
    codex: {
      platform: "codex",
      config: { modelReasoningEffort: "medium", sandboxMode: "read-only" },
    },
    cursor: { platform: "cursor", config: {} },
  },
});

const reviewerPackage = templatePackage(
  "reviewer",
  "代码评审员",
  "reviewer",
  "Review the staged changes with evidence.",
);

const importedDraft: AgentDraft = importAgentResultSchema.parse(
  JSON.parse(importAgentResultFixture),
).draft;

function renderCreatePage(imported: AgentDraft | null = null) {
  const onBack = vi.fn();
  const onFinished = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <CreatePage
          importedDraft={imported}
          onBack={onBack}
          onFinished={onFinished}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onBack, onFinished };
}

beforeEach(() => {
  ipcMocks.listCodexModels.mockResolvedValue({
    baseUrl: "https://api.openai.com/v1",
    models: [],
    fetchedAtMs: 0,
    fromCache: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CreatePage", () => {
  it("pins 自定义 first and loads the blank template with codex defaults", async () => {
    ipcMocks.listTemplates.mockResolvedValue(summaries);
    ipcMocks.getTemplate.mockResolvedValue(customBlankPackage);

    renderCreatePage();

    const group = await screen.findByRole("group", { name: "预设模板" });
    const chips = within(group).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "自定义",
      "浏览器调试员",
      "代码地图师",
      "文档研究员",
      "PR 探索者",
      "代码评审员",
      "UI 修复师",
    ]);
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");
    expect(ipcMocks.getTemplate).toHaveBeenCalledWith("custom-blank");

    expect(await screen.findByRole("textbox", { name: "名称" })).toHaveValue(
      "",
    );
    expect(screen.getByRole("textbox", { name: "遵循指令" })).toHaveValue("");
    expect(screen.getByLabelText("model_reasoning_effort")).toHaveTextContent(
      "medium",
    );
    expect(screen.getByLabelText("sandbox_mode")).toHaveTextContent(
      "read-only",
    );
    expect(screen.getByText(/从空白开始定制一个 subagent/)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "新建 Subagent" }),
    ).toBeVisible();
  });

  it("loads the clicked preset template into the editor", async () => {
    const user = userEvent.setup();
    ipcMocks.listTemplates.mockResolvedValue(summaries);
    ipcMocks.getTemplate
      .mockResolvedValueOnce(customBlankPackage)
      .mockResolvedValueOnce(reviewerPackage);

    renderCreatePage();
    expect(await screen.findByRole("textbox", { name: "名称" })).toHaveValue(
      "",
    );

    await user.click(screen.getByRole("button", { name: "代码评审员" }));

    expect(await screen.findByDisplayValue("reviewer")).toBeVisible();
    expect(ipcMocks.getTemplate).toHaveBeenLastCalledWith("reviewer");
    expect(screen.getByRole("button", { name: "代码评审员" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/审查代码变更/)).toBeVisible();
  });

  it("keeps the editor mounted while a newly clicked template loads", async () => {
    const user = userEvent.setup();
    let resolveNext!: (value: TemplatePackage) => void;
    ipcMocks.listTemplates.mockResolvedValue(summaries);
    ipcMocks.getTemplate
      .mockResolvedValueOnce(templatePackage("custom-blank", "自定义", "my-agent"))
      .mockImplementationOnce(() =>
        new Promise<TemplatePackage>((resolve) => {
          resolveNext = resolve;
        })
      );

    renderCreatePage();
    expect(await screen.findByDisplayValue("my-agent")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "代码评审员" }));

    // The chip selection moves immediately, but the previous template's
    // editor stays mounted instead of flashing the loading page.
    expect(screen.getByRole("button", { name: "代码评审员" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByDisplayValue("my-agent")).toBeVisible();
    expect(screen.queryByText("正在读取模板…")).not.toBeInTheDocument();

    resolveNext(reviewerPackage);

    expect(await screen.findByDisplayValue("reviewer")).toBeVisible();
    expect(screen.queryByDisplayValue("my-agent")).not.toBeInTheDocument();
  });

  it("renders no preset chips in import mode", async () => {
    renderCreatePage(importedDraft);

    expect(
      await screen.findByRole("heading", { name: "编辑 imported-agent" }),
    ).toBeVisible();
    expect(await screen.findByDisplayValue("imported-agent")).toBeVisible();
    expect(screen.queryByRole("group", { name: "预设模板" }))
      .not.toBeInTheDocument();
    expect(ipcMocks.listTemplates).not.toHaveBeenCalled();
    expect(ipcMocks.getTemplate).not.toHaveBeenCalled();
  });
});
