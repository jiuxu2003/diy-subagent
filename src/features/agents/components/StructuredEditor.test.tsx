import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentDraft, TargetSelection } from "../../../contracts";
import { StructuredEditor } from "./StructuredEditor";

// Mock function constants avoid unbound-method references to appIpc members.
const ipcMocks = vi.hoisted(() => ({
  listCodexModels: vi.fn(),
}));

vi.mock("../../../lib/ipc/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, appIpc: ipcMocks };
});

const draft: AgentDraft = {
  logicalName: "test-agent",
  description: "Use this agent for focused analysis.",
  developerInstructions:
    "Inspect the requested work and report verifiable evidence.",
  platformOverrides: {
    claude: {
      platform: "claude",
      config: { tools: [], disallowedTools: [], skills: [] },
    },
  },
  provenance: {
    kind: "personalTemplate",
    templateId: "personal-test-agent",
    templateVersion: "1.0.0",
  },
};

const targets: TargetSelection[] = [
  { platform: "claude", conflictAction: "fail" },
];

const codexDraft: AgentDraft = {
  ...draft,
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
};

const codexTargets: TargetSelection[] = [
  { platform: "codex", conflictAction: "fail" },
];

const modelList = {
  baseUrl: "https://api.openai.com/v1",
  models: ["gpt-5.4", "gpt-5.6-sol"],
  fetchedAtMs: 1_753_000_000_000,
  fromCache: true,
};

interface RenderOptions {
  draft?: AgentDraft;
  targets?: TargetSelection[];
  personalTemplateSaveMessage?: string | null;
}

function renderEditor(options: RenderOptions = {}) {
  const callbacks = {
    onBack: vi.fn(),
    onDraftChange: vi.fn(),
    onPreview: vi.fn(),
    onSavePersonalTemplate: vi.fn(),
    onTargetsChange: vi.fn(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <StructuredEditor
          draft={options.draft ?? draft}
          error={null}
          isPreviewing={false}
          isSavingPersonalTemplate={false}
          personalTemplateSaveMessage={options.personalTemplateSaveMessage ??
            null}
          targets={options.targets ?? targets}
          {...callbacks}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return callbacks;
}

beforeEach(() => {
  vi.clearAllMocks();
  ipcMocks.listCodexModels.mockResolvedValue(modelList);
});

describe("StructuredEditor", () => {
  it("renders only the three main fields and drops the removed sections", () => {
    renderEditor();

    expect(screen.getByRole("textbox", { name: "名称" })).toHaveValue(
      "test-agent",
    );
    expect(screen.getByRole("textbox", { name: "描述" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "遵循指令" })).toHaveValue(
      draft.developerInstructions,
    );
    expect(screen.getByRole("button", { name: "遵循指令说明" })).toBeVisible();

    expect(screen.queryByText("共享语义章节")).not.toBeInTheDocument();
    expect(screen.queryByText("语言与使用契约")).not.toBeInTheDocument();
    expect(screen.queryByText("角色目标")).not.toBeInTheDocument();
    expect(screen.queryByText("响应语言")).not.toBeInTheDocument();
    expect(screen.queryByText("安装后验证任务")).not.toBeInTheDocument();
  });

  it("creates a codex override with medium effort and read-only sandbox", async () => {
    const user = userEvent.setup();
    const callbacks = renderEditor();

    await user.click(screen.getByRole("checkbox", { name: "Codex" }));

    expect(callbacks.onDraftChange).toHaveBeenCalledWith({
      ...draft,
      platformOverrides: {
        ...draft.platformOverrides,
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
    expect(callbacks.onTargetsChange).toHaveBeenCalledWith([
      ...targets,
      { platform: "codex", conflictAction: "fail" },
    ]);
  });

  it("lists the full official reasoning-effort ladder", async () => {
    const user = userEvent.setup();
    renderEditor({ draft: codexDraft, targets: codexTargets });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();

    await user.click(screen.getByLabelText("model_reasoning_effort"));

    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "继承",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
  });

  it("offers fetched models in the datalist and refreshes on demand", async () => {
    const user = userEvent.setup();
    renderEditor({ draft: codexDraft, targets: codexTargets });

    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();
    expect(ipcMocks.listCodexModels).toHaveBeenCalledWith({
      forceRefresh: false,
    });

    const modelInput = screen.getByLabelText("model");
    expect(modelInput).toHaveAttribute("list", "codex-model-options");
    const datalist = document.getElementById("codex-model-options");
    expect(datalist).toBeInstanceOf(HTMLDataListElement);
    const values = Array.from(datalist?.querySelectorAll("option") ?? []).map(
      (option) => option.value,
    );
    expect(values).toEqual(["gpt-5.4", "gpt-5.6-sol"]);

    ipcMocks.listCodexModels.mockResolvedValue({
      ...modelList,
      models: ["gpt-6"],
      fromCache: false,
    });
    await user.click(screen.getByRole("button", { name: "刷新模型列表" }));

    expect(ipcMocks.listCodexModels).toHaveBeenLastCalledWith({
      forceRefresh: true,
    });
    expect(await screen.findByText("已获取 1 个模型")).toBeVisible();
  });

  it("explains sandbox modes from the help tooltip", async () => {
    renderEditor({ draft: codexDraft, targets: codexTargets });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();

    fireEvent.focus(screen.getByRole("button", { name: "沙盒模式说明" }));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("read-only 只读");
    expect(tooltip).toHaveTextContent("danger-full-access 无限制");
  });

  it("trims the personal template name before saving", async () => {
    const user = userEvent.setup();
    const callbacks = renderEditor();
    const name = screen.getByRole("textbox", { name: /模板名称/ });

    await user.clear(name);
    await user.type(name, "  自定义模板  ");
    await user.click(screen.getByRole("button", { name: "保存个人模板" }));

    expect(callbacks.onSavePersonalTemplate).toHaveBeenCalledWith("自定义模板");
  });

  it("announces the personal template save result", () => {
    renderEditor({ personalTemplateSaveMessage: "保存失败，请重试。" });

    expect(screen.getByRole("status")).toHaveTextContent("保存失败，请重试。");
  });
});
