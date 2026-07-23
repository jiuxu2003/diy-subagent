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
import { platformLabel } from "../../../lib/formatting/platform";

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

/**
 * Radix Select items reject empty-string values, so the "继承" choice
 * round-trips through this sentinel while the stored draft keeps null.
 */
const INHERIT_SENTINEL = "inherit";
const inheritOption = { value: INHERIT_SENTINEL, label: "继承" };

const responseLanguageOptions = [
  { value: "followUser", label: "跟随用户输入" },
  { value: "simplifiedChinese", label: "简体中文" },
  { value: "english", label: "English" },
];

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

const codexReasoningEffortOptions = [
  inheritOption,
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
];

const codexSandboxModeOptions = [
  inheritOption,
  { value: "read-only", label: "read-only" },
  { value: "workspace-write", label: "workspace-write" },
  { value: "danger-full-access", label: "danger-full-access" },
];

function createPlatformOverride(platform: AgentPlatform): PlatformOverride {
  switch (platform) {
    case "claude":
      return {
        platform,
        config: { tools: [], disallowedTools: [], skills: [] },
      };
    case "codex":
      return { platform, config: { nicknameCandidates: [] } };
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
  const [personalTemplateName, setPersonalTemplateName] = useState(
    `${draft.logicalName} 模板`,
  );
  const updateShared = <Key extends keyof AgentDraft["shared"]>(
    key: Key,
    value: AgentDraft["shared"][Key],
  ) => {
    onDraftChange({ ...draft, shared: { ...draft.shared, [key]: value } });
  };
  const updateUsage = <Key extends keyof AgentDraft["usage"]>(
    key: Key,
    value: AgentDraft["usage"][Key],
  ) => {
    onDraftChange({ ...draft, usage: { ...draft.usage, [key]: value } });
  };

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
        title="身份与委派描述"
        description="名称决定文件名与调用标识；描述决定何时自动委派。"
      >
        <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-5">
          <FieldShell
            htmlFor="logical-name"
            label="逻辑名称"
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
            label="委派描述"
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
      </EditorSection>

      <EditorSection title="共享语义章节">
        <div className="space-y-5">
          <TextField
            id="role-goal"
            label="角色目标"
            value={draft.shared.roleGoal}
            onChange={(value) => {
              updateShared("roleGoal", value);
            }}
          />
          <div className="grid grid-cols-2 gap-5">
            <ListField
              id="when-to-use"
              label="适用场景"
              values={draft.shared.whenToUse}
              onChange={(value) => {
                updateShared("whenToUse", value);
              }}
            />
            <ListField
              id="when-not-to-use"
              label="禁用场景"
              values={draft.shared.whenNotToUse}
              onChange={(value) => {
                updateShared("whenNotToUse", value);
              }}
            />
            <ListField
              id="input-requirements"
              label="输入要求"
              values={draft.shared.inputRequirements}
              onChange={(value) => {
                updateShared("inputRequirements", value);
              }}
            />
            <ListField
              id="execution-steps"
              label="执行步骤"
              values={draft.shared.executionSteps}
              onChange={(value) => {
                updateShared("executionSteps", value);
              }}
            />
          </div>
          <TextField
            id="output-contract"
            label="输出契约"
            value={draft.shared.outputContract}
            onChange={(value) => {
              updateShared("outputContract", value);
            }}
          />
          <div className="grid grid-cols-2 gap-5">
            <ListField
              id="constraints"
              label="约束"
              values={draft.shared.constraints}
              onChange={(value) => {
                updateShared("constraints", value);
              }}
            />
            <ListField
              id="stop-conditions"
              label="停止条件"
              values={draft.shared.stopConditions}
              onChange={(value) => {
                updateShared("stopConditions", value);
              }}
            />
          </div>
          <TextField
            id="failure-handling"
            label="失败处理"
            value={draft.shared.failureHandling}
            onChange={(value) => {
              updateShared("failureHandling", value);
            }}
          />
        </div>
      </EditorSection>

      <EditorSection title="语言与使用契约">
        <div className="grid grid-cols-2 gap-5">
          <FieldShell htmlFor="response-language" label="响应语言">
            <Select
              id="response-language"
              onValueChange={(next) => {
                onDraftChange({
                  ...draft,
                  responseLanguage: next as AgentDraft["responseLanguage"],
                });
              }}
              options={responseLanguageOptions}
              value={draft.responseLanguage}
            />
          </FieldShell>
          <ListField
            id="invocation-examples"
            label="显式调用示例"
            values={draft.usage.explicitInvocationExamples}
            onChange={(value) => {
              updateUsage("explicitInvocationExamples", value);
            }}
          />
          <TextField
            id="delegation-guidance"
            label="自动委派建议"
            value={draft.usage.autoDelegationGuidance}
            onChange={(value) => {
              updateUsage("autoDelegationGuidance", value);
            }}
          />
          <TextField
            id="verification-task"
            label="安装后验证任务"
            value={draft.usage.verificationTask}
            onChange={(value) => {
              updateUsage("verificationTask", value);
            }}
          />
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

function TextField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldShell htmlFor={id} label={label}>
      <Textarea
        id={id}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        value={value}
      />
    </FieldShell>
  );
}

function ListField({
  id,
  label,
  values,
  onChange,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <FieldShell htmlFor={id} hint="每行一项" label={label}>
      <Textarea
        id={id}
        onChange={(event) => {
          onChange(lines(event.currentTarget.value));
        }}
        value={values.join("\n")}
      />
    </FieldShell>
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
    return (
      <div className="mt-3 grid grid-cols-3 gap-5 border-t border-[var(--border)] pt-3">
        <FieldShell htmlFor="codex-model" label="model">
          <Input
            id="codex-model"
            onChange={(event) => {
              update({
                ...value,
                config: {
                  ...value.config,
                  model: nullable(event.currentTarget.value),
                },
              });
            }}
            placeholder="继承父会话"
            value={value.config.model ?? ""}
          />
        </FieldShell>
        <FieldShell htmlFor="codex-effort" label="model_reasoning_effort">
          <Select
            id="codex-effort"
            onValueChange={(next) => {
              update({
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
        <FieldShell htmlFor="codex-sandbox" label="sandbox_mode">
          <Select
            id="codex-sandbox"
            onValueChange={(next) => {
              update({
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

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
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
