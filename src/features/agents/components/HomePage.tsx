import { SquarePen } from "lucide-react";
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
import { useImportAgent, useInventory } from "../hooks/useAgents";
import { platformInstallStatuses } from "../lib/platformStatus";

/** Only abnormal parse states carry a pill; a healthy card stays clean. */
const parseStatusPills = {
  readOnlyUnsupported: {
    tone: "warning",
    label: "只读",
    editHint: "该文件为只读格式，暂不能编辑",
  },
  invalid: {
    tone: "danger",
    label: "解析失败",
    editHint: "该文件无法解析，暂不能编辑",
  },
} as const;

interface HomePageProps {
  platform: AgentPlatform;
  onImported: (draft: AgentDraft) => void;
}

export function HomePage({ platform, onImported }: HomePageProps) {
  const inventory = useInventory();
  const importAgent = useImportAgent();
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
  source,
}: {
  importPending: boolean;
  onImport: (source: DiscoveredAgent) => void;
  source: DiscoveredAgent;
}) {
  // Inline condition so TS narrows the index into parseStatusPills; a null
  // pill means a healthy, editable source.
  const statusPill = source.parseStatus === "valid"
    ? null
    : parseStatusPills[source.parseStatus];
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
          {statusPill
            ? <Pill tone={statusPill.tone}>{statusPill.label}</Pill>
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
      {/* A disabled Button is pointer-events-none, so the tooltip explaining
          why editing is unavailable lives on this hoverable wrapper. */}
      <span className="shrink-0" title={statusPill?.editHint}>
        <Button
          disabled={statusPill !== null || importPending}
          onClick={() => {
            onImport(source);
          }}
          size="sm"
          variant="secondary"
        >
          <SquarePen className="size-4" aria-hidden="true" />
          编辑
        </Button>
      </span>
    </li>
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
