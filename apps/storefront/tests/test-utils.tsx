/**
 * Test Utilities
 * Provides reusable test helpers and context providers for component tests
 */
import React, { type ReactElement, type ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { WishlistProvider } from "../app/context/WishlistContext";
import { CartProvider } from "../app/context/CartContext";
import { LocaleProvider } from "../app/context/LocaleContext";

/**
 * Custom wrapper that provides all necessary context providers
 * Use this to wrap components that need access to app contexts
 */
function AllProviders({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <CartProvider>
        <WishlistProvider>{children}</WishlistProvider>
      </CartProvider>
    </LocaleProvider>
  );
}

/**
 * Custom render function that wraps components with all providers
 * Use this instead of RTL's render for components that use contexts
 *
 * @example
 * ```tsx
 * import { renderWithProviders } from '../tests/test-utils';
 *
 * it('should render product card', () => {
 *   renderWithProviders(<ProductCard {...mockProduct} />);
 *   expect(screen.getByText('Product Title')).toBeInTheDocument();
 * });
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from React Testing Library
export * from "@testing-library/react";
export { renderWithProviders as render };
