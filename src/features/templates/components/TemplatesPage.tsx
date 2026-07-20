import { useMemo, useState } from "react";

import type { AgentDraft } from "../../../contracts";
import { Button } from "../../../components/ui/Button";
import { errorMessage } from "../../../lib/formatting/error";
import { AgentWorkflow } from "../../agents/components/AgentWorkflow";
import { createDraftFromTemplate } from "../../agents/types/editorState";
import {
  useSavePersonalTemplate,
  useTemplate,
  useTemplates,
} from "../hooks/useTemplates";
import { TemplateLibrary } from "./TemplateLibrary";

interface TemplatesPageProps {
  importedDraft: AgentDraft | null;
  onConsumeImportedDraft: () => void;
}

export function TemplatesPage({
  importedDraft,
  onConsumeImportedDraft,
}: TemplatesPageProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const templates = useTemplates();
  const template = useTemplate(selectedTemplateId);
  const savePersonalTemplate = useSavePersonalTemplate();
  const [templateSaveMessage, setTemplateSaveMessage] = useState<string | null>(
    null,
  );
  const draft = useMemo(() => {
    if (importedDraft) {
      return importedDraft;
    }
    return template.data ? createDraftFromTemplate(template.data) : null;
  }, [importedDraft, template.data]);

  if (draft) {
    return (
      <AgentWorkflow
        initialDraft={draft}
        isSavingPersonalTemplate={savePersonalTemplate.isPending}
        onBack={() => {
          if (importedDraft) {
            onConsumeImportedDraft();
          }
          setSelectedTemplateId(null);
        }}
        onFinished={() => {
          onConsumeImportedDraft();
          setSelectedTemplateId(null);
        }}
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
      />
    );
  }

  if (
    templates.isPending || (selectedTemplateId !== null && template.isPending)
  ) {
    return <PageState title="正在读取文件化模板…" />;
  }
  const queryError = templates.error ?? template.error;
  if (queryError) {
    return (
      <PageState
        action={<Button onClick={() => void templates.refetch()}>重试</Button>}
        title={errorMessage(queryError)}
      />
    );
  }
  if (!templates.data) {
    return (
      <PageState
        action={<Button onClick={() => void templates.refetch()}>重试</Button>}
        title="模板列表暂不可用。"
      />
    );
  }

  return (
    <TemplateLibrary
      onSelect={setSelectedTemplateId}
      templates={templates.data}
    />
  );
}

function PageState(
  { title, action }: { title: string; action?: React.ReactNode },
) {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-lg font-semibold">{title}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
