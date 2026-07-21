import type { TemplateSummary } from "../../../contracts";
import { Button } from "../../../components/ui/Button";
import { StatusDot } from "../../../components/ui/StatusDot";
import { platformLabel } from "../../../lib/formatting/platform";

interface TemplateLibraryProps {
  templates: TemplateSummary[];
  onSelect: (templateId: string) => void;
}

export function TemplateLibrary({ templates, onSelect }: TemplateLibraryProps) {
  return (
    <section
      aria-labelledby="template-library-heading"
      className="mx-auto max-w-3xl space-y-4"
    >
      <header className="flex items-baseline justify-between gap-4">
        <h1
          id="template-library-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          模板
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {templates.length} 个模板
        </p>
      </header>

      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {templates.map((template) => (
          <li
            className="relative flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--surface-hover)]"
            key={template.id}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h2 className="truncate text-sm font-semibold">
                  {template.name}
                </h2>
                <StatusDot
                  className="shrink-0"
                  tone={template.risk.level === "medium"
                    ? "warning"
                    : "success"}
                >
                  {template.risk.level === "medium" ? "可写" : "只读"}
                </StatusDot>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-muted)]">
                {template.description}
              </p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                {template.supportedPlatforms.map(platformLabel).join(" · ")}
              </p>
            </div>
            {/* Stretched hit area makes the whole row activate this button
                while keeping a single focus stop per row. */}
            <Button
              aria-label={`定制 ${template.name}`}
              className="shrink-0 after:absolute after:inset-0"
              onClick={() => {
                onSelect(template.id);
              }}
              size="sm"
              variant="secondary"
            >
              定制
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
