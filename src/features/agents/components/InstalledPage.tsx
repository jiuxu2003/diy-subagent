import * as Dialog from "@radix-ui/react-dialog";
import { FileCode2, FolderOpen, Import, RefreshCw, X } from "lucide-react";
import { useState } from "react";

import type {
  AgentDraft,
  DiscoveredAgent,
  InventoryGroup,
} from "../../../contracts";
import { Button } from "../../../components/ui/Button";
import { BrandGlyph } from "../../../components/ui/BrandMark";
import { StatusDot } from "../../../components/ui/StatusDot";
import { errorMessage } from "../../../lib/formatting/error";
import { platformLabel } from "../../../lib/formatting/platform";
import {
  useImportAgent,
  useInventory,
  useNativeAgentContent,
  useRevealAgentSource,
} from "../hooks/useAgents";
import {
  platformInstallStatuses,
  type PlatformInstallStatus,
} from "../lib/platformStatus";

export function InstalledPage(
  { onImported }: { onImported: (draft: AgentDraft) => void },
) {
  const inventory = useInventory();
  const importAgent = useImportAgent();
  const reveal = useRevealAgentSource();
  const [actionError, setActionError] = useState<string | null>(null);

  const importSource = async (source: DiscoveredAgent) => {
    setActionError(null);
    try {
      const result = await importAgent.mutateAsync({
        sourceId: source.sourceId,
        expectedRevision: source.revision,
      });
      onImported(result.draft);
    } catch (error: unknown) {
      setActionError(errorMessage(error));
    }
  };

  const revealSource = async (sourceId: string) => {
    setActionError(null);
    try {
      await reveal.mutateAsync(sourceId);
    } catch (error: unknown) {
      setActionError(errorMessage(error));
    }
  };

  return (
    <section
      aria-labelledby="installed-heading"
      className="mx-auto max-w-4xl space-y-5"
    >
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1
            id="installed-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            已安装
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            读取各平台用户级目录中的 subagent 文件。
          </p>
        </div>
        <Button
          onClick={() => void inventory.refetch()}
          size="sm"
          variant="ghost"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          刷新
        </Button>
      </header>

      {actionError
        ? (
          <div
            className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
            role="alert"
          >
            {actionError}
          </div>
        )
        : null}

      {inventory.isPending
        ? <InventoryState title="正在扫描原生目录…" />
        : null}
      {inventory.error
        ? <InventoryState title={errorMessage(inventory.error)} />
        : null}
      {inventory.data && inventory.data.groups.length === 0 &&
          inventory.data.directories.length === 0
        ? (
          <InventoryState
            title="三个用户级目录中还没有发现原生 Agent 文件。"
            variant="empty"
          />
        )
        : null}
      {inventory.data
        ? (
          <PlatformStatusBanners
            statuses={platformInstallStatuses(inventory.data)}
          />
        )
        : null}
      {inventory.data
        ? (
          <div className="space-y-4">
            {inventory.data.groups.map((group) => (
              <InventoryGroupSection
                group={group}
                importPending={importAgent.isPending}
                key={group.logicalName}
                onImport={(source) => void importSource(source)}
                onReveal={(sourceId) => void revealSource(sourceId)}
              />
            ))}
          </div>
        )
        : null}
    </section>
  );
}

function PlatformStatusBanners(
  { statuses }: { statuses: PlatformInstallStatus[] },
) {
  const pending = statuses.filter((status) => !status.hasSources);
  if (pending.length === 0) {
    return null;
  }
  return (
    <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {pending.map((status) => (
        <div
          className="flex items-center gap-3 px-4 py-2.5"
          key={status.platform}
        >
          <StatusDot tone={status.platformDetected ? "success" : "warning"}>
            {status.platformDetected ? "已安装" : "未检测到"}
          </StatusDot>
          <p className="text-sm text-[var(--text-muted)]">
            {status.platformDetected
              ? `已安装 ${platformLabel(status.platform)}，暂无 subagent`
              : `未检测到 ${platformLabel(status.platform)}`}
          </p>
        </div>
      ))}
    </div>
  );
}

