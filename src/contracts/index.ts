import { z } from "zod";

export const agentPlatformSchema = z.enum(["claude", "codex", "cursor"]);
export type AgentPlatform = z.infer<typeof agentPlatformSchema>;

const claudeOverrideSchema = z.object({
  model: z.string().nullable().optional(),
  effort: z.string().nullable().optional(),
  permissionMode: z.string().nullable().optional(),
  tools: z.array(z.string()).default([]),
  disallowedTools: z.array(z.string()).default([]),
  maxTurns: z.number().int().positive().nullable().optional(),
  skills: z.array(z.string()).default([]),
  memory: z.string().nullable().optional(),
  background: z.boolean().nullable().optional(),
  isolation: z.string().nullable().optional(),
});

const codexOverrideSchema = z.object({
  model: z.string().nullable().optional(),
  modelReasoningEffort: z.string().nullable().optional(),
  sandboxMode: z.string().nullable().optional(),
  nicknameCandidates: z.array(z.string()).default([]),
  /** Extra native TOML tables (e.g. mcp_servers) merged in by the backend. */
  extraToml: z.string().nullable().optional(),
});

const cursorOverrideSchema = z.object({
  model: z.string().nullable().optional(),
  readonly: z.boolean().nullable().optional(),
  isBackground: z.boolean().nullable().optional(),
});

export const platformOverrideSchema = z.discriminatedUnion("platform", [
  z.object({ platform: z.literal("claude"), config: claudeOverrideSchema }),
  z.object({ platform: z.literal("codex"), config: codexOverrideSchema }),
  z.object({ platform: z.literal("cursor"), config: cursorOverrideSchema }),
]);
export type PlatformOverride = z.infer<typeof platformOverrideSchema>;

export const draftProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("builtinTemplate"),
    templateId: z.string(),
    templateVersion: z.string(),
  }),
  z.object({
    kind: z.literal("personalTemplate"),
    templateId: z.string(),
    templateVersion: z.string(),
  }),
  z.object({
    kind: z.literal("imported"),
    sourceId: z.string(),
    expectedRevision: z.string(),
  }),
  z.object({
    kind: z.literal("nativeSource"),
    platform: agentPlatformSchema,
  }),
]);

export const agentDraftSchema = z.object({
  logicalName: z.string(),
  description: z.string(),
  developerInstructions: z.string(),
  platformOverrides: z.partialRecord(
    agentPlatformSchema,
    platformOverrideSchema,
  ),
  provenance: draftProvenanceSchema,
});
export type AgentDraft = z.infer<typeof agentDraftSchema>;

const templateRiskSchema = z.object({
  level: z.string(),
  summary: z.string(),
});

export const templateSummarySchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  supportedPlatforms: z.array(agentPlatformSchema),
  risk: templateRiskSchema,
});
export type TemplateSummary = z.infer<typeof templateSummarySchema>;

export const templatePackageSchema = z.object({
  manifest: z.object({
    id: z.string(),
    version: z.string(),
    name: z.string(),
    description: z.string(),
    author: z.string(),
    source: z.string(),
    tags: z.array(z.string()),
    supportedPlatforms: z.array(agentPlatformSchema),
    risk: templateRiskSchema,
    // Codex-only templates declare a single adapter contract, so the enum
    // keys stay partial instead of exhaustive.
    adapterContracts: z.partialRecord(agentPlatformSchema, z.string()),
  }),
  logicalName: z.string(),
  defaultDescription: z.string(),
  developerInstructions: z.string(),
  platformOverrides: z.partialRecord(
    agentPlatformSchema,
    platformOverrideSchema,
  ),
});
export type TemplatePackage = z.infer<typeof templatePackageSchema>;

/** Model catalog fetched by the backend from the Codex provider endpoint. */
export const codexModelListSchema = z.object({
  baseUrl: z.string(),
  models: z.array(z.string()),
  fetchedAtMs: z.number().int(),
  fromCache: z.boolean(),
});
export type CodexModelList = z.infer<typeof codexModelListSchema>;

export const savePersonalTemplateRequestSchema = z.object({
  name: z.string().trim().min(1),
  draft: agentDraftSchema,
});
export type SavePersonalTemplateRequest = z.infer<
  typeof savePersonalTemplateRequestSchema
>;

export const directorySourceSchema = z.enum(["userOverride", "default"]);
export const directoryAvailabilitySchema = z.enum([
  "ready",
  "missing",
  "permissionDenied",
  "invalidOverride",
]);
export const platformDirectorySchema = z.object({
  platform: agentPlatformSchema,
  absolutePath: z.string(),
  source: directorySourceSchema,
  availability: directoryAvailabilitySchema,
  platformDetected: z.boolean(),
  canRead: z.boolean(),
  canWrite: z.boolean(),
});
export type PlatformDirectory = z.infer<typeof platformDirectorySchema>;

