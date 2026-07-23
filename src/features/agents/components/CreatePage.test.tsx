import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    supportedPlatforms: ["claude", "codex", "cursor"],
    risk: { level: "low", summary: "默认只读，不预设写权限。" },
  });
}

function templatePackage(
  id: string,
  name: string,
  logicalName: string,
): TemplatePackage {
  return templatePackageSchema.parse({
    manifest: {
      id,
      version: "1.0.0",
      name,
      description: `${name}模板`,
      author: "DIY Subagent",
      source: "builtin",
      tags: [],
      supportedPlatforms: ["codex"],
      risk: { level: "low", summary: "默认只读，不预设写权限。" },
      adapterContracts: {
        claude: "claude-subagent-2026-07",
        codex: "codex-custom-agent-2026-07",
        cursor: "cursor-subagent-2026-07",
      },
    },
    logicalName,
    defaultDescription: "处理指定范围内的任务。",
    sharedDefaults: {
      roleGoal: "完成指定目标。",
      whenToUse: ["需要该能力时。"],
      whenNotToUse: ["超出范围时。"],
      inputRequirements: ["原始请求。"],
      executionSteps: ["按步骤执行。"],
      outputContract: "输出可验证结果。",
      constraints: ["不越权。"],
      stopConditions: ["达成目标。"],
      failureHandling: "报告缺失信息。",
    },
    usageDefaults: {
      explicitInvocationExamples: ["调用示例。"],
      autoDelegationGuidance: "在匹配场景自动委派。",
      verificationTask: "安装后运行一次验证。",
    },
    responseLanguage: "followUser",
    platformOverrides: { codex: { platform: "codex", config: {} } },
  });
}

// The backend returns summaries alphabetically by id, so custom-blank
// arrives in the middle; the page must still pin it first.
const summaries = [
  summary("code-reviewer", "代码审查员", "审查代码变更。"),
  summary("custom-blank", "自定义", "从空白开始定制一个 subagent。"),
  summary("docs-writer", "文档撰写员", "撰写与维护文档。"),
];

const customBlankPackage = templatePackage("custom-blank", "自定义", "my-agent");
const codeReviewerPackage = templatePackage(
  "code-reviewer",
  "代码审查员",
  "code-review-helper",
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
      <CreatePage
        importedDraft={imported}
        onBack={onBack}
        onFinished={onFinished}
      />
    </QueryClientProvider>,
  );
  return { onBack, onFinished };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CreatePage", () => {
  it("pins 自定义 first, selects it by default, and loads the blank template", async () => {
    ipcMocks.listTemplates.mockResolvedValue(summaries);
    ipcMocks.getTemplate.mockResolvedValue(customBlankPackage);

    renderCreatePage();

    const group = await screen.findByRole("group", { name: "预设模板" });
    const chips = within(group).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "自定义",
      "代码审查员",
      "文档撰写员",
    ]);
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");
    expect(ipcMocks.getTemplate).toHaveBeenCalledWith("custom-blank");
    expect(await screen.findByDisplayValue("my-agent")).toBeVisible();
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
      .mockResolvedValueOnce(codeReviewerPackage);

    renderCreatePage();
    expect(await screen.findByDisplayValue("my-agent")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "代码审查员" }));

    expect(await screen.findByDisplayValue("code-review-helper")).toBeVisible();
    expect(screen.queryByDisplayValue("my-agent")).not.toBeInTheDocument();
    expect(ipcMocks.getTemplate).toHaveBeenLastCalledWith("code-reviewer");
    expect(screen.getByRole("button", { name: "代码审查员" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/审查代码变更/)).toBeVisible();
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
