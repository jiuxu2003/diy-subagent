import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { usePersistedPlatform } from "./usePersistedPlatform";

const STORAGE_KEY = "diy-subagent.platform";

afterEach(() => {
  window.localStorage.clear();
});

describe("usePersistedPlatform", () => {
  it("defaults to codex when nothing is stored", () => {
    const { result } = renderHook(() => usePersistedPlatform());

    expect(result.current[0]).toBe("codex");
  });

  it("restores a previously stored platform", () => {
    window.localStorage.setItem(STORAGE_KEY, "claude");

    const { result } = renderHook(() => usePersistedPlatform());

    expect(result.current[0]).toBe("claude");
  });

  it("falls back to codex when the stored value is garbage", () => {
    window.localStorage.setItem(STORAGE_KEY, "vscode");

    const { result } = renderHook(() => usePersistedPlatform());

    expect(result.current[0]).toBe("codex");
  });

  it("persists a new selection", () => {
    const { result } = renderHook(() => usePersistedPlatform());

    act(() => {
      result.current[1]("cursor");
    });

    expect(result.current[0]).toBe("cursor");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("cursor");
  });
});
