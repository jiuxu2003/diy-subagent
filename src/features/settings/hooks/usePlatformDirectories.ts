import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AgentPlatform } from "../../../contracts";
import { appIpc } from "../../../lib/ipc/client";
import { queryKeys } from "../../../lib/query/queryKeys";

export function usePlatformDirectories() {
  return useQuery({
    queryKey: queryKeys.directories,
    queryFn: () => appIpc.getPlatformDirectories(),
  });
}

export function useChoosePlatformDirectory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (platform: AgentPlatform) =>
      appIpc.choosePlatformDirectory(platform),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.directories }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      ]);
    },
  });
}

export function useResetPlatformDirectory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (platform: AgentPlatform) =>
      appIpc.resetPlatformDirectory(platform),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.directories }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      ]);
    },
  });
}
