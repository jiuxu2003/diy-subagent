import { RefreshCw } from "lucide-react";
import { useState } from "react";

import type {
  AgentDraft,
  AgentPlatform,
  ConflictAction,
  PlatformOverride,
  TargetSelection,
} from "../../../contracts";
import { Button } from "../../../components/ui/Button";
import {
  FieldShell,
  Input,
  Select,
  Textarea,
} from "../../../components/ui/FormField";
import { HelpTip } from "../../../components/ui/Tooltip";
import { cn } from "../../../lib/formatting/cn";
import { platformLabel } from "../../../lib/formatting/platform";
import { useCodexModels } from "../hooks/useCodexModels";

interface StructuredEditorProps {
  draft: AgentDraft;
  targets: TargetSelection[];
  isPreviewing: boolean;
  isSavingPersonalTemplate: boolean;
  error: string | null;
  onDraftChange: (draft: AgentDraft) => void;
  onTargetsChange: (targets: TargetSelection[]) => void;
  onPreview: () => void;
  onSavePersonalTemplate: (name: string) => void;
  onBack: () => void;
  personalTemplateSaveMessage: string | null;
}

const platforms: AgentPlatform[] = ["claude", "codex", "cursor"];

type CodexPlatformOverride = Extract<PlatformOverride, { platform: "codex" }>;

/**
 * Radix Select items reject empty-string values, so the "继承" choice
 * round-trips through this sentinel while the stored draft keeps null.
 */
const INHERIT_SENTINEL = "inherit";
const inheritOption = { value: INHERIT_SENTINEL, label: "继承" };

const conflictActionOptions = [
  { value: "fail", label: "冲突时阻止" },
  { value: "replaceAfterBackup", label: "备份后替换" },
];

const claudePermissionModeOptions = [
  inheritOption,
  { value: "plan", label: "plan" },
  { value: "default", label: "default" },
  { value: "acceptEdits", label: "acceptEdits" },
  { value: "dontAsk", label: "dontAsk" },
];

/**
 * Official reasoning-effort ladder, low to high, per the Codex source enum
 * (research/external.md). Availability per model is decided server-side.
 */
