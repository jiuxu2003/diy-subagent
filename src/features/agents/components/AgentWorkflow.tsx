import { useReducer } from "react";
import type { ReactNode } from "react";

import type { AgentDraft } from "../../../contracts";
import { errorMessage } from "../../../lib/formatting/error";
import { IpcError } from "../../../lib/ipc/client";
import { editableAgentDraftSchema } from "../../../lib/validation/agentDraft";
import {
  useCommitAgentInstall,
  usePreviewAgentInstall,
  useRevealRecoveryDirectory,
} from "../hooks/useAgents";
import {
  agentEditorReducer,
  createInitialEditorState,
} from "../types/editorState";
import { InstallSuccess } from "./InstallSuccess";
import { PreviewReview } from "./PreviewReview";
import { StructuredEditor } from "./StructuredEditor";

interface AgentWorkflowProps {
  initialDraft: AgentDraft;
  isSavingPersonalTemplate: boolean;
  onBack: () => void;
  onFinished: () => void;
  onSavePersonalTemplate: (name: string, draft: AgentDraft) => Promise<void>;
  personalTemplateSaveMessage: string | null;
  /**
   * Optional preset chooser rendered above the structured editor. It belongs
   * to the editing screen only, so the preview and success screens never
   * show it.
   */
  presetPicker?: ReactNode;
}

export function AgentWorkflow(
  {
    initialDraft,
    isSavingPersonalTemplate,
    onBack,
    onFinished,
    onSavePersonalTemplate,
    personalTemplateSaveMessage,
    presetPicker,
  }: AgentWorkflowProps,
) {
  const [state, dispatch] = useReducer(
    agentEditorReducer,
    initialDraft,
    createInitialEditorState,
  );
  const preview = usePreviewAgentInstall();
  const commit = useCommitAgentInstall();
  const revealRecoveryDirectory = useRevealRecoveryDirectory();

  const requestPreview = async () => {
    const parsed = editableAgentDraftSchema.safeParse(state.draft);
    if (!parsed.success) {
      dispatch({
        type: "previewFailed",
        error: parsed.error.issues[0]?.message ?? "请检查结构化章节。",
      });
      return;
    }
    dispatch({ type: "previewStarted" });
    try {
      const result = await preview.mutateAsync({
        draft: parsed.data,
        targets: state.targets,
      });
      dispatch({ type: "previewSucceeded", preview: result });
    } catch (error: unknown) {
      dispatch({ type: "previewFailed", error: errorMessage(error) });
    }
  };

  const commitPreview = async () => {
    if (state.status !== "reviewing" && state.status !== "failed") {
      return;
    }
    if (state.preview === null) {
      return;
    }
    const token = state.preview.token;
    dispatch({ type: "commitStarted" });
    try {
      const result = await commit.mutateAsync(token);
      dispatch({ type: "commitSucceeded", result });
    } catch (error: unknown) {
      dispatch({
        type: "commitFailed",
        error: errorMessage(error),
        recovery: error instanceof IpcError ? error.payload.recovery : null,
      });
    }
  };

  if (state.status === "succeeded") {
    return (
      <InstallSuccess
        draft={state.draft}
        onBackHome={onFinished}
        result={state.result}
      />
    );
  }

  if (
    (state.status === "reviewing" ||
      state.status === "committing" ||
      state.status === "failed") &&
    state.preview !== null
  ) {
    return (
      <PreviewReview
        error={state.status === "failed" ? state.error : null}
        isCommitting={state.status === "committing"}
        isRevealingRecovery={revealRecoveryDirectory.isPending}
        onBack={() => {
          dispatch({ type: "backToEditing" });
        }}
        onCommit={() => {
          void commitPreview();
        }}
        onRevealRecovery={(recoveryId) => {
          revealRecoveryDirectory.mutate(recoveryId);
        }}
        preview={state.preview}
        recovery={state.status === "failed" ? state.recovery : null}
        targets={state.targets}
      />
    );
  }

  return (
    <>
      {presetPicker ? <div className="mb-8">{presetPicker}</div> : null}
      <StructuredEditor
        draft={state.draft}
        error={state.status === "failed" || state.status === "editing"
          ? state.error
          : null}
        isPreviewing={state.status === "previewing"}
        isSavingPersonalTemplate={isSavingPersonalTemplate}
        onBack={onBack}
        onDraftChange={(draft) => {
          dispatch({ type: "replaceDraft", draft });
        }}
        onPreview={() => {
          void requestPreview();
        }}
        onSavePersonalTemplate={(name) => {
          void onSavePersonalTemplate(name, state.draft);
        }}
        onTargetsChange={(targets) => {
          dispatch({ type: "setTargets", targets });
        }}
        personalTemplateSaveMessage={personalTemplateSaveMessage}
        targets={state.targets}
      />
    </>
  );
}
