import * as Tabs from "@radix-ui/react-tabs";
import { ArrowLeft } from "lucide-react";

import type {
  PreviewBatch,
  PreviewTarget,
  RecoveryAction,
  TargetSelection,
} from "../../../contracts";
import { Button } from "../../../components/ui/Button";
import { StatusDot } from "../../../components/ui/StatusDot";
import { platformLabel } from "../../../lib/formatting/platform";

interface PreviewReviewProps {
  preview: PreviewBatch;
  targets: TargetSelection[];
  isCommitting: boolean;
  isRevealingRecovery: boolean;
  error: string | null;
  recovery: RecoveryAction | null;
  onBack: () => void;
  onCommit: () => void;
  onRevealRecovery: (recoveryId: string) => void;
}

type CapabilityDisposition =
  PreviewTarget["capabilityIssues"][number]["disposition"];

/** Human-readable presentation for adapter capability dispositions. */
const dispositionPresentation: Record<
  CapabilityDisposition,
  { label: string; tone: "neutral" | "warning" | "danger" }
> = {
  exact: { label: "精确映射", tone: "neutral" },
  promptOnly: { label: "写入正文", tone: "neutral" },
  nativeOnly: { label: "仅此平台", tone: "warning" },
  unsupported: { label: "不支持", tone: "warning" },
  preservedReadOnly: { label: "原样保留", tone: "warning" },
  blockedLossy: { label: "有损，已阻止", tone: "danger" },
};

export function PreviewReview({
  preview,
  targets,
  isCommitting,
  isRevealingRecovery,
  error,
  recovery,
  onBack,
  onCommit,
  onRevealRecovery,
}: PreviewReviewProps) {
  const firstTarget = preview.targets[0];
  if (!firstTarget) {
    return (
      <section
        className="mx-auto max-w-3xl rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
        role="alert"
      >
        预览结果不包含任何目标平台，请返回编辑并重新生成。
      </section>
    );
  }

  const blockingConflict = preview.targets.some((target) => {
    const selection = targets.find((item) => item.platform === target.platform);
    return target.conflictDetected && selection?.conflictAction === "fail";
  });

  const expiresLabel = new Date(preview.expiresAtMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section
      aria-labelledby="preview-heading"
      className="mx-auto max-w-6xl space-y-5"
    >
      <header className="flex items-end justify-between gap-6">
        <div>
          <Button onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft className="size-4" aria-hidden="true" />
            返回编辑
          </Button>
          <h1
            id="preview-heading"
            className="mt-3 text-2xl font-semibold tracking-tight"
          >
            确认安装
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            内容修改后需重新生成预览。
          </p>
        </div>
        <p className="shrink-0 text-sm text-[var(--text-muted)]">
          预览有效至 {expiresLabel} · 重启后失效
        </p>
      </header>

      {error
        ? (
          <div
            className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]"
            role="alert"
          >
            <p>{error}</p>
            {recovery?.action === "revealRecoveryDirectory"
              ? (
                <Button
                  className="mt-3"
                  disabled={isRevealingRecovery}
                  onClick={() => {
                    onRevealRecovery(recovery.recoveryId);
                  }}
                  size="sm"
                  variant="secondary"
                >
                  {isRevealingRecovery ? "正在打开恢复目录…" : "在 Finder 中显示恢复目录"}
                </Button>
              )
              : null}
          </div>
        )
        : null}

      {blockingConflict
        ? (
          <div className="rounded-md bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
            <p className="font-medium">存在名称冲突，当前策略会阻止提交</p>
            <p className="mt-1">
              返回编辑后修改逻辑名称，或为对应平台选择“备份后替换”。
            </p>
          </div>
        )
        : null}

      <Tabs.Root defaultValue={firstTarget.platform}>
        <Tabs.List
          className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-0.5"
          aria-label="平台预览"
        >
          {preview.targets.map((target) => (
            <Tabs.Trigger
              className="rounded px-4 py-1 text-sm font-medium text-[var(--text-muted)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] data-[state=active]:bg-[var(--surface)] data-[state=active]:text-[var(--text)]"
              key={target.platform}
              value={target.platform}
            >
              {platformLabel(target.platform)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {preview.targets.map((target) => (
          <Tabs.Content
            className="mt-4 outline-none"
            key={target.platform}
            value={target.platform}
          >
            <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4">
              <div className="self-start rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--text-muted)]">路径</p>
                    <p className="mt-0.5 break-all font-mono text-sm">
                      {target.targetPath}
                    </p>
                  </div>
                  <StatusDot
                    className="mt-0.5 shrink-0"
                    tone={target.conflictDetected ? "warning" : "success"}
                  >
                    {target.conflictDetected ? "发现冲突" : "预检通过"}
                  </StatusDot>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
                  <Definition
                    label="格式"
                    value={target.nativeFormat === "toml"
                      ? "TOML"
                      : "YAML + Markdown"}
                  />
                  <Definition
                    label="创建目录"
                    value={target.willCreateDirectory
                      ? "提交后创建"
                      : "无需创建"}
                  />
                  <Definition
                    label="备份"
                    value={target.willCreateBackup ? "提交前备份" : "无需备份"}
                  />
                  <Definition
                    label="版本"
                    value={target.currentRevision ? "已锁定" : "新文件"}
                  />
                </dl>
                {target.capabilityIssues.length > 0
                  ? (
                    <div className="space-y-2.5 border-t border-[var(--border)] px-4 py-3">
                      <p className="text-xs text-[var(--text-muted)]">兼容性</p>
                      {target.capabilityIssues.map((issue) => (
                        <div key={issue.id}>
                          <StatusDot
                            tone={dispositionPresentation[issue.disposition]
                              .tone}
                          >
                            {dispositionPresentation[issue.disposition].label}
                          </StatusDot>
                          <p className="mt-0.5 text-sm leading-5 text-[var(--text-muted)]">
                            {issue.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  )
                  : null}
              </div>

              <div className="space-y-4">
                <CodePanel title="生成文件">{target.nativeContent}</CodePanel>
                <CodePanel title="差异">
                  {target.unifiedDiff || "无内容差异"}
                </CodePanel>
              </div>
            </div>
          </Tabs.Content>
        ))}
      </Tabs.Root>

      <footer className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
        <p className="text-sm text-[var(--text-muted)]">
          写入前自动备份，失败自动回滚。
        </p>
        <Button
          disabled={blockingConflict || isCommitting}
          onClick={onCommit}
          size="lg"
        >
          {isCommitting ? "正在安装…" : "确认安装"}
        </Button>
      </footer>
    </section>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function CodePanel({ title, children }: { title: string; children: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-2 text-sm font-medium">
        {title}
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-[#161618] p-4 text-xs leading-6 text-neutral-200">
        {children}
      </pre>
    </div>
  );
}
