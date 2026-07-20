import { FolderCog, RotateCcw, ShieldAlert } from "lucide-react";
import { useState } from "react";

import type { AgentPlatform } from "../../../contracts";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { errorMessage } from "../../../lib/formatting/error";
import { platformLabel } from "../../../lib/formatting/platform";
import {
  useChoosePlatformDirectory,
  usePlatformDirectories,
  useResetPlatformDirectory,
} from "../hooks/usePlatformDirectories";

export function SettingsPage() {
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
    <section aria-labelledby="settings-heading" className="space-y-7">
      <header>
        <p className="text-sm font-semibold text-[var(--accent)]">
          路径与安全边界
        </p>
        <h1 id="settings-heading" className="mt-2 text-3xl font-bold">
          设置
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
          每个平台独立解析“用户覆盖 → 官方确认的环境变量 →
          默认目录”。当前版本没有足够官方证据的环境变量分支会被主动跳过。
        </p>
      </header>

      {error
        ? (
          <div
            className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]"
            role="alert"
          >
            {error}
          </div>
        )
        : null}

      {directories.isPending ? <p>正在解析平台目录…</p> : null}
      {directories.error
        ? (
          <p className="text-[var(--danger)]">
            {errorMessage(directories.error)}
          </p>
        )
        : null}
      <div className="grid gap-5">
        {directories.data?.map((directory) => (
          <Card
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 p-5"
            key={directory.platform}
          >
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)]">
                <FolderCog
                  className="size-5 text-[var(--accent-strong)]"
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold">
                    {platformLabel(directory.platform)}
                  </h2>
                  <Badge
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
                  </Badge>
                  <Badge>
                    {directory.source === "userOverride"
                      ? "用户覆盖"
                      : "默认路径"}
                  </Badge>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-[var(--text-muted)]">
                  {directory.absolutePath}
                </p>
                <p className="mt-2 text-xs text-[var(--text-subtle)]">
                  可读：{directory.canRead ? "是" : "否"}{" "}
                  · 可写：{directory.canWrite ? "是" : "未确认"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={choose.isPending}
                onClick={() => void chooseDirectory(directory.platform)}
                variant="secondary"
              >
                选择目录
              </Button>
              <Button
                disabled={directory.source === "default" || reset.isPending}
                onClick={() => void resetDirectory(directory.platform)}
                variant="ghost"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                恢复默认
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="flex gap-4 border-amber-300/30 bg-[var(--warning-soft)] p-5 text-[var(--warning)]">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="text-sm leading-6">
          <p className="font-semibold">目录缺失不会触发扫描写入</p>
          <p>
            只有当你在安装向导中选择该平台并确认整个 WritePlan 后，Rust
            后端才会创建缺失目录。
          </p>
        </div>
      </Card>
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