export const validationIssueSchema = z.object({
  code: z.string(),
  field: z.string(),
  nativeField: z.string().nullable(),
  message: z.string(),
  severity: z.enum(["error", "warning"]),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const capabilityIssueSchema = z.object({
  id: z.string(),
  field: z.string(),
  platform: agentPlatformSchema,
  disposition: z.enum([
    "exact",
    "promptOnly",
    "nativeOnly",
    "unsupported",
    "preservedReadOnly",
    "blockedLossy",
  ]),
  explanation: z.string(),
});

export const conflictActionSchema = z.enum(["fail", "replaceAfterBackup"]);
export type ConflictAction = z.infer<typeof conflictActionSchema>;

export const targetSelectionSchema = z.object({
  platform: agentPlatformSchema,
  conflictAction: conflictActionSchema,
});
export type TargetSelection = z.infer<typeof targetSelectionSchema>;

export const previewTargetSchema = z.object({
  platform: agentPlatformSchema,
  targetPath: z.string(),
  nativeFormat: z.enum(["markdownYaml", "toml"]),
  nativeContent: z.string(),
  unifiedDiff: z.string(),
  currentRevision: z.string().nullable(),
  willCreateDirectory: z.boolean(),
  willCreateBackup: z.boolean(),
  conflictDetected: z.boolean(),
  validationIssues: z.array(validationIssueSchema),
  capabilityIssues: z.array(capabilityIssueSchema),
});
export type PreviewTarget = z.infer<typeof previewTargetSchema>;

export const previewBatchSchema = z.object({
  token: z.string(),
  expiresAtMs: z.number().int(),
  targets: z.array(previewTargetSchema).min(1),
});
export type PreviewBatch = z.infer<typeof previewBatchSchema>;

export const discoveredAgentSchema = z.object({
  sourceId: z.string(),
  platform: agentPlatformSchema,
  logicalName: z.string(),
  description: z.string().nullable(),
  revision: z.string(),
  pathLabel: z.string(),
  parseStatus: z.enum(["valid", "invalid", "readOnlyUnsupported"]),
  ownership: z.enum(["external", "imported"]),
  errorCode: z.string().nullable(),
  compatibilityExposure: z.boolean(),
});
export type DiscoveredAgent = z.infer<typeof discoveredAgentSchema>;

export const inventoryGroupSchema = z.object({
  logicalName: z.string(),
  sources: z.array(discoveredAgentSchema),
  hasConflict: z.boolean(),
});
export type InventoryGroup = z.infer<typeof inventoryGroupSchema>;

export const inventoryScanSchema = z.object({
  inventoryRevision: z.string(),
  directories: z.array(platformDirectorySchema),
  groups: z.array(inventoryGroupSchema),
});
export type InventoryScan = z.infer<typeof inventoryScanSchema>;

export const inventoryChangedEventSchema = z.object({
  platform: agentPlatformSchema,
  inventoryRevision: z.string(),
});
export type InventoryChangedEvent = z.infer<
  typeof inventoryChangedEventSchema
>;

export const nativeAgentContentSchema = z.object({
  sourceId: z.string(),
  platform: agentPlatformSchema,
  nativeFormat: z.enum(["markdownYaml", "toml"]),
  content: z.string(),
  pathLabel: z.string(),
  revision: z.string(),
});
export type NativeAgentContent = z.infer<typeof nativeAgentContentSchema>;

export const importAgentResultSchema = z.object({
  draft: agentDraftSchema,
  platform: agentPlatformSchema,
  sourceId: z.string(),
  sourceRevision: z.string(),
  adapterContractVersion: z.string(),
  preservedFields: z.array(z.string()),
});
export type ImportAgentResult = z.infer<typeof importAgentResultSchema>;

const commitTargetSchema = z.object({
  platform: agentPlatformSchema,
  status: z.enum([
    "committed",
    "unchanged",
    "restored",
    "removedCreatedFile",
    "manualRecoveryRequired",
  ]),
  targetPath: z.string(),
  committedRevision: z.string().nullable(),
  backupId: z.string().nullable(),
  recoveryPath: z.string().nullable(),
});

export const batchCommitResultSchema = z.object({
  operationId: z.string(),
  targets: z.array(commitTargetSchema),
  requiresManualRecovery: z.boolean(),
});
export type BatchCommitResult = z.infer<typeof batchCommitResultSchema>;

export const recoveryActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("changeName") }),
  z.object({ action: z.literal("chooseDirectory") }),
  z.object({ action: z.literal("recreatePreview") }),
  z.object({ action: z.literal("revealBackup"), backupId: z.string() }),
  z.object({
    action: z.literal("revealRecoveryDirectory"),
    recoveryId: z.string(),
  }),
]);
export type RecoveryAction = z.infer<typeof recoveryActionSchema>;

export const ipcErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  operationId: z.string().min(1),
  fieldErrors: z.array(validationIssueSchema),
  recovery: recoveryActionSchema.nullable(),
});
export type IpcErrorPayload = z.infer<typeof ipcErrorSchema>;
