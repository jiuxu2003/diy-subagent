import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
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

/**
 * The whole suite runs on fake timers so the 700ms minimum spin window and
 * the 2s toast dismissal are deterministic. React Query propagates results
 * through 0ms timeouts, so flushing a few fake milliseconds inside act() is
 * what lets query state (and therefore the button) settle.
 */
function setupUser() {
  vi.useFakeTimers();
  return userEvent.setup({
    advanceTimers: async (delay) => {
      await vi.advanceTimersByTimeAsync(delay);
    },
  });
}

async function settle(ms = 50) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Renders the app and waits out the initial inventory load. */
async function renderAndSettle(): Promise<HTMLElement> {
  renderApp();
  await settle();
  const refresh = screen.getByRole("button", { name: "刷新" });
  expect(refresh).toBeEnabled();
  return refresh;
}

beforeAll(() => {
  // ThemeProvider probes prefers-color-scheme; jsdom has no matchMedia.
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  // RTL v16 drains its async wrapper with a 0ms timeout and only advances
  // fake timers through a `jest` global (jestFakeTimersAreEnabled in RTL's
  // pure.js); vitest defines no `jest`, so without this stub every
  // user-event call hangs forever while vi.useFakeTimers is active. The
  // stub is inert under real timers (the detection also requires the faked
  // setTimeout's `clock` marker).
  vi.stubGlobal("jest", {
    advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("App refresh feedback", () => {
  it("keeps the refresh disabled for the minimum spin window even when the refetch settles instantly", async () => {
    const user = setupUser();
    ipcMocks.scanInstalledAgents.mockResolvedValue(scan);

    const refresh = await renderAndSettle();

    await user.click(refresh);
    // The mocked refetch resolves in microtasks, far inside the 700ms
    // minimum window: the spin must still be running ~50ms in.
    await settle(50);
    expect(ipcMocks.scanInstalledAgents).toHaveBeenCalledTimes(2);
    expect(refresh).toBeDisabled();
    expect(refreshIcon(refresh)).toHaveClass("animate-spin");

    // ~550ms after the click: still inside the minimum window.
    await settle(500);
    expect(refresh).toBeDisabled();

    // ~950ms after the click: the window has elapsed.
    await settle(400);
    expect(refresh).toBeEnabled();
    expect(refreshIcon(refresh)).not.toHaveClass("animate-spin");
  });

  it("keeps spinning past the minimum window while the refetch is still in flight", async () => {
    const user = setupUser();
    ipcMocks.scanInstalledAgents.mockResolvedValue(scan);

    const refresh = await renderAndSettle();

    // Hold the click-triggered refetch open beyond the minimum window.
    let resolveRefetch: (value: typeof scan) => void = () => undefined;
    ipcMocks.scanInstalledAgents.mockReturnValueOnce(
      new Promise<typeof scan>((resolve) => {
        resolveRefetch = resolve;
      }),
    );

    await user.click(refresh);
    await settle(900);
    expect(refresh).toBeDisabled();
    expect(refreshIcon(refresh)).toHaveClass("animate-spin");

    resolveRefetch(scan);
    await settle(50);
    expect(refresh).toBeEnabled();
    expect(refreshIcon(refresh)).not.toHaveClass("animate-spin");
    expect(screen.getByRole("status")).toHaveTextContent("已刷新");
  });

  it("shows 已刷新 once the refresh settles and auto-dismisses it after ~2s", async () => {
    const user = setupUser();
    ipcMocks.scanInstalledAgents.mockResolvedValue(scan);

    const refresh = await renderAndSettle();
    // The toast pill stays mounted for its transitions but must be out of
    // the accessibility tree until a refresh actually settles.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(refresh);
    await settle(50);
    expect(screen.getByRole("status")).toHaveTextContent("已刷新");

    await settle(2100);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows 刷新失败 when the refetch rejects", async () => {
    const user = setupUser();
    ipcMocks.scanInstalledAgents.mockResolvedValue(scan);

    const refresh = await renderAndSettle();

    ipcMocks.scanInstalledAgents.mockRejectedValueOnce(
      new Error("scan failed"),
    );
    await user.click(refresh);
    await settle(50);
    expect(screen.getByRole("status")).toHaveTextContent("刷新失败");
  });
});
