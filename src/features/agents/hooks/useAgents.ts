import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AgentDraft,
  AgentPlatform,
  TargetSelection,
} from "../../../contracts";
import { appIpc } from "../../../lib/ipc/client";
import { queryKeys } from "../../../lib/query/queryKeys";

export function useInventory(platforms?: AgentPlatform[]) {
  return useQuery({
    queryKey: queryKeys.inventory.platforms(platforms),
    queryFn: () => appIpc.scanInstalledAgents(platforms),
  });
}

export function useNativeAgentContent(sourceId: string | null) {
  return useQuery({
    queryKey: queryKeys.nativeContent(sourceId ?? "none"),
    queryFn: () => appIpc.getAgentNativeContent(sourceId ?? ""),
    enabled: sourceId !== null,
  });
}

export function useImportAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sourceId: string; expectedRevision: string }) =>
      appIpc.importAgentForEditing(input.sourceId, input.expectedRevision),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.inventory.all,
      });
    },
  });
}

export function usePreviewAgentInstall() {
  return useMutation({
    mutationFn: (input: { draft: AgentDraft; targets: TargetSelection[] }) =>
      appIpc.previewAgentInstall(input.draft, input.targets),
  });
}

export function useCommitAgentInstall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (writePlanToken: string) =>
      appIpc.commitAgentInstall(writePlanToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.inventory.all,
      });
    },
  });
}

export function useRevealAgentSource() {
  return useMutation({
    mutationFn: (sourceId: string) => appIpc.revealAgentSource(sourceId),
  });
}

export function useRevealRecoveryDirectory() {
  return useMutation({
    mutationFn: (recoveryId: string) =>
      appIpc.revealRecoveryDirectory(recoveryId),
  });
}
