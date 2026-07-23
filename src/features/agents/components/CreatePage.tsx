import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { AgentDraft, TemplateSummary } from "../../../contracts";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/formatting/cn";
import { errorMessage } from "../../../lib/formatting/error";
import {
  useSavePersonalTemplate,
  useTemplate,
  useTemplates,
} from "../../templates";
import { createDraftFromTemplate } from "../types/editorState";
import { AgentWorkflow } from "./AgentWorkflow";

/** Blank builtin template pinned to the head of the preset chip row. */
const CUSTOM_BLANK_TEMPLATE_ID = "custom-blank";

interface CreatePageProps {
  /** Non-null when the page edits an imported native agent. */
  importedDraft: AgentDraft | null;
  onBack: () => void;
  onFinished: () => void;
}

/**
 * Create/edit page in the CC-Switch add-page shape: a back-arrow header
 * above the agent workflow. Entering from the "+" button offers preset
 * template chips; entering from "导入并编辑" hides them so a stray chip
 * click can never overwrite the imported content.
 */
export function CreatePage(
  { importedDraft, onBack, onFinished }: CreatePageProps,
) {
  return (
    <section
      aria-labelledby="create-page-heading"
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
          className="text-2xl font-semibold tracking-tight"
          id="create-page-heading"
        >
          {importedDraft === null
            ? "新建 Subagent"
            : (
              <>
                编辑 <span className="font-mono">{importedDraft.logicalName}
                </span>
              </>
            )}
        </h1>
      </header>

      <div className="pt-6">
        {importedDraft === null
          ? <TemplateDrivenCreate onBack={onBack} onFinished={onFinished} />
          : (
            <WorkflowHost
              initialDraft={importedDraft}
              onBack={onBack}
              onFinished={onFinished}
              presetPicker={null}
            />
          )}
      </div>
    </section>
  );
}

function TemplateDrivenCreate(
  { onBack, onFinished }: { onBack: () => void; onFinished: () => void },
) {
  const [selectedId, setSelectedId] = useState(CUSTOM_BLANK_TEMPLATE_ID);
  const templates = useTemplates();
  const template = useTemplate(selectedId);

  // The backend lists templates alphabetically by id; the blank starter is
  // pinned to the head so the chip row always opens with 「自定义」.
  const orderedTemplates = useMemo(() => {
    if (!templates.data) {
      return null;
    }
    return [
      ...templates.data.filter((item) => item.id === CUSTOM_BLANK_TEMPLATE_ID),
      ...templates.data.filter((item) => item.id !== CUSTOM_BLANK_TEMPLATE_ID),
    ];
  }, [templates.data]);

  const draft = useMemo(
    () => template.data ? createDraftFromTemplate(template.data) : null,
    [template.data],
  );

  if (templates.isPending || template.isPending) {
    return <PageState title="正在读取模板…" />;
  }
  if (templates.error) {
    return (
      <PageState
        action={<Button onClick={() => void templates.refetch()}>重试</Button>}
        title={errorMessage(templates.error)}
      />
    );
  }
  if (template.error) {
    return (
      <PageState
        action={<Button onClick={() => void template.refetch()}>重试</Button>}
        title={errorMessage(template.error)}
      />
    );
  }
  if (orderedTemplates === null || draft === null) {
    return (
      <PageState
        action={<Button onClick={() => void templates.refetch()}>重试</Button>}
        title="模板暂不可用。"
      />
    );
  }

  return (
    <WorkflowHost
      initialDraft={draft}
      // Switching chips remounts the whole workflow so the editor resets to
      // the newly chosen template without a dirty-state confirmation.
      key={selectedId}
      onBack={onBack}
      onFinished={onFinished}
      presetPicker={
        <TemplatePresetPicker
          onSelect={setSelectedId}
          selectedId={selectedId}
          templates={orderedTemplates}
        />
      }
    />
  );
}

function TemplatePresetPicker({
  templates,
  selectedId,
  onSelect,
}: {
  templates: TemplateSummary[];
  selectedId: string;
  onSelect: (templateId: string) => void;
}) {
  const selected = templates.find((item) => item.id === selectedId);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-[var(--text-muted)]">预设模板</h2>
      <div aria-label="预设模板" className="flex flex-wrap gap-2.5" role="group">
        {templates.map((item) => (
          <button
            aria-pressed={item.id === selectedId}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
              item.id === selectedId
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
            )}
            key={item.id}
            onClick={() => {
              onSelect(item.id);
            }}
            type="button"
          >
            {item.name}
          </button>
        ))}
      </div>
      {selected
        ? (
          <p className="text-sm text-[var(--text-muted)]">
            <span aria-hidden="true">💡{" "}</span>
            {selected.description}
          </p>
        )
        : null}
    </section>
  );
}

/**
 * Shared workflow shell for both entry modes; owns the personal-template
 * save mutation and its status message.
 */
function WorkflowHost({
  initialDraft,
  presetPicker,
  onBack,
  onFinished,
}: {
  initialDraft: AgentDraft;
  presetPicker: ReactNode;
  onBack: () => void;
  onFinished: () => void;
}) {
  const savePersonalTemplate = useSavePersonalTemplate();
  const [templateSaveMessage, setTemplateSaveMessage] = useState<string | null>(
    null,
  );
  return (
    <AgentWorkflow
      initialDraft={initialDraft}
      isSavingPersonalTemplate={savePersonalTemplate.isPending}
      onBack={onBack}
      onFinished={onFinished}
      onSavePersonalTemplate={async (name, currentDraft) => {
        setTemplateSaveMessage(null);
        try {
          const summary = await savePersonalTemplate.mutateAsync({
            name,
            draft: currentDraft,
          });
          setTemplateSaveMessage(`已保存个人模板“${summary.name}”。`);
        } catch (error: unknown) {
          setTemplateSaveMessage(errorMessage(error));
        }
      }}
      personalTemplateSaveMessage={templateSaveMessage}
      presetPicker={presetPicker}
    />
  );
}

function PageState(
  { title, action }: { title: string; action?: ReactNode },
) {
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div>
        <p className="text-sm text-[var(--text-muted)]">{title}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
