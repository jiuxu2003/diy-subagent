import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

import { queryClient } from "../../lib/query/queryClient";
import { ErrorBoundary } from "./ErrorBoundary";
import { ThemeProvider } from "./ThemeProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
