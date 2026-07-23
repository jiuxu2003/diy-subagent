import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { AgentPlatform, PlatformDirectory } from "../contracts";
import { inventoryScanSchema } from "../contracts";
import { App } from "./App";
import { ThemeProvider } from "./providers/ThemeProvider";

// Mock function constants avoid unbound-method references to appIpc members.
const ipcMocks = vi.hoisted(() => ({
  scanInstalledAgents: vi.fn(),
  importAgentForEditing: vi.fn(),
}));

vi.mock("../lib/ipc/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, appIpc: ipcMocks };
});

// jsdom has no Tauri runtime; a resolved unlisten keeps useInventoryEvents
// inert without touching window.__TAURI_INTERNALS__.
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

function directory(
  platform: AgentPlatform,
  platformDetected: boolean,
): PlatformDirectory {
  return {
    platform,
    absolutePath: `/Users/tester/.${platform}/agents`,
    source: "default",
    availability: platformDetected ? "ready" : "missing",
    platformDetected,
    canRead: platformDetected,
    canWrite: platformDetected,
  };
}

const scan = inventoryScanSchema.parse({
  inventoryRevision: "rev-1",
  directories: [
    directory("claude", true),
    directory("codex", true),
    directory("cursor", false),
  ],
  groups: [],
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

function refreshIcon(button: HTMLElement): SVGElement {
  const icon = button.querySelector("svg");
  if (!icon) {
    throw new Error("refresh button is missing its icon");
  }
  return icon;
}

beforeAll(() => {
  // ThemeProvider probes prefers-color-scheme; jsdom has no matchMedia.
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("App refresh feedback", () => {
  it("disables the button and spins the icon while inventory refetches", async () => {
    const user = userEvent.setup();
    ipcMocks.scanInstalledAgents.mockResolvedValue(scan);

    renderApp();

    const refresh = await screen.findByRole("button", { name: "刷新" });
    // The initial inventory load also counts as fetching; wait it out.
    await waitFor(() => {
      expect(refresh).toBeEnabled();
    });

    // Hold the click-triggered refetch open to observe the busy state.
    let resolveRefetch: (value: typeof scan) => void = () => undefined;
    ipcMocks.scanInstalledAgents.mockReturnValueOnce(
      new Promise<typeof scan>((resolve) => {
        resolveRefetch = resolve;
      }),
    );

    await user.click(refresh);

    await waitFor(() => {
      expect(refresh).toBeDisabled();
    });
    expect(refreshIcon(refresh)).toHaveClass("animate-spin");

    resolveRefetch(scan);

    await waitFor(() => {
      expect(refresh).toBeEnabled();
    });
    expect(refreshIcon(refresh)).not.toHaveClass("animate-spin");
    // The click really refetched instead of only marking the cache stale.
    expect(ipcMocks.scanInstalledAgents).toHaveBeenCalledTimes(2);
  });
});
