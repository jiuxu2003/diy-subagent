import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
} from "lucide-react";

import type {
  PreviewBatch,
  RecoveryAction,
  TargetSelection,
} from "../../../contracts";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
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
        className="mx-auto max-w-3xl rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-6 text-[var(--danger)]"
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

  return (
    <section
      aria-labelledby="preview-heading"
      className="mx-auto max-w-6xl space-y-6"
    >
      <header className="flex items-start justify-between gap-6">
        <div>
          <Button onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft className="size-4" aria-hidden="true" />
            返回编辑
          </Button>
          <h1 id="preview-heading" className="mt-4 text-3xl font-bold">
            审阅精确原生写入计划
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            提交只会使用这份预览对应的单次 token；修改任何字段后都必须重新生成。
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <Clock3
              className="size-4 text-[var(--accent)]"
              aria-hidden="true"
            />
            有效至 {new Date(preview.expiresAtMs).toLocaleTimeString()}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            应用重启后自动失效
          </p>
        </div>
      </header>

      {error
        ? (
          <div
            className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-sm font-medium text-[var(--danger)]"
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
          <div className="flex gap-3 rounded-2xl border border-amber-300/40 bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning)]">
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">存在名称冲突，当前策略会阻止提交</p>
              <p className="mt-1">
                返回编辑后修改逻辑名称，或为对应平台明确选择“备份后替换”。
              </p>
            </div>
          </div>
        )
        : null}

      <Tabs.Root defaultValue={firstTarget.platform}>
        <Tabs.List
          className="flex gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1.5"
          aria-label="平台原生预览"
        >
          {preview.targets.map((target) => (
            <Tabs.Trigger
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] outline-none data-[state=active]:bg-[var(--surface-raised)] data-[state=active]:text-[var(--text)] data-[state=active]:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
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
              <Card className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      最终路径
                    </p>
                    <p className="mt-1 break-all font-mono text-sm font-semibold">
                      {target.targetPath}
                    </p>
                  </div>
                  <Badge tone={target.conflictDetected ? "warning" : "success"}>
                    {target.conflictDetected ? "发现冲突" : "预检通过"}
                  </Badge>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <StatusLine
                    label="格式"
                    value={target.nativeFormat === "toml"
                      ? "TOML"
                      : "YAML + Markdown"}
                  />
                  <StatusLine
                    label="创建目录"
                    value={target.willCreateDirectory
                      ? "提交后创建"
                      : "无需创建"}
                  />
                  <StatusLine
                    label="备份"
                    value={target.willCreateBackup ? "提交前备份" : "无需备份"}
                  />
                  <StatusLine
                    label="revision"
                    value={target.currentRevision ? "已锁定" : "新文件"}
                  />
                </div>
                {target.capabilityIssues.length > 0
                  ? (
                    <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                        能力映射
                      </p>
                      {target.capabilityIssues.map((issue) => (
                        <div
                          className="rounded-xl bg-[var(--surface-hover)] p-3 text-sm"
                          key={issue.id}
                        >
                          <Badge
                            tone={issue.disposition === "blockedLossy"
                              ? "danger"
                              : "warning"}
                          >
                            {issue.disposition}
                          </Badge>
                          <p className="mt-2 leading-5 text-[var(--text-muted)]">
                            {issue.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  )
                  : null}
              </Card>

              <div className="space-y-4">
                <CodePanel
                  icon={<FileText className="size-4" />}
                  title="原生文件"
                >
                  {target.nativeContent}
                </CodePanel>
                <CodePanel title="Unified diff">
                  {target.unifiedDiff || "无内容差异"}
                </CodePanel>
              </div>
            </div>
          </Tabs.Content>
        ))}
      </Tabs.Root>

      <footer className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-lg">
        <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
          <CheckCircle2
            className="size-5 text-[var(--success)]"
            aria-hidden="true"
          />
          全部目标会作为一个可补偿批次提交并逐文件重读验证。
        </div>
        <Button
          disabled={blockingConflict || isCommitting}
          onClick={onCommit}
          size="lg"
        >
          {isCommitting ? "正在备份、写入并验证…" : "确认整批安装"}
        </Button>
      </footer>
    </section>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-hover)] p-3">
      <p className="text-xs text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function CodePanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-[#111722] p-4 text-xs leading-6 text-slate-200">
        {children}
      </pre>
    </Card>
  );
}