function InventoryGroupSection({
  group,
  importPending,
  onImport,
  onReveal,
}: {
  group: InventoryGroup;
  importPending: boolean;
  onImport: (source: DiscoveredAgent) => void;
  onReveal: (sourceId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <h2 className="font-mono text-sm font-semibold">
          {group.logicalName}
        </h2>
        <span className="text-xs text-[var(--text-muted)]">
          {group.sources.length} 个平台
        </span>
        {group.hasConflict
          ? <StatusDot tone="danger">名称冲突</StatusDot>
          : null}
      </div>
      <div className="divide-y divide-[var(--border)]">
        {group.sources.map((source) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3"
            key={source.sourceId}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-sm font-semibold">
                  {platformLabel(source.platform)}
                </span>
                <StatusDot
                  tone={source.parseStatus === "valid"
                    ? "success"
                    : source.parseStatus === "readOnlyUnsupported"
                    ? "warning"
                    : "danger"}
                >
                  {source.parseStatus === "valid"
                    ? "可导入"
                    : source.parseStatus === "readOnlyUnsupported"
                    ? "只读"
                    : "解析失败"}
                </StatusDot>
                {source.ownership === "imported"
                  ? <StatusDot tone="accent">已导入</StatusDot>
                  : null}
              </div>
              <p className="mt-1 truncate font-mono text-xs text-[var(--text-muted)]">
                {source.pathLabel}
              </p>
              {source.description
                ? (
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">
                    {source.description}
                  </p>
                )
                : null}
            </div>
            <div className="flex items-center gap-1.5">
              <NativeContentDialog source={source} />
              <Button
                onClick={() => {
                  onReveal(source.sourceId);
                }}
                size="sm"
                variant="ghost"
              >
                <FolderOpen className="size-4" aria-hidden="true" />
                Finder
              </Button>
              <Button
                disabled={source.parseStatus !== "valid" || importPending}
                onClick={() => {
                  onImport(source);
                }}
                size="sm"
                variant="secondary"
              >
                <Import className="size-4" aria-hidden="true" />
                导入并编辑
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NativeContentDialog({ source }: { source: DiscoveredAgent }) {
  const [open, setOpen] = useState(false);
  const content = useNativeAgentContent(open ? source.sourceId : null);
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="ghost">
          <FileCode2 className="size-4" aria-hidden="true" />
          查看文件
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[82vh] w-[min(860px,82vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate font-mono text-lg font-semibold">
                {source.logicalName}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 break-all font-mono text-xs text-[var(--text-muted)]">
                {source.pathLabel}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button aria-label="关闭原生文件" size="icon" variant="ghost">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[var(--code-bg)] p-4">
            {content.isPending
              ? (
                <p className="text-sm text-[var(--text-muted)]">
                  正在读取磁盘内容…
                </p>
              )
              : content.error
              ? (
                <p className="text-sm text-[var(--danger)]">
                  {errorMessage(content.error)}
                </p>
              )
              : (
                <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-[var(--code-text)]">
                {content.data.content}
                </pre>
              )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InventoryState(
  { title, variant = "plain" }: {
    title: string;
    variant?: "plain" | "empty";
  },
) {
  return (
    <div className="grid min-h-48 place-items-center text-center">
      <div>
        {variant === "empty"
          ? (
            // Brand line-art illustration, reserved for the empty state only.
            <svg
              aria-hidden="true"
              className="mx-auto mb-4 size-11"
              focusable="false"
              viewBox="0 0 24 24"
            >
              <BrandGlyph stroke="var(--brand)" />
            </svg>
          )
          : null}
        <p className="text-sm text-[var(--text-muted)]">{title}</p>
        {variant === "empty"
          ? (
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              从模板开始，定制后一键安装到本机
            </p>
          )
          : null}
      </div>
    </div>
  );
}
