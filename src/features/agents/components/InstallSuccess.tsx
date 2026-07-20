import { CheckCircle2, Copy, FolderCheck, RotateCcw } from "lucide-react";

import type { AgentDraft, BatchCommitResult } from "../../../contracts";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { platformLabel } from "../../../lib/formatting/platform";

interface InstallSuccessProps {
  draft: AgentDraft;
  result: BatchCommitResult;
  onCreateAnother: () => void;
}

export function InstallSuccess(
  { draft, result, onCreateAnother }: InstallSuccessProps,
) {
  return (
    <section
      className="mx-auto max-w-4xl space-y-6"
      aria-labelledby="install-success-heading"
    >
      <Card className="overflow-hidden">
        <div className="bg-[var(--success-soft)] px-8 py-10 text-center">
          <CheckCircle2
            className="mx-auto size-12 text-[var(--success)]"
            aria-hidden="true"
          />
          <h1 id="install-success-heading" className="mt-4 text-3xl font-bold">
            {draft.logicalName} 已完成整批安装
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            operation ID：<span className="font-mono">
              {result.operationId}
            </span>
          </p>
        </div>
        <div className="grid gap-4 p-6">
          {result.targets.map((target) => (
            <div
              className="flex items-center justify-between rounded-2xl border border-[var(--border)] p-4"
              key={target.platform}
            >
              <div className="flex items-center gap-4">
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)]">
                  <FolderCheck
                    className="size-5 text-[var(--accent-strong)]"
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <p className="font-semibold">
                    {platformLabel(target.platform)}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-[var(--text-muted)]">
                    {target.targetPath}
                  </p>
                </div>
              </div>
              <Badge tone="success">
                {target.backupId ? "已备份并验证" : "已写入并验证"}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Card className="p-6">
          <h2 className="font-bold">如何调用</h2>
          <div className="mt-4 space-y-3">
            {result.targets.map((target) => (
              <CopyableLine
                key={target.platform}
                label={platformLabel(target.platform)}
                value={invocation(target.platform, draft.logicalName)}
              />
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="font-bold">验证任务</h2>
          <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
            {draft.usage.verificationTask}
          </p>
          <p className="mt-4 rounded-xl bg-[var(--surface-hover)] p-3 text-xs leading-5 text-[var(--text-muted)]">
            自动委派取决于 description：{draft.usage.autoDelegationGuidance}
          </p>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={onCreateAnother} variant="secondary">
          <RotateCcw className="size-4" aria-hidden="true" />
          返回模板库
        </Button>
      </div>
    </section>
  );
}

function CopyableLine({ label, value }: { label: string; value: string }) {
  const copy = () => {
    void navigator.clipboard.writeText(value);
  };
  return (
    <button
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3 text-left hover:bg-[var(--surface-hover)]"
      onClick={copy}
      type="button"
    >
      <span>
        <span className="block text-xs text-[var(--text-subtle)]">{label}</span>
        <span className="mt-1 block font-mono text-xs">{value}</span>
      </span>
      <Copy
        className="size-4 shrink-0 text-[var(--text-muted)]"
        aria-hidden="true"
      />
    </button>
  );
}

function invocation(platform: string, name: string): string {
  switch (platform) {
    case "claude":
      return `Use the ${name} subagent for this task.`;
    case "codex":
      return `Have the ${name} agent handle this task.`;
    case "cursor":
      return `/${name} 处理这个任务`;
    default:
      return name;
  }
}
