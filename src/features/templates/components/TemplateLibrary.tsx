import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

import type { TemplateSummary } from "../../../contracts";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { platformLabel } from "../../../lib/formatting/platform";

interface TemplateLibraryProps {
  templates: TemplateSummary[];
  onSelect: (templateId: string) => void;
}

export function TemplateLibrary({ templates, onSelect }: TemplateLibraryProps) {
  return (
    <section aria-labelledby="template-library-heading" className="space-y-8">
      <header className="flex items-end justify-between gap-8">
        <div className="max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">
            <Sparkles className="size-4" aria-hidden="true" />
            内置精选模板
          </div>
          <h1
            id="template-library-heading"
            className="text-4xl font-bold tracking-tight"
          >
            从一个真正有边界的专家开始
          </h1>
          <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">
            每个模板都包含适用场景、输入、输出、权限边界、停止条件和失败报告。
            你只需逐章调整语义，再为 Claude Code、Codex 和 Cursor
            生成各自原生文件。
          </p>
        </div>
        <div className="hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-5 py-4 text-sm text-[var(--text-muted)] xl:block">
          <div className="flex items-center gap-2 font-semibold text-[var(--text)]">
            <ShieldCheck
              className="size-4 text-[var(--success)]"
              aria-hidden="true"
            />
            离线且确定性
          </div>
          <p className="mt-1">不调用 LLM，不启动 Agent CLI。</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-5 2xl:grid-cols-3">
        {templates.map((template, index) => (
          <Card
            className="group flex min-h-72 flex-col overflow-hidden p-6 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-lg"
            key={template.id}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-strong)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Badge
                tone={template.risk.level === "medium" ? "warning" : "success"}
              >
                {template.risk.level === "medium" ? "可执行修复" : "默认只读"}
              </Badge>
            </div>
            <h2 className="mt-6 text-xl font-bold">{template.name}</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-[var(--text-muted)]">
              {template.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {template.supportedPlatforms.map((platform) => (
                <Badge key={platform}>{platformLabel(platform)}</Badge>
              ))}
            </div>
            <Button
              className="mt-6 w-full justify-between"
              onClick={() => { onSelect(template.id); }}
              variant="secondary"
            >
              定制此专家
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}
