import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { inventoryChangedEventSchema } from "../../../contracts";
import { queryKeys } from "../../../lib/query/queryKeys";

const INVENTORY_CHANGED_EVENT = "inventory://changed";

export function useInventoryEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;

    void listen<unknown>(INVENTORY_CHANGED_EVENT, (event) => {
      const payload = inventoryChangedEventSchema.safeParse(event.payload);
      if (!payload.success) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    })
      .then((stopListening) => {
        if (disposed) {
          stopListening();
          return;
        }
        unlisten = stopListening;
      })
      .catch(() => {
        unlisten = undefined;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient]);
}
