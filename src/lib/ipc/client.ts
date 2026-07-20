import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import {
  type AgentDraft,
  agentDraftSchema,
  type AgentPlatform,
  agentPlatformSchema,
  type BatchCommitResult,
  batchCommitResultSchema,
  type ImportAgentResult,
  importAgentResultSchema,
  type InventoryScan,
  inventoryScanSchema,
  type IpcErrorPayload,
  ipcErrorSchema,
  type NativeAgentContent,
  nativeAgentContentSchema,
  type PlatformDirectory,
  platformDirectorySchema,
  type PreviewBatch,
  previewBatchSchema,
  type SavePersonalTemplateRequest,
  savePersonalTemplateRequestSchema,
  type TargetSelection,
  targetSelectionSchema,
  type TemplatePackage,
  templatePackageSchema,
  type TemplateSummary,
  templateSummarySchema,
} from "../../contracts";

export class IpcError extends Error {
  readonly payload: IpcErrorPayload;

  constructor(payload: IpcErrorPayload) {
    super(payload.message);
    this.name = "IpcError";
    this.payload = payload;
  }
}

async function call<T>(
  command: string,
  schema: z.ZodType<T>,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    const value: unknown = await invoke(command, args);
    return schema.parse(value);
  } catch (error: unknown) {
    const parsed = ipcErrorSchema.safeParse(error);
    if (parsed.success) {
      throw new IpcError(parsed.data);
    }
    if (error instanceof z.ZodError) {
      throw new Error(
        `IPC response contract mismatch for ${command}.`,
        { cause: error },
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`IPC command ${command} failed with an unknown error.`, {
      cause: error,
    });
  }
}

const platformDirectoriesSchema = z.array(platformDirectorySchema);
const templateSummariesSchema = z.array(templateSummarySchema);
const emptyResultSchema = z.null().or(z.undefined());

export const appIpc = {
  getPlatformDirectories(): Promise<PlatformDirectory[]> {
    return call("get_platform_directories", platformDirectoriesSchema);
  },

  choosePlatformDirectory(platform: AgentPlatform): Promise<PlatformDirectory> {
    return call("choose_platform_directory", platformDirectorySchema, {
      request: { platform: agentPlatformSchema.parse(platform) },
    });
  },

  resetPlatformDirectory(platform: AgentPlatform): Promise<PlatformDirectory> {
    return call("reset_platform_directory", platformDirectorySchema, {
      request: { platform: agentPlatformSchema.parse(platform) },
    });
  },

  listTemplates(): Promise<TemplateSummary[]> {
    return call("list_templates", templateSummariesSchema);
  },

  getTemplate(templateId: string): Promise<TemplatePackage> {
    return call("get_template", templatePackageSchema, {
      request: { templateId },
    });
  },

  savePersonalTemplate(
    request: SavePersonalTemplateRequest,
  ): Promise<TemplateSummary> {
    const parsed = savePersonalTemplateRequestSchema.parse(request);
    return call("save_personal_template", templateSummarySchema, {
      request: parsed,
    });
  },

  scanInstalledAgents(platforms?: AgentPlatform[]): Promise<InventoryScan> {
    return call("scan_installed_agents", inventoryScanSchema, {
      request: { platforms: platforms ?? null },
    });
  },

  getAgentNativeContent(sourceId: string): Promise<NativeAgentContent> {
    return call("get_agent_native_content", nativeAgentContentSchema, {
      request: { sourceId },
    });
  },

  importAgentForEditing(
    sourceId: string,
    expectedRevision: string,
  ): Promise<ImportAgentResult> {
    return call("import_agent_for_editing", importAgentResultSchema, {
      request: { sourceId, expectedRevision },
    });
  },

  previewAgentInstall(
    draft: AgentDraft,
    targets: TargetSelection[],
  ): Promise<PreviewBatch> {
    return call("preview_agent_install", previewBatchSchema, {
      request: {
        draft: agentDraftSchema.parse(draft),
        targets: z.array(targetSelectionSchema).parse(targets),
      },
    });
  },

  commitAgentInstall(writePlanToken: string): Promise<BatchCommitResult> {
    return call("commit_agent_install", batchCommitResultSchema, {
      request: { writePlanToken },
    });
  },

  async revealAgentSource(sourceId: string): Promise<void> {
    await call("reveal_agent_source", emptyResultSchema, {
      request: { sourceId },
    });
  },

  async revealRecoveryDirectory(recoveryId: string): Promise<void> {
    await call("reveal_recovery_directory", emptyResultSchema, {
      request: { recoveryId },
    });
  },
};
