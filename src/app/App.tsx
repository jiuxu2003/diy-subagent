import { Boxes, Moon, Settings, Sun, WandSparkles } from "lucide-react";
import { useState } from "react";

import type { AgentDraft } from "../contracts";
import { BrandMark } from "../components/ui/BrandMark";
import { Button } from "../components/ui/Button";
import { InstalledPage } from "../features/agents/components/InstalledPage";
import { useInventoryEvents } from "../features/agents/hooks/useInventoryEvents";
import { SettingsPage } from "../features/settings/components/SettingsPage";
import { TemplatesPage } from "../features/templates/components/TemplatesPage";
import { cn } from "../lib/formatting/cn";
import { useTheme } from "./providers/themeContext";

type NavigationItem = "templates" | "installed" | "settings";

const navigation = [
  { id: "templates", label: "模板", icon: WandSparkles },
  { id: "installed", label: "已安装", icon: Boxes },
  { id: "settings", label: "设置", icon: Settings },
] satisfies { id: NavigationItem; label: string; icon: typeof WandSparkles }[];

export function App() {
  const [active, setActive] = useState<NavigationItem>("templates");
  const [importedDraft, setImportedDraft] = useState<AgentDraft | null>(null);
  const { theme, toggleTheme } = useTheme();
  useInventoryEvents();

  const importDraft = (draft: AgentDraft) => {
    setImportedDraft(draft);
    setActive("templates");
  };

  return (
    <div className="grid h-screen grid-cols-[220px_minmax(0,1fr)] bg-[var(--background)]">
      {/* Overlay title bar drag strip; must contain no interactive children. */}
      <div className="fixed inset-x-0 top-0 z-50 h-7" data-tauri-drag-region />

      {/* Tauri's injected drag handler matches data-tauri-drag-region via
          the ancestor chain (closest), so ANY interactive element inside a
          tagged container loses its clicks to window dragging. The attribute
          therefore lives only on leaf surfaces with no interactive children:
          the top strip, the traffic-light spacer, the brand row, and the
          empty filler below the nav. */}
      <aside className="flex min-h-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
        {/* Spacer keeps sidebar content clear of the macOS traffic lights. */}
        <div className="h-11 shrink-0" data-tauri-drag-region />

        <p
          className="flex items-center gap-2 px-4 text-sm font-semibold tracking-tight"
          data-tauri-drag-region
        >
          {/* pointer-events-none keeps the svg from eating mousedown inside
              the drag region. */}
          <BrandMark className="size-5 pointer-events-none" />
          DIY Subagent
        </p>

        <nav aria-label="主导航" className="mt-4 space-y-0.5 px-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
                  active === item.id
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                )}
                key={item.id}
                onClick={() => {
                  setActive(item.id);
                }}
                type="button"
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Empty flexible area doubles as the sidebar's draggable body. */}
        <div className="min-h-0 flex-1" data-tauri-drag-region />

        <div className="p-2">
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
        </div>
      </aside>

      <main className="min-w-0 overflow-auto bg-[var(--background)] p-7">
        {active === "templates"
          ? (
            <TemplatesPage
              importedDraft={importedDraft}
              onConsumeImportedDraft={() => {
                setImportedDraft(null);
              }}
            />
          )
          : null}
        {active === "installed"
          ? <InstalledPage onImported={importDraft} />
          : null}
        {active === "settings" ? <SettingsPage /> : null}
      </main>
    </div>
  );
}
