import { Check, Copy, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { AgentDraft, BatchCommitResult } from "../../../contracts";
import { Button } from "../../../components/ui/Button";
import { StatusDot } from "../../../components/ui/StatusDot";
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
      className="mx-auto max-w-3xl space-y-6"
      aria-labelledby="install-success-heading"
    >
      <header>
        <div className="flex items-center gap-2.5">
          {/* Brand-tinted check: identity accent, not a functional status. */}
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--brand)]"
          >
            <Check className="size-4 text-white" />
          </span>
          <h1
            id="install-success-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            <span className="font-mono">{draft.logicalName}</span> 已安装
          </h1>
        </div>
        <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
          操作记录 {result.operationId}
        </p>
      </header>

      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {result.targets.map((target) => (
          <div
            className="flex items-center justify-between gap-4 px-4 py-3"
            key={target.platform}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {platformLabel(target.platform)}
              </p>
              <p className="mt-0.5 break-all font-mono text-xs text-[var(--text-muted)]">
                {target.targetPath}
              </p>
            </div>
            <StatusDot className="shrink-0" tone="success">
              {target.backupId ? "已替换（有备份）" : "已写入"}
            </StatusDot>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="border-b border-[var(--border)] pb-2 text-sm font-semibold">
          如何调用
        </h2>
        <div className="space-y-2">
          {result.targets.map((target) => (
            <CopyableLine
              key={target.platform}
              label={platformLabel(target.platform)}
              value={invocation(target.platform, draft.logicalName)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="border-b border-[var(--border)] pb-2 text-sm font-semibold">
          验证任务
        </h2>
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          {draft.usage.verificationTask}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          自动委派时机：{draft.usage.autoDelegationGuidance}
        </p>
      </section>

      <div className="flex justify-end">
        <Button onClick={onCreateAnother} variant="secondary">
          <RotateCcw className="size-4" aria-hidden="true" />
          返回模板库
        </Button>
      </div>
    </section>
  );
}

const COPY_FEEDBACK_RESET_MS = 2000;

type CopyFeedback = "idle" | "copied" | "failed";

function CopyableLine({ label, value }: { label: string; value: string }) {
  const [feedback, setFeedback] = useState<CopyFeedback>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = () => {
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  // Clear any pending reset timer on unmount so it never fires afterwards.
  useEffect(() => clearResetTimer, []);

  const copy = async () => {
    // A re-click cancels the previous reset so fresh feedback stays visible.
    clearResetTimer();
    let next: CopyFeedback;
    try {
      await navigator.clipboard.writeText(value);
      next = "copied";
    } catch {
      next = "failed";
    }
    setFeedback(next);
    // Drop a timer scheduled by an overlapping earlier copy before rearming.
    clearResetTimer();
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      setFeedback("idle");
    }, COPY_FEEDBACK_RESET_MS);
  };

  return (
    <button
      className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--border)] p-3 text-left hover:bg-[var(--surface-hover)]"
      onClick={() => {
        void copy();
      }}
      type="button"
    >
      <span>
        <span className="block text-xs text-[var(--text-subtle)]">{label}</span>
        <span className="mt-1 block font-mono text-xs">{value}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5" role="status">
        {feedback === "idle"
          ? (
            <Copy
              className="size-4 text-[var(--text-muted)]"
              aria-hidden="true"
            />
          )
          : feedback === "copied"
          ? (
            <>
              <Check
                className="size-4 text-[var(--success)]"
                aria-hidden="true"
              />
              <span className="text-xs text-[var(--success)]">已复制</span>
            </>
          )
          : <span className="text-xs text-[var(--danger)]">复制失败</span>}
      </span>
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
