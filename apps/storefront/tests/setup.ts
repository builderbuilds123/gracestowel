/**
 * Vitest Test Setup
 * Configures global test utilities and accessibility matchers
 * MSW server is NOT automatically started - tests that need it should import and start it themselves
 */
import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Mock IntersectionObserver for components using useInViewReveal
class IntersectionObserverMock {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(private callback: IntersectionObserverCallback) {}

  observe() {
    // Immediately trigger callback as if element is in view
    this.callback([{
      isIntersecting: true,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRatio: 1,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      target: document.body,
      time: 0,
    }], this as unknown as IntersectionObserver);
  }

  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);

// Factory function to create storage mocks (avoids code duplication)
const createStorageMock = () => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
};

// Mock localStorage for tests
const localStorageMock = createStorageMock();

// Mock sessionStorage for tests
const sessionStorageMock = createStorageMock();

// Set up localStorage mock globally
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Set up sessionStorage mock globally
Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
  writable: true,
});

// Setup before each test (optional, but good for reset)
beforeEach(() => {
   // Ensuring it's still there or resetting if needed can be done here, 
   // but primarily we need it defined early.
});

// Reset after each test
afterEach(() => {
  cleanup();
  localStorageMock.clear();
  sessionStorageMock.clear();
});
