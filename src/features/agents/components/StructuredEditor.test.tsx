import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentDraft,
  PlatformOverride,
  TargetSelection,
} from "../../../contracts";
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

type CodexConfig = Extract<PlatformOverride, { platform: "codex" }>["config"];

/** Draft targeting codex only, with blank-template defaults plus overrides. */
function codexDraftWith(config: Partial<CodexConfig>): AgentDraft {
  return {
    ...draft,
    platformOverrides: {
      codex: {
        platform: "codex",
        config: {
          nicknameCandidates: [],
          modelReasoningEffort: "medium",
          sandboxMode: "read-only",
          ...config,
        },
      },
    },
  };
}

const codexDraft = codexDraftWith({});

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

/** Opens the reasoning-effort select and returns the option labels. */
async function openEffortOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText("model_reasoning_effort"));
  return screen.getAllByRole("option").map((option) => option.textContent);
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

  it("stacks name and description on separate full-width rows", () => {
    renderEditor();

    const name = screen.getByRole("textbox", { name: "名称" });
    const description = screen.getByRole("textbox", { name: "描述" });
    expect(name.closest('[class*="grid-cols"]')).toBeNull();
    expect(description.closest('[class*="grid-cols"]')).toBeNull();
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

  it("limits reasoning efforts to the baseline ladder without a model", async () => {
    const user = userEvent.setup();
    renderEditor({ draft: codexDraft, targets: codexTargets });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();
    expect(screen.getByText("可用档位以所选模型为准")).toBeVisible();

    expect(await openEffortOptions(user)).toEqual([
      "继承",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("offers max and ultra efforts for gpt-5.6 models", async () => {
    const user = userEvent.setup();
    renderEditor({
      draft: codexDraftWith({ model: "gpt-5.6-sol" }),
      targets: codexTargets,
    });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();

    expect(await openEffortOptions(user)).toEqual([
      "继承",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
  });

  it("hides max and ultra efforts for gpt-5.4 models", async () => {
    const user = userEvent.setup();
    renderEditor({
      draft: codexDraftWith({ model: "gpt-5.4" }),
      targets: codexTargets,
    });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();

    expect(await openEffortOptions(user)).toEqual([
      "继承",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("falls back to the baseline ladder for unknown models", async () => {
    const user = userEvent.setup();
    renderEditor({
      draft: codexDraftWith({ model: "claude-opus" }),
      targets: codexTargets,
    });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();

    expect(await openEffortOptions(user)).toEqual([
      "继承",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("keeps a stored effort outside the ladder as an extra option", async () => {
    const user = userEvent.setup();
    renderEditor({
      draft: codexDraftWith({
        model: "gpt-5.4",
        modelReasoningEffort: "ultra",
      }),
      targets: codexTargets,
    });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();

    expect(await openEffortOptions(user)).toEqual([
      "继承",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "ultra",
    ]);
  });

  it("opens the model panel and fills the input from a picked option", async () => {
    const user = userEvent.setup();
    const callbacks = renderEditor({
      draft: codexDraft,
      targets: codexTargets,
    });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();
    expect(ipcMocks.listCodexModels).toHaveBeenCalledWith({
      forceRefresh: false,
    });

    const trigger = screen.getByRole("button", { name: "选择模型" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const listbox = await screen.findByRole("listbox");
    const labels = within(listbox)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(labels).toEqual(["gpt-5.4", "gpt-5.6-sol"]);

    await user.click(
      within(listbox).getByRole("option", { name: "gpt-5.6-sol" }),
    );

    expect(callbacks.onDraftChange).toHaveBeenCalledWith(
      codexDraftWith({ model: "gpt-5.6-sol" }),
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters panel options by case-insensitive substring", async () => {
    const user = userEvent.setup();
    renderEditor({
      draft: codexDraftWith({ model: "SOL" }),
      targets: codexTargets,
    });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "选择模型" }));

    const listbox = await screen.findByRole("listbox");
    const labels = within(listbox)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(labels).toEqual(["gpt-5.6-sol"]);
  });

  it("shows the full list when the input exactly matches an option", async () => {
    const user = userEvent.setup();
    renderEditor({
      draft: codexDraftWith({ model: "gpt-5.4" }),
      targets: codexTargets,
    });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "选择模型" }));

    const listbox = await screen.findByRole("listbox");
    const labels = within(listbox)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(labels).toEqual(["gpt-5.4", "gpt-5.6-sol"]);
    expect(
      within(listbox).getByRole("option", { name: "gpt-5.4" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("shows the no-match notice when nothing matches the input", async () => {
    const user = userEvent.setup();
    renderEditor({
      draft: codexDraftWith({ model: "totally-unknown" }),
      targets: codexTargets,
    });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "选择模型" }));

    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).queryAllByRole("option")).toHaveLength(0);
    expect(
      within(listbox).getByText("没有匹配的模型，可手动输入"),
    ).toBeVisible();
  });

  it("shows the empty-catalog notice inside the panel", async () => {
    ipcMocks.listCodexModels.mockResolvedValue({ ...modelList, models: [] });
    const user = userEvent.setup();
    renderEditor({ draft: codexDraft, targets: codexTargets });
    expect(await screen.findByText("模型列表为空，可手动输入")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "选择模型" }));

    const listbox = await screen.findByRole("listbox");
    expect(
      within(listbox).getByText("未获取到模型列表，可手动输入"),
    ).toBeVisible();
  });

  it("offers a retry action in the panel when the fetch fails", async () => {
    ipcMocks.listCodexModels.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderEditor({ draft: codexDraft, targets: codexTargets });
    expect(
      await screen.findByText("获取模型列表失败，可手动输入"),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "选择模型" }));

    const listbox = await screen.findByRole("listbox");
    ipcMocks.listCodexModels.mockResolvedValue(modelList);
    await user.click(within(listbox).getByRole("button", { name: "重试" }));

    expect(ipcMocks.listCodexModels).toHaveBeenLastCalledWith({
      forceRefresh: true,
    });
  });

  it("refreshes the model catalog on demand", async () => {
    const user = userEvent.setup();
    renderEditor({ draft: codexDraft, targets: codexTargets });
    expect(await screen.findByText("列表来自缓存，可手动输入")).toBeVisible();

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
