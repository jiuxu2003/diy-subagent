import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Moon, Plus, RefreshCw, Settings, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { AgentDraft, AgentPlatform } from "../contracts";
import { BrandMark } from "../components/ui/BrandMark";
import { Button } from "../components/ui/Button";
import {
  SegmentedControl,
  type SegmentedControlItem,
} from "../components/ui/SegmentedControl";
import { Toast } from "../components/ui/Toast";
import { CreatePage } from "../features/agents/components/CreatePage";
import { HomePage } from "../features/agents/components/HomePage";
import { useInventoryEvents } from "../features/agents/hooks/useInventoryEvents";
import { usePersistedPlatform } from "../features/agents/hooks/usePersistedPlatform";
import { SettingsPage } from "../features/settings/components/SettingsPage";
import { cn } from "../lib/formatting/cn";
import { platformLabel } from "../lib/formatting/platform";
import { queryKeys } from "../lib/query/queryKeys";
import { useTheme } from "./providers/themeContext";

type AppView =
  | { view: "home" }
  | { view: "create"; importedDraft: AgentDraft | null }
  | { view: "settings" };

const platformItems = [
  { id: "claude", label: platformLabel("claude") },
  { id: "codex", label: platformLabel("codex") },
  { id: "cursor", label: platformLabel("cursor") },
] satisfies SegmentedControlItem<AgentPlatform>[];

/**
 * Floor for the refresh spin: local scans settle within milliseconds, so
 * without a minimum window the click feedback is imperceptible.
 */
const MIN_REFRESH_SPIN_MS = 700;
/** How long the completion toast stays visible before auto-dismissing. */
const TOAST_DISMISS_MS = 2000;

export function App() {
  const [appView, setAppView] = useState<AppView>({ view: "home" });
  const [platform, selectPlatform] = usePersistedPlatform();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  // Refresh feedback: the icon spins and the button stays disabled while any
  // inventory query fetches (prefix match) OR while the post-click minimum
  // spin window is open — near-instant local scans would otherwise flash by
  // unnoticed. The disabled state doubles as the re-entrant click guard.
  const isFetchingInventory =
    useIsFetching({ queryKey: queryKeys.inventory.all }) > 0;
  const [minSpinActive, setMinSpinActive] = useState(false);
  const isRefreshing = minSpinActive || isFetchingInventory;
  const minSpinTimer = useRef<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  useInventoryEvents();

  // Pending feedback timers must not fire state updates after unmount.
  useEffect(() => {
    return () => {
      if (minSpinTimer.current !== null) {
        window.clearTimeout(minSpinTimer.current);
      }
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, TOAST_DISMISS_MS);
  };

  const refreshInventory = () => {
    setMinSpinActive(true);
    if (minSpinTimer.current !== null) {
      window.clearTimeout(minSpinTimer.current);
    }
    minSpinTimer.current = window.setTimeout(() => {
      setMinSpinActive(false);
    }, MIN_REFRESH_SPIN_MS);
    // refetchType "all" also refetches inactive inventory queries, so a
    // refresh is never silently skipped; throwOnError turns a failed refetch
    // into a rejection so the toast can tell success from failure. The toast
    // fires as soon as the refetch settles — it may overlap the tail of the
    // minimum spin window, which avoids coordinating the two timers and
    // keeps the message truthful the moment it appears.
    void queryClient
      .invalidateQueries(
        { queryKey: queryKeys.inventory.all, refetchType: "all" },
        { throwOnError: true },
      )
      .then(
        () => {
          showToast("已刷新");
        },
        () => {
          // The page-level query error state still renders; the toast only
          // acknowledges the outcome of this click.
          showToast("刷新失败");
        },
      );
  };

  const goHome = () => {
    setAppView({ view: "home" });
  };
  const isHome = appView.view === "home";

  return (
    <div className="flex h-screen flex-col bg-[var(--background)]">
      {/* Overlay title bar drag strip; must contain no interactive children. */}
      <div className="fixed inset-x-0 top-0 z-50 h-7" data-tauri-drag-region />

      {/* Tauri's injected drag handler matches data-tauri-drag-region via
          the ancestor chain (closest), so ANY interactive element inside a
          tagged container loses its clicks to window dragging. The attribute
          therefore lives only on leaf surfaces with no interactive children:
          the fixed top strip, the traffic-light spacer row, the brand row,
          and the flexible spacer between the brand and the controls. The
          control cluster keeps a raised z-index as a safety net so the fixed
          strip can never swallow clicks if the layout ever shifts back up. */}
      <header className="shrink-0">
        {/* Traffic-light clearance row: the brand sits below the macOS
            window controls instead of beside them. Pure drag leaf. */}
        <div className="h-9" data-tauri-drag-region />

        <div className="flex h-14 items-center gap-4 px-8">
          <p
            className="flex items-center gap-2.5 text-xl font-semibold tracking-tight"
            data-tauri-drag-region
          >
            {/* pointer-events-none keeps the svg from eating mousedown inside
                the drag region. */}
            <BrandMark className="pointer-events-none size-7" />
            DIY Subagent
          </p>

          {/* Empty flexible area doubles as the top bar's draggable body. */}
          <div className="h-full min-w-0 flex-1" data-tauri-drag-region />

          <div className="relative z-[60] flex items-center gap-3">
            {/* Navigation controls render on home only: from a sub-page the
                gear or "+" would swap the view and silently discard an
                in-progress draft. Sub-pages keep just the theme toggle. */}
            {isHome
              ? (
                <SegmentedControl
                  aria-label="平台"
                  items={platformItems}
                  onChange={selectPlatform}
                  value={platform}
                />
              )
              : null}
            <div className="flex items-center gap-1">
              {isHome
                ? (
                  <Button
                    aria-label="刷新"
                    disabled={isRefreshing}
                    onClick={refreshInventory}
                    size="icon"
                    variant="ghost"
                  >
                    {/* animate-spin is neutralized by the global
                        prefers-reduced-motion rule in globals.css. */}
                    <RefreshCw
                      className={cn("size-4", isRefreshing && "animate-spin")}
                      aria-hidden="true"
                    />
                  </Button>
                )
                : null}
              <Button
                aria-label={theme === "dark" ? "切换浅色" : "切换深色"}
                onClick={toggleTheme}
                size="icon"
                variant="ghost"
              >
                {theme === "dark"
                  ? <Sun className="size-4" aria-hidden="true" />
                  : <Moon className="size-4" aria-hidden="true" />}
              </Button>
              {isHome
                ? (
                  <Button
                    aria-label="设置"
                    onClick={() => {
                      setAppView({ view: "settings" });
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Settings className="size-4" aria-hidden="true" />
                  </Button>
                )
                : null}
            </div>
            {isHome
              ? (
                <Button
                  aria-label="新建 Subagent"
                  onClick={() => {
                    setAppView({ view: "create", importedDraft: null });
                  }}
                  size="iconRound"
                  variant="brand"
                >
                  <Plus className="size-5" aria-hidden="true" />
                </Button>
              )
              : null}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-8 pb-10 pt-4">
        {appView.view === "home"
          ? (
            <HomePage
              onImported={(draft) => {
                setAppView({ view: "create", importedDraft: draft });
              }}
              platform={platform}
            />
          )
          : null}
        {appView.view === "create"
          ? (
            <CreatePage
              importedDraft={appView.importedDraft}
              onBack={goHome}
              onFinished={goHome}
            />
          )
          : null}
        {appView.view === "settings" ? <SettingsPage onBack={goHome} /> : null}
      </main>

      <Toast message={toast} />
    </div>
  );
}