const codexReasoningEffortOptions = [
  inheritOption,
  { value: "none", label: "none" },
  { value: "minimal", label: "minimal" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh" },
  { value: "max", label: "max" },
  { value: "ultra", label: "ultra" },
];

const codexSandboxModeOptions = [
  inheritOption,
  { value: "read-only", label: "read-only" },
  { value: "workspace-write", label: "workspace-write" },
  { value: "danger-full-access", label: "danger-full-access" },
];

const DEVELOPER_INSTRUCTIONS_HELP =
  "写入 developer_instructions 的核心行为指令：定义这个子代理的职责、工作方式与边界。安装前必填。";

const SANDBOX_MODE_HELP =
  "控制子代理的文件系统权限：read-only 只读；workspace-write 可写工作区；danger-full-access 无限制（危险）。继承 = 沿用父会话的沙盒策略。";

function createPlatformOverride(platform: AgentPlatform): PlatformOverride {
  switch (platform) {
    case "claude":
      return {
        platform,
        config: { tools: [], disallowedTools: [], skills: [] },
      };
    case "codex":
      // New codex targets start from the blank-template defaults so both
      // entry paths agree on medium effort plus read-only sandbox.
      return {
        platform,
        config: {
          nicknameCandidates: [],
          modelReasoningEffort: "medium",
          sandboxMode: "read-only",
        },
      };
    case "cursor":
      return { platform, config: {} };
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

export function StructuredEditor({
  draft,
  targets,
  isPreviewing,
  isSavingPersonalTemplate,
  error,
  onDraftChange,
  onTargetsChange,
  onPreview,
  onSavePersonalTemplate,
  onBack,
  personalTemplateSaveMessage,
}: StructuredEditorProps) {
  const [personalTemplateName, setPersonalTemplateName] = useState(() =>
    draft.logicalName.trim().length > 0
      ? `${draft.logicalName} 模板`
      : "我的模板"
  );

  return (
    <section aria-label="结构化编辑" className="space-y-8">
      {error
        ? (
          <div
            className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]"
            role="alert"
          >
            {error}
          </div>
        )
        : null}

      <EditorSection
        title="基本信息"
        description="名称决定文件名与调用标识；描述决定何时自动委派。"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-5">
            <FieldShell
              htmlFor="logical-name"
              label="名称"
              hint="原生字段 name"
            >
              <Input
                id="logical-name"
                onChange={(event) => {
                  onDraftChange({
                    ...draft,
                    logicalName: event.currentTarget.value,
                  });
                }}
                spellCheck={false}
                value={draft.logicalName}
              />
            </FieldShell>
            <FieldShell
              htmlFor="description"
              label="描述"
              hint="说明何时使用，也说明何时不要使用"
            >
              <Textarea
                id="description"
                onChange={(event) => {
                  onDraftChange({
                    ...draft,
                    description: event.currentTarget.value,
                  });
                }}
                value={draft.description}
              />
            </FieldShell>
          </div>
          <FieldShell
            htmlFor="developer-instructions"
            label="遵循指令"
            labelAccessory={
              <HelpTip
                aria-label="遵循指令说明"
                content={DEVELOPER_INSTRUCTIONS_HELP}
              />
            }
            hint="原生字段 developer_instructions"
          >
            <Textarea
              id="developer-instructions"
              onChange={(event) => {
                onDraftChange({
                  ...draft,
                  developerInstructions: event.currentTarget.value,
                });
              }}
              rows={12}
              value={draft.developerInstructions}
            />
          </FieldShell>
        </div>
      </EditorSection>

      <EditorSection title="目标平台与高级字段">
        <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {platforms.map((platform) => (
            <PlatformTarget
              draft={draft}
              key={platform}
              onDraftChange={onDraftChange}
              onTargetsChange={onTargetsChange}
              platform={platform}
              targets={targets}
            />
          ))}
        </div>
      </EditorSection>

      <EditorSection
        title="保存为个人模板"
        description="模板保存在本机，可重复使用。"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-5">
          <FieldShell htmlFor="personal-template-name" label="模板名称">
            <Input
              id="personal-template-name"
              onChange={(event) => {
                setPersonalTemplateName(event.currentTarget.value);
              }}
              value={personalTemplateName}
            />
          </FieldShell>
          <Button
            disabled={isSavingPersonalTemplate ||
              personalTemplateName.trim().length === 0}
            onClick={() => {
              onSavePersonalTemplate(personalTemplateName.trim());
            }}
            variant="secondary"
          >
            {isSavingPersonalTemplate ? "正在保存…" : "保存个人模板"}
          </Button>
        </div>
        {personalTemplateSaveMessage
          ? (
            <p className="mt-3 text-sm text-[var(--text-muted)]" role="status">
              {personalTemplateSaveMessage}
            </p>
          )
          : null}
      </EditorSection>

      {/* Plain in-flow action row at the end of the form: a sticky footer
          kept covering the last sections while scrolling. */}
      <footer className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-5">
        <p className="text-sm text-[var(--text-muted)]">
          已选 {targets.length} 个平台
        </p>
        <div className="flex items-center gap-2.5">
          <Button onClick={onBack} size="lg" variant="ghost">
            取消
          </Button>
          <Button
            disabled={isPreviewing || targets.length === 0}
            onClick={onPreview}
            size="lg"
          >
            {isPreviewing ? "正在生成预览…" : "生成预览"}
          </Button>
        </div>
      </footer>
    </section>
  );
}

function EditorSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="border-b border-[var(--border)] pb-2.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {description
          ? (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {description}
            </p>
          )
          : null}
      </div>
      {children}
    </section>
  );
}

