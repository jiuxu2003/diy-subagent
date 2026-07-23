import * as Dialog from "@radix-ui/react-dialog";
import { FileCode2, FolderOpen, Import, X } from "lucide-react";
import { useState } from "react";

import type {
  AgentDraft,
  AgentPlatform,
  DiscoveredAgent,
} from "../../../contracts";
import { Button } from "../../../components/ui/Button";
import { BrandGlyph } from "../../../components/ui/BrandMark";
import { Pill } from "../../../components/ui/Pill";
import { errorMessage } from "../../../lib/formatting/error";
import { platformLabel } from "../../../lib/formatting/platform";
import {
  useImportAgent,
  useInventory,
  useNativeAgentContent,
  useRevealAgentSource,
} from "../hooks/useAgents";
import { platformInstallStatuses } from "../lib/platformStatus";

/** Maps a native parse status to its pill tone and user-facing label. */
const parseStatusPills = {
  valid: { tone: "success", label: "可导入" },
  readOnlyUnsupported: { tone: "warning", label: "只读" },
  invalid: { tone: "danger", label: "解析失败" },
} as const;

interface HomePageProps {
  platform: AgentPlatform;
  onImported: (draft: AgentDraft) => void;
}

export function HomePage({ platform, onImported }: HomePageProps) {
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

  const scan = inventory.data;
  // Home renders one flat card list for the selected platform only; the
  // cross-platform logicalName grouping stays an install-flow concern.
  const sources = scan
    ? scan.groups
      .flatMap((group) => group.sources)
      .filter((source) => source.platform === platform)
    : [];
  const platformDetected = scan
    ? (platformInstallStatuses(scan)
      .find((status) => status.platform === platform)
      ?.platformDetected ?? false)
    : false;

  return (
    <section
      aria-label="已安装的 subagent"
      className="mx-auto max-w-4xl space-y-5"
    >
      {actionError
        ? (
          <div
            className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
            role="alert"
          >
            {actionError}
          </div>
        )
        : null}

      {inventory.isPending
        ? <HomeState title="正在扫描原生目录…" />
        : null}
      {inventory.error
        ? <HomeState title={errorMessage(inventory.error)} />
        : null}

      {scan
        ? sources.length > 0
          ? (
            <ul className="space-y-5">
              {sources.map((source) => (
                <AgentSourceCard
                  importPending={importAgent.isPending}
                  key={source.sourceId}
                  onImport={(target) => void importSource(target)}
                  onReveal={(sourceId) => void revealSource(sourceId)}
                  source={source}
                />
              ))}
            </ul>
          )
          : platformDetected
          ? (
            <HomeState
              hint="点右上角 + 从模板开始"
              showArt
              title={`已安装 ${platformLabel(platform)}，暂无 subagent`}
            />
          )
          : <HomeState showArt title={`未检测到 ${platformLabel(platform)}`} />
        : null}
    </section>
  );
}

function AgentSourceCard({
  importPending,
  onImport,
  onReveal,
  source,
}: {
  importPending: boolean;
  onImport: (source: DiscoveredAgent) => void;
  onReveal: (sourceId: string) => void;
  source: DiscoveredAgent;
}) {
  const statusPill = parseStatusPills[source.parseStatus];
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      {/* Monogram tile stands in for a brand icon; decorative because it
          only repeats the first character of the visible name. */}
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 select-none items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--surface)] font-mono text-lg font-semibold text-[var(--text-muted)]"
      >
        {source.logicalName.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="truncate font-mono text-lg font-semibold">
            {source.logicalName}
          </h2>
          <Pill tone={statusPill.tone}>{statusPill.label}</Pill>
          {source.ownership === "imported"
            ? <Pill tone="accent">已导入</Pill>
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
      <div className="flex shrink-0 items-center gap-1.5">
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
    </li>
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

function HomeState(
  { hint, showArt = false, title }: {
    hint?: string;
    showArt?: boolean;
    title: string;
  },
) {
  return (
    <div className="grid min-h-64 place-items-center text-center">
      <div>
        {showArt
          ? (
            // Brand line-art illustration, reserved for the empty states only.
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
        {hint
          ? <p className="mt-1 text-xs text-[var(--text-subtle)]">{hint}</p>
          : null}
      </div>
    </div>
  );
}
