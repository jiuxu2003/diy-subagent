import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { appIpc } from "../../../lib/ipc/client";
import { queryKeys } from "../../../lib/query/queryKeys";

/**
 * Codex model catalog backing the model input datalist. The durable cache
 * lives on the Rust side, so the query result never goes stale by itself;
 * `refresh` forces a backend refetch and writes the result back into the
 * query cache. Failures stay non-blocking: the model field remains free
 * text and the UI only downgrades to a hint.
 */
export function useCodexModels() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.codexModels,
    queryFn: () => appIpc.listCodexModels({ forceRefresh: false }),
    staleTime: Infinity,
    retry: false,
  });
  const forcedRefresh = useMutation({
    mutationFn: () => appIpc.listCodexModels({ forceRefresh: true }),
    onSuccess: (list) => {
      queryClient.setQueryData(queryKeys.codexModels, list);
    },
  });

  return {
    catalog: query.data ?? null,
    isFetching: query.isPending || forcedRefresh.isPending,
    isError: query.isError || forcedRefresh.isError,
    refresh: () => {
      forcedRefresh.mutate();
    },
  };
}
