import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not implement these layout/observer APIs; Radix popper-based
// widgets (Tooltip, Select) call them when a popup opens in component tests.
class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    // Layout observation is meaningless in jsdom.
  }
  unobserve(): void {
    // Layout observation is meaningless in jsdom.
  }
  disconnect(): void {
    // Layout observation is meaningless in jsdom.
  }
}

globalThis.ResizeObserver = ResizeObserverStub;

Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {
  // Pointer capture is not implemented by jsdom.
};
Element.prototype.releasePointerCapture = () => {
  // Pointer capture is not implemented by jsdom.
};
Element.prototype.scrollIntoView = () => {
  // Scrolling is not implemented by jsdom.
};

afterEach(() => {
  cleanup();
});
