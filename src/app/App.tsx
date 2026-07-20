import { Bot, Boxes, Moon, Settings, Sun, WandSparkles } from "lucide-react";
import { useState } from "react";

import type { AgentDraft } from "../contracts";
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
    <div className="m-3 grid min-h-[calc(100vh-1.5rem)] grid-cols-[240px_minmax(0,1fr)] overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-window)]">
      <aside className="flex flex-col border-r border-[var(--border)] bg-[var(--sidebar)] p-4 backdrop-blur-2xl">
        <div className="flex items-center gap-3 px-2 py-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-[var(--accent)] text-white shadow-md">
            <Bot className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-bold tracking-tight">DIY Subagent</p>
            <p className="text-xs text-[var(--text-subtle)]">
              macOS local studio
            </p>
          </div>
        </div>

        <nav className="mt-7 space-y-1" aria-label="主导航">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
                  active === item.id
                    ? "bg-[var(--surface-raised)] text-[var(--text)] shadow-sm"
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

        <div className="mt-auto space-y-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs leading-5 text-[var(--text-muted)]">
            <p className="font-semibold text-[var(--text)]">原生文件优先</p>
            <p className="mt-1">库存、冲突和 revision 均直接来自磁盘。</p>
          </div>
          <Button
            className="w-full justify-start"
            onClick={toggleTheme}
            variant="ghost"
          >
            {theme === "dark"
              ? <Sun className="size-4" aria-hidden="true" />
              : <Moon className="size-4" aria-hidden="true" />}
            {theme === "dark" ? "切换浅色" : "切换深色"}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 overflow-auto bg-[var(--background)] p-8">
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
