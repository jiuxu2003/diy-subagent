import { ArrowLeft, Folder } from "lucide-react";
import { useState } from "react";

import type { AgentPlatform } from "../../../contracts";
import { Button } from "../../../components/ui/Button";
import { Pill } from "../../../components/ui/Pill";
import { errorMessage } from "../../../lib/formatting/error";
import { platformLabel } from "../../../lib/formatting/platform";
import {
  useChoosePlatformDirectory,
  usePlatformDirectories,
  useResetPlatformDirectory,
} from "../hooks/usePlatformDirectories";

interface SettingsPageProps {
  onBack: () => void;
}

/**
 * Settings sub-page in the CC-Switch add-page shape: a back-arrow header
 * above card-style platform directory rows.
 */
export function SettingsPage({ onBack }: SettingsPageProps) {
  const directories = usePlatformDirectories();
  const choose = useChoosePlatformDirectory();
  const reset = useResetPlatformDirectory();
  const [error, setError] = useState<string | null>(null);

  const chooseDirectory = async (platform: AgentPlatform) => {
    setError(null);
    try {
      await choose.mutateAsync(platform);
    } catch (caught: unknown) {
      const message = errorMessage(caught);
      if (!message.includes("未选择目录")) {
        setError(message);
      }
    }
  };
  const resetDirectory = async (platform: AgentPlatform) => {
    setError(null);
    try {
      await reset.mutateAsync(platform);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    }
  };

  return (
    <section
      aria-labelledby="settings-heading"
      className="mx-auto w-full max-w-4xl"
    >
      <header className="flex items-center gap-3.5 border-b border-[var(--border)] pb-4">
        <Button
          aria-label="返回"
          className="size-9 rounded-xl"
          onClick={onBack}
          size="icon"
          variant="secondary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Button>
        <h1
          id="settings-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          设置
        </h1>
      </header>

      <div className="space-y-5 pt-6">
        <p className="text-sm text-[var(--text-muted)]">
          subagent 安装到以下目录，可为每个平台自定义。
        </p>

        {error
          ? (
            <div
              className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
              role="alert"
            >
              {error}
            </div>
          )
          : null}

        {directories.isPending
          ? <p className="text-sm text-[var(--text-muted)]">正在解析平台目录…</p>
          : null}
        {directories.error
          ? (
            <p className="text-sm text-[var(--danger)]">
              {errorMessage(directories.error)}
            </p>
          )
          : null}

        {directories.data
          ? (
            <ul className="space-y-5">
              {directories.data.map((directory) => (
                <li
                  className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
                  key={directory.platform}
                >
                  {/* Decorative directory tile; the platform name next to it
                      is the real label. */}
                  <span
                    aria-hidden="true"
                    className="flex size-12 shrink-0 items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]"
                  >
                    <Folder className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h2 className="text-lg font-semibold">
                        {platformLabel(directory.platform)}
                      </h2>
                      <Pill
                        tone={directory.availability === "ready"
                          ? "success"
                          : directory.availability === "missing"
                          ? "warning"
                          : "danger"}
                      >
                        {availabilityLabel(
                          directory.availability,
                          directory.platformDetected,
                        )}
                      </Pill>
                      {directory.source === "userOverride"
                        ? <Pill tone="neutral">自定义</Pill>
                        : null}
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-[var(--text-muted)]">
                      {directory.absolutePath}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-subtle)]">
                      可读：{directory.canRead ? "是" : "否"}{" "}
                      · 可写：{directory.canWrite ? "是" : "未确认"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      disabled={choose.isPending}
                      onClick={() => void chooseDirectory(directory.platform)}
                      size="sm"
                      variant="secondary"
                    >
                      选择目录
                    </Button>
                    <Button
                      disabled={directory.source === "default" ||
                        reset.isPending}
                      onClick={() => void resetDirectory(directory.platform)}
                      size="sm"
                      variant="ghost"
                    >
                      恢复默认
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )
          : null}

        <p className="text-xs text-[var(--text-muted)]">
          缺失的目录会在安装时自动创建。
        </p>
      </div>
    </section>
  );
}

function availabilityLabel(value: string, platformDetected: boolean): string {
  switch (value) {
    case "ready":
      return "可用";
    case "missing":
      // Distinguish "platform installed but agents dir not created yet"
      // from "platform itself not detected" to avoid looking like a bug.
      return platformDetected
        ? "agents 目录未创建（安装时自动创建）"
        : "未检测到该平台";
    case "permissionDenied":
      return "无权限";
    case "invalidOverride":
      return "路径无效";
    default:
      return value;
  }
}
