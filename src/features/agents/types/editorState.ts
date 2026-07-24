import type {
  AgentDraft,
  BatchCommitResult,
  PreviewBatch,
  RecoveryAction,
  TargetSelection,
  TemplatePackage,
} from "../../../contracts";

interface EditableState {
  draft: AgentDraft;
  targets: TargetSelection[];
}

export type AgentEditorState =
  | ({ status: "editing"; error: string | null } & EditableState)
  | ({ status: "previewing" } & EditableState)
  | ({ status: "reviewing"; preview: PreviewBatch } & EditableState)
  | ({ status: "committing"; preview: PreviewBatch } & EditableState)
  | (
    & {
      status: "failed";
      error: string;
      preview: PreviewBatch | null;
      recovery: RecoveryAction | null;
    }
    & EditableState
  )
  | ({ status: "succeeded"; result: BatchCommitResult } & EditableState);

export type AgentEditorEvent =
  | { type: "replaceDraft"; draft: AgentDraft }
  | { type: "setTargets"; targets: TargetSelection[] }
  | { type: "previewStarted" }
  | { type: "previewSucceeded"; preview: PreviewBatch }
  | { type: "previewFailed"; error: string }
  | { type: "commitStarted" }
  | { type: "commitSucceeded"; result: BatchCommitResult }
  | { type: "commitFailed"; error: string; recovery: RecoveryAction | null }
  | { type: "backToEditing" };

export function createDraftFromTemplate(template: TemplatePackage): AgentDraft {
  return {
    logicalName: template.logicalName,
    description: template.defaultDescription,
    developerInstructions: template.developerInstructions,
    platformOverrides: structuredClone(template.platformOverrides),
    provenance: template.manifest.source === "personal"
      ? {
        kind: "personalTemplate",
        templateId: template.manifest.id,
        templateVersion: template.manifest.version,
      }
      : {
        kind: "builtinTemplate",
        templateId: template.manifest.id,
        templateVersion: template.manifest.version,
      },
  };
}

export function createInitialEditorState(draft: AgentDraft): AgentEditorState {
  const targetPlatforms = draft.provenance.kind === "imported"
    ? [inferImportedPlatform(draft)]
    : (Object.keys(draft.platformOverrides) as (keyof typeof draft.platformOverrides)[]);
  return {
    status: "editing",
    draft,
    targets: targetPlatforms.map((platform) => ({
      platform,
      conflictAction: "fail",
    })),
    error: null,
  };
}

function inferImportedPlatform(
  draft: AgentDraft,
): keyof AgentDraft["platformOverrides"] {
  const platforms = Object.keys(draft.platformOverrides) as (keyof AgentDraft["platformOverrides"])[];
  const platform = platforms[0];
  if (platform === undefined) {
    throw new Error("Imported draft does not contain a platform override.");
  }
  return platform;
}

export function agentEditorReducer(
  state: AgentEditorState,
  event: AgentEditorEvent,
): AgentEditorState {
  switch (event.type) {
    case "replaceDraft":
      return {
        status: "editing",
        draft: event.draft,
        targets: state.targets,
        error: null,
      };
    case "setTargets":
      return {
        status: "editing",
        draft: state.draft,
        targets: event.targets,
        error: null,
      };
    case "previewStarted":
      return {
        status: "previewing",
        draft: state.draft,
        targets: state.targets,
      };
    case "previewSucceeded":
      return {
        status: "reviewing",
        draft: state.draft,
        targets: state.targets,
        preview: event.preview,
      };
    case "previewFailed":
      return {
        status: "failed",
        draft: state.draft,
        targets: state.targets,
        preview: null,
        error: event.error,
        recovery: null,
      };
    case "commitStarted":
      if (state.status !== "reviewing" && state.status !== "failed") {
        return state;
      }
      if (state.preview === null) {
        return state;
      }
      return {
        status: "committing",
        draft: state.draft,
        targets: state.targets,
        preview: state.preview,
      };
    case "commitSucceeded":
      return {
        status: "succeeded",
        draft: state.draft,
        targets: state.targets,
        result: event.result,
      };
    case "commitFailed":
      return {
        status: "failed",
        draft: state.draft,
        targets: state.targets,
        preview: state.status === "committing" || state.status === "reviewing"
          ? state.preview
          : null,
        error: event.error,
        recovery: event.recovery,
      };
    case "backToEditing":
      return {
        status: "editing",
        draft: state.draft,
        targets: state.targets,
        error: null,
      };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
