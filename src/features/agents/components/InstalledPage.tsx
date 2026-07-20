import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronDown,
  FileCode2,
  FolderOpen,
  Import,
  RefreshCw,
  X,
} from "lucide-react";
import { useState } from "react";

import type {
  AgentDraft,
  DiscoveredAgent,
  InventoryGroup,
} from "../../../contracts";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { errorMessage } from "../../../lib/formatting/error";
import { platformLabel } from "../../../lib/formatting/platform";
import {
  useImportAgent,
  useInventory,
  useNativeAgentContent,
  useRevealAgentSource,
} from "../hooks/useAgents";

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
    <section aria-labelledby="installed-heading" className="space-y-7">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">
            磁盘事实来源
          </p>
          <h1 id="installed-heading" className="mt-2 text-3xl font-bold">
            已安装 Agent
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
            这里直接扫描三个已解析的用户级目录。数据库不保存启停状态，也不会把扫描动作当成“接管”。
          </p>
        </div>
        <Button onClick={() => void inventory.refetch()} variant="secondary">
          <RefreshCw className="size-4" aria-hidden="true" />
          手动刷新
        </Button>
      </header>

      {actionError
        ? (
          <div
            className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]"
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
      {inventory.data && inventory.data.groups.length === 0
        ? <InventoryState title="三个用户级目录中还没有发现原生 Agent 文件。" />
        : null}
      {inventory.data
        ? (
          <div className="space-y-4">
            {inventory.data.groups.map((group) => (
              <InventoryCard
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

function InventoryCard({
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
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-base font-bold">
              {group.logicalName}
            </h2>
            {group.hasConflict ? <Badge tone="danger">同平台冲突</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {group.sources.length} 个原生来源
          </p>
        </div>
        <div className="flex gap-2">
          {group.sources.map((source) => (
            <Badge key={source.sourceId}>
              {platformLabel(source.platform)}
            </Badge>
          ))}
        </div>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {group.sources.map((source) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4"
            key={source.sourceId}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {platformLabel(source.platform)}
                </span>
                <Badge
                  tone={source.parseStatus === "valid"
                    ? "success"
                    : source.parseStatus === "readOnlyUnsupported"
                    ? "warning"
                    : "danger"}
                >
                  {source.parseStatus === "valid"
                    ? "可安全导入"
                    : source.parseStatus === "readOnlyUnsupported"
                    ? "只读保留"
                    : "解析失败"}
                </Badge>
                {source.ownership === "imported"
                  ? <Badge tone="accent">已显式导入</Badge>
                  : null}
              </div>
              <p className="mt-1 truncate font-mono text-xs text-[var(--text-muted)]">
                {source.pathLabel}
              </p>
              {source.description
                ? (
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--text-muted)]">
                    {source.description}
                  </p>
                )
                : null}
            </div>
            <div className="flex items-center gap-2">
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
    </Card>
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
          原生文件
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[82vh] w-[min(900px,82vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-2xl outline-none">
          <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-5">
            <div>
              <Dialog.Title className="text-lg font-bold">
                {source.logicalName}
              </Dialog.Title>
              <Dialog.Description className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                {source.pathLabel}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button aria-label="关闭原生文件" size="icon" variant="ghost">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#111722] p-5">
            {content.isPending
              ? <p className="text-sm text-slate-400">正在读取磁盘内容…</p>
              : content.error
              ? (
                <p className="text-sm text-red-300">
                  {errorMessage(content.error)}
                </p>
              )
              : (
                <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-200">
                {content.data.content}
                </pre>
              )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InventoryState({ title }: { title: string }) {
  return (
    <Card className="grid min-h-64 place-items-center p-8 text-center">
      <div>
        <ChevronDown
          className="mx-auto size-7 text-[var(--text-subtle)]"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-semibold text-[var(--text-muted)]">
          {title}
        </p>
      </div>
    </Card>
  );
}