function PlatformTarget({
  platform,
  draft,
  targets,
  onDraftChange,
  onTargetsChange,
}: {
  platform: AgentPlatform;
  draft: AgentDraft;
  targets: TargetSelection[];
  onDraftChange: (draft: AgentDraft) => void;
  onTargetsChange: (targets: TargetSelection[]) => void;
}) {
  const selected = targets.find((target) => target.platform === platform);
  const platformOverride = draft.platformOverrides[platform] ??
    createPlatformOverride(platform);
  const importedPlatform = draft.provenance.kind === "imported"
    ? Object.keys(draft.platformOverrides)[0]
    : undefined;
  const disabled = draft.provenance.kind === "imported" &&
    importedPlatform !== platform;

  const toggle = () => {
    if (selected) {
      onTargetsChange(targets.filter((target) => target.platform !== platform));
      return;
    }
    if (draft.platformOverrides[platform] === undefined) {
      onDraftChange({
        ...draft,
        platformOverrides: {
          ...draft.platformOverrides,
          [platform]: platformOverride,
        },
      });
    }
    onTargetsChange([...targets, { platform, conflictAction: "fail" }]);
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          {/* The imported-only note stays outside the label so it never
              pollutes the checkbox accessible name. */}
          <label className="flex items-center gap-2.5 text-sm font-medium">
            <input
              checked={Boolean(selected)}
              className="size-4 accent-[var(--accent)]"
              disabled={disabled}
              onChange={toggle}
              type="checkbox"
            />
            {platformLabel(platform)}
          </label>
          {disabled
            ? (
              <span className="text-xs text-[var(--text-muted)]">
                仅可写回来源平台
              </span>
            )
            : null}
        </div>
        {selected
          ? (
            <Select
              aria-label={`${platformLabel(platform)} 冲突策略`}
              className="w-44"
              onValueChange={(next) => {
                onTargetsChange(
                  targets.map((target) =>
                    target.platform === platform
                      ? { ...target, conflictAction: next as ConflictAction }
                      : target
                  ),
                );
              }}
              options={conflictActionOptions}
              value={selected.conflictAction}
            />
          )
          : null}
      </div>
      {selected
        ? (
          <PlatformAdvancedFields
            draft={draft}
            onChange={onDraftChange}
            platform={platform}
            value={platformOverride}
          />
        )
        : null}
    </div>
  );
}

function PlatformAdvancedFields({
  platform,
  value,
  draft,
  onChange,
}: {
  platform: AgentPlatform;
  value: PlatformOverride;
  draft: AgentDraft;
  onChange: (draft: AgentDraft) => void;
}) {
  const update = (next: PlatformOverride) => {
    onChange({
      ...draft,
      platformOverrides: { ...draft.platformOverrides, [platform]: next },
    });
  };

  if (value.platform === "claude") {
    return (
      <div className="mt-3 grid grid-cols-3 gap-5 border-t border-[var(--border)] pt-3">
        <FieldShell htmlFor="claude-model" label="model">
          <Input
            id="claude-model"
            onChange={(event) => {
              update({
                ...value,
                config: {
                  ...value.config,
                  model: nullable(event.currentTarget.value),
                },
              });
            }}
            placeholder="inherit"
            value={value.config.model ?? ""}
          />
        </FieldShell>
        <FieldShell htmlFor="claude-permission" label="permissionMode">
          <Select
            id="claude-permission"
            onValueChange={(next) => {
              update({
                ...value,
                config: {
                  ...value.config,
                  permissionMode: fromSelectValue(next),
                },
              });
            }}
            options={claudePermissionModeOptions}
            value={toSelectValue(value.config.permissionMode)}
          />
        </FieldShell>
        <FieldShell htmlFor="claude-tools" label="tools" hint="逗号分隔">
          <Input
            id="claude-tools"
            onChange={(event) => {
              update({
                ...value,
                config: {
                  ...value.config,
                  tools: commaItems(event.currentTarget.value),
                },
              });
            }}
            value={value.config.tools.join(", ")}
          />
        </FieldShell>
      </div>
    );
  }
  if (value.platform === "codex") {
    return <CodexAdvancedFields onUpdate={update} value={value} />;
  }
  return (
    <div className="mt-3 grid grid-cols-3 gap-5 border-t border-[var(--border)] pt-3">
      <FieldShell htmlFor="cursor-model" label="model">
        <Input
          id="cursor-model"
          onChange={(event) => {
            update({
              ...value,
              config: {
                ...value.config,
                model: nullable(event.currentTarget.value),
              },
            });
          }}
          placeholder="inherit"
          value={value.config.model ?? ""}
        />
      </FieldShell>
      <label className="flex items-center gap-2.5 self-end rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium">
        <input
          checked={value.config.readonly ?? false}
          className="size-4 accent-[var(--accent)]"
          onChange={(event) => {
            update({
              ...value,
              config: {
                ...value.config,
                readonly: event.currentTarget.checked,
              },
            });
          }}
          type="checkbox"
        />
        readonly
      </label>
      <label className="flex items-center gap-2.5 self-end rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium">
        <input
          checked={value.config.isBackground ?? false}
          className="size-4 accent-[var(--accent)]"
          onChange={(event) => {
            update({
              ...value,
              config: {
                ...value.config,
                isBackground: event.currentTarget.checked,
              },
            });
          }}
          type="checkbox"
        />
        is_background
      </label>
    </div>
  );
}

