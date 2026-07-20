import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { SavePersonalTemplateRequest } from "../../../contracts";
import { appIpc } from "../../../lib/ipc/client";
import { queryKeys } from "../../../lib/query/queryKeys";

const templatesOptions = queryOptions({
  queryKey: queryKeys.templates.all,
  queryFn: () => appIpc.listTemplates(),
});

export function useTemplates() {
  return useQuery(templatesOptions);
}

export function useTemplate(templateId: string | null) {
  return useQuery({
    queryKey: queryKeys.templates.detail(templateId ?? "none"),
    queryFn: () => appIpc.getTemplate(templateId ?? ""),
    enabled: templateId !== null,
  });
}

export function useSavePersonalTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SavePersonalTemplateRequest) =>
      appIpc.savePersonalTemplate(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.templates.all,
      });
    },
  });
}
