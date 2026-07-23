import { useQueryClient } from "@tanstack/react-query";
import { Moon, Plus, RefreshCw, Settings, Sun } from "lucide-react";
import { useState } from "react";

import type { AgentDraft, AgentPlatform } from "../contracts";
import { BrandMark } from "../components/ui/BrandMark";
import { Button } from "../components/ui/Button";
import {
  SegmentedControl,
  type SegmentedControlItem,
} from "../components/ui/SegmentedControl";
import { CreatePage } from "../features/agents/components/CreatePage";
import { HomePage } from "../features/agents/components/HomePage";
import { useInventoryEvents } from "../features/agents/hooks/useInventoryEvents";
import { usePersistedPlatform } from "../features/agents/hooks/usePersistedPlatform";
import { SettingsPage } from "../features/settings/components/SettingsPage";
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

export function App() {
  const [appView, setAppView] = useState<AppView>({ view: "home" });
  const [platform, selectPlatform] = usePersistedPlatform();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  useInventoryEvents();

  const goHome = () => {
    setAppView({ view: "home" });
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--background)]">
      {/* Overlay title bar drag strip; must contain no interactive children. */}
      <div className="fixed inset-x-0 top-0 z-50 h-7" data-tauri-drag-region />

      {/* Tauri's injected drag handler matches data-tauri-drag-region via
          the ancestor chain (closest), so ANY interactive element inside a
          tagged container loses its clicks to window dragging. The attribute
          therefore lives only on leaf surfaces with no interactive children:
          the top strip, the brand row, and the flexible spacer between the
          brand and the controls. The control cluster is raised above the
          fixed strip (z-index) so the strip can never swallow clicks on the
          upper edge of its buttons. */}
      <header className="flex h-16 shrink-0 items-center gap-4 pl-20 pr-5">
        <p
          className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"
          data-tauri-drag-region
        >
          {/* pointer-events-none keeps the svg from eating mousedown inside
              the drag region. */}
          <BrandMark className="pointer-events-none size-6" />
          DIY Subagent
        </p>

        {/* Empty flexible area doubles as the top bar's draggable body. */}
        <div className="h-full min-w-0 flex-1" data-tauri-drag-region />

        <div className="relative z-[60] flex items-center gap-3">
          <SegmentedControl
            aria-label="平台"
            items={platformItems}
            onChange={selectPlatform}
            value={platform}
          />
          <div className="flex items-center gap-1">
            <Button
              aria-label="刷新"
              onClick={() => {
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.inventory.all,
                });
              }}
              size="icon"
              variant="ghost"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
            </Button>
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
          </div>
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
    </div>
  );
}