/**
 * Codex advanced row. Lives in its own component so the model catalog is
 * only fetched once the Codex target is actually selected.
 */
function CodexAdvancedFields({
  value,
  onUpdate,
}: {
  value: CodexPlatformOverride;
  onUpdate: (next: PlatformOverride) => void;
}) {
  const models = useCodexModels();
  const catalogModels = models.catalog?.models ?? [];

  return (
    <div className="mt-3 grid grid-cols-3 gap-5 border-t border-[var(--border)] pt-3">
      <FieldShell
        htmlFor="codex-model"
        label="model"
        hint={modelCatalogHint(models)}
      >
        <div className="flex items-center gap-2">
          <Input
            id="codex-model"
            list="codex-model-options"
            onChange={(event) => {
              onUpdate({
                ...value,
                config: {
                  ...value.config,
                  model: nullable(event.currentTarget.value),
                },
              });
            }}
            placeholder="继承父会话"
            spellCheck={false}
            value={value.config.model ?? ""}
          />
          <datalist id="codex-model-options">
            {catalogModels.map((model) => <option key={model} value={model} />)}
          </datalist>
          <Button
            aria-label="刷新模型列表"
            className="shrink-0"
            disabled={models.isFetching}
            onClick={() => {
              models.refresh();
            }}
            size="icon"
            variant="secondary"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("size-3.5", models.isFetching && "animate-spin")}
            />
          </Button>
        </div>
      </FieldShell>
      <FieldShell htmlFor="codex-effort" label="model_reasoning_effort">
        <Select
          id="codex-effort"
          onValueChange={(next) => {
            onUpdate({
              ...value,
              config: {
                ...value.config,
                modelReasoningEffort: fromSelectValue(next),
              },
            });
          }}
          options={codexReasoningEffortOptions}
          value={toSelectValue(value.config.modelReasoningEffort)}
        />
      </FieldShell>
      <FieldShell
        htmlFor="codex-sandbox"
        label="sandbox_mode"
        labelAccessory={
          <HelpTip aria-label="沙盒模式说明" content={SANDBOX_MODE_HELP} />
        }
      >
        <Select
          id="codex-sandbox"
          onValueChange={(next) => {
            onUpdate({
              ...value,
              config: {
                ...value.config,
                sandboxMode: fromSelectValue(next),
              },
            });
          }}
          options={codexSandboxModeOptions}
          value={toSelectValue(value.config.sandboxMode)}
        />
      </FieldShell>
    </div>
  );
}

/** Status line under the model input; failures downgrade to manual entry. */
function modelCatalogHint(models: ReturnType<typeof useCodexModels>): string {
  if (models.isFetching) {
    return "正在获取模型列表…";
  }
  if (models.isError) {
    return "获取模型列表失败，可手动输入";
  }
  if (models.catalog === null) {
    return "可手动输入";
  }
  if (models.catalog.models.length === 0) {
    return "模型列表为空，可手动输入";
  }
  if (models.catalog.fromCache) {
    return "列表来自缓存，可手动输入";
  }
  return `已获取 ${String(models.catalog.models.length)} 个模型`;
}

function commaItems(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nullable(value: string): string | null {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

/** Maps a stored nullable field to the Select value (null → inherit sentinel). */
function toSelectValue(value: string | null | undefined): string {
  return value ?? INHERIT_SENTINEL;
}

/** Maps a Select value back to the stored field (inherit sentinel → null). */
function fromSelectValue(value: string): string | null {
  return value === INHERIT_SENTINEL ? null : value;
}
