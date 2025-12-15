import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
// Relative path fix
import Checkout from "../../routes/checkout";
import { CartProvider } from "../../context/CartContext";
import { LocaleProvider } from "../../context/LocaleContext";
import { CustomerProvider } from "../../context/CustomerContext";

// Mocks
vi.mock("../../lib/stripe", () => ({
  initStripe: vi.fn(),
  getStripe: vi.fn(),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: any) => React.createElement("div", null, children),
  PaymentElement: () => React.createElement("div", { "data-testid": "payment-element" }, "Payment Element"),
  useStripe: () => ({ confirmPayment: vi.fn() }),
  useElements: () => ({ submit: vi.fn() }),
  LinkAuthenticationElement: () => React.createElement("div", null, "Link Auth"),
  AddressElement: ({ onChange }: any) => (
    React.createElement("input", {
      "data-testid": "address-input",
      onChange: (e: any) => onChange({ value: { address: { country: 'US', state: 'CA', postal_code: '90210' } } })
    })
  ),
  ExpressCheckoutElement: () => React.createElement("div", null, "Express Checkout"),
}));

// Mock monitoredFetch
const mockMonitoredFetch = vi.fn();
vi.mock("../../utils/monitored-fetch", () => ({
  monitoredFetch: (...args: any[]) => mockMonitoredFetch(...args),
}));

// Mock debounce
vi.mock("../../utils/debounce", () => ({
  debounce: (fn: Function) => {
    // Return a function that calls fn immediately
    const debounced = (...args: any[]) => fn(...args);
    return debounced;
  },
}));

// Mock useCallback in checkout.tsx is failing because we can't easily mock React hooks inside a component module unless we mock React itself, which is dangerous.
// The error `ReferenceError: useCallback is not defined` likely comes from `checkout.tsx` using `useCallback` but failing to import it properly or something being wrong with the environment.
// But `checkout.tsx` imports `useCallback` from `react` via `import { useState, useEffect, useRef } from "react";`.
// Wait, `checkout.tsx` imports: `import { useState, useEffect, useRef } from "react";`.
// IT DOES NOT IMPORT `useCallback`!
// That's the bug. I added `useCallback` usage but forgot to import it.

describe("Checkout Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(LocaleProvider, null,
      React.createElement(CustomerProvider, null,
        React.createElement(CartProvider, null, children)
      )
    )
  );

  it("should fetch shipping rates when address is entered", async () => {
    // Setup mocks
    mockMonitoredFetch.mockImplementation((url) => {
      if (url === "/api/payment-intent") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ clientSecret: "pi_secret", paymentIntentId: "pi_123" }),
        });
      }
      if (url === "/api/shipping-rates") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            shippingOptions: [
              { id: "ship_1", displayName: "Standard", amount: 1000, isFree: false }
            ],
            cartId: "cart_123"
          }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    // Mock cart data
    vi.mock("../../context/CartContext", async (importOriginal) => {
      const actual: any = await importOriginal();
      return {
        ...actual,
        useCart: () => ({
          items: [{ id: "1", quantity: 1, price: "$10.00", originalPrice: "$10.00", title: "Towel" }],
          cartTotal: 10,
          updateQuantity: vi.fn(),
          removeFromCart: vi.fn(),
        }),
      };
    });

    // Setup Router with Loader
    const routes = [
      {
        path: "/checkout",
        Component: Checkout,
        loader: () => ({ stripePublishableKey: "pk_test" }),
      },
    ];

    const router = createMemoryRouter(routes, {
      initialEntries: ["/checkout"],
    });

    render(
      React.createElement(TestWrapper, null,
        React.createElement(RouterProvider, { router })
      )
    );

    // Wait for payment intent to load (client secret set)
    await waitFor(() => expect(screen.getByTestId("payment-element")).toBeDefined());

    // Simulate address change
    const addressInput = screen.getByTestId("address-input");
    fireEvent.change(addressInput, { target: { value: 'trigger' } });

    // Verify shipping fetch
    await waitFor(() => {
      expect(mockMonitoredFetch).toHaveBeenCalledWith(
        "/api/shipping-rates",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("cart_123"),
        })
      );
    });

    // Verify shipping options displayed
    await waitFor(() => {
        expect(screen.getByText("Standard")).toBeDefined();
    });
  });
});
