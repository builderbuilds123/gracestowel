import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromoCodeInput } from "../PromoCodeInput";

describe("PromoCodeInput", () => {
  const defaultProps = {
    cartId: "cart_123",
    appliedCodes: [],
    onApply: vi.fn().mockResolvedValue(true),
    onRemove: vi.fn().mockResolvedValue(true),
    isLoading: false,
    error: null,
    successMessage: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Input Form", () => {
    it("renders promo code input when no codes applied", () => {
      render(<PromoCodeInput {...defaultProps} />);

      expect(screen.getByPlaceholderText("Enter promo code")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    });

    it("converts input to uppercase", async () => {
      const user = userEvent.setup();
      render(<PromoCodeInput {...defaultProps} />);

      const input = screen.getByPlaceholderText("Enter promo code");
      await user.type(input, "test10");

      expect(input).toHaveValue("TEST10");
    });

    it("calls onApply with trimmed uppercase code on submit", async () => {
      const user = userEvent.setup();
      const onApply = vi.fn().mockResolvedValue(true);
      render(<PromoCodeInput {...defaultProps} onApply={onApply} />);

      const input = screen.getByPlaceholderText("Enter promo code");
      await user.type(input, "  test10  ");
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(onApply).toHaveBeenCalledWith("TEST10");
    });

    it("clears input after successful apply", async () => {
      const user = userEvent.setup();
      const onApply = vi.fn().mockResolvedValue(true);
      render(<PromoCodeInput {...defaultProps} onApply={onApply} />);

      const input = screen.getByPlaceholderText("Enter promo code");
      await user.type(input, "TEST10");
      await user.click(screen.getByRole("button", { name: "Apply" }));

      await waitFor(() => {
        expect(input).toHaveValue("");
      });
    });

    it("does not clear input on failed apply", async () => {
      const user = userEvent.setup();
      const onApply = vi.fn().mockResolvedValue(false);
      render(<PromoCodeInput {...defaultProps} onApply={onApply} />);

      const input = screen.getByPlaceholderText("Enter promo code");
      await user.type(input, "INVALID");
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(input).toHaveValue("INVALID");
    });

    it("disables input and button when loading", () => {
      render(<PromoCodeInput {...defaultProps} isLoading={true} />);

      expect(screen.getByPlaceholderText("Enter promo code")).toBeDisabled();
      expect(screen.getByRole("button")).toBeDisabled();
      expect(screen.getByText("Applying...")).toBeInTheDocument();
    });

    it("disables input when cartId is undefined", () => {
      render(<PromoCodeInput {...defaultProps} cartId={undefined} />);

      expect(screen.getByPlaceholderText("Enter promo code")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    });

    it("disables Apply button when input is empty", () => {
      render(<PromoCodeInput {...defaultProps} />);

      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    });
  });

  describe("Applied Codes", () => {
    it("renders applied code badges instead of input", () => {
      render(
        <PromoCodeInput
          {...defaultProps}
          appliedCodes={[{ code: "TEST10", discount: 10 }]}
        />
      );

      expect(screen.queryByPlaceholderText("Enter promo code")).not.toBeInTheDocument();
      expect(screen.getByText("TEST10")).toBeInTheDocument();
      expect(screen.getByText("-$10.00")).toBeInTheDocument();
    });

    it("calls onRemove when remove button clicked", async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn().mockResolvedValue(true);
      render(
        <PromoCodeInput
          {...defaultProps}
          appliedCodes={[{ code: "TEST10", discount: 10 }]}
          onRemove={onRemove}
        />
      );

      await user.click(screen.getByRole("button", { name: "Remove promo code TEST10" }));

      expect(onRemove).toHaveBeenCalledWith("TEST10");
    });

    it("renders multiple applied codes", () => {
      render(
        <PromoCodeInput
          {...defaultProps}
          appliedCodes={[
            { code: "TEST10", discount: 10 },
            { code: "FREESHIP", discount: 5 },
          ]}
        />
      );

      expect(screen.getByText("TEST10")).toBeInTheDocument();
      expect(screen.getByText("FREESHIP")).toBeInTheDocument();
    });
  });

  describe("Messages", () => {
    it("displays success message", () => {
      render(
        <PromoCodeInput
          {...defaultProps}
          successMessage="Promo code applied!"
        />
      );

      expect(screen.getByText("Promo code applied!")).toBeInTheDocument();
    });

    it("displays error message", () => {
      render(
        <PromoCodeInput
          {...defaultProps}
          error="Invalid or expired promo code"
        />
      );

      expect(screen.getByRole("alert")).toHaveTextContent("Invalid or expired promo code");
    });
  });

  describe("Accessibility", () => {
    it("has accessible input label", () => {
      render(<PromoCodeInput {...defaultProps} />);

      expect(screen.getByLabelText("Promo code")).toBeInTheDocument();
    });

    it("error message has alert role", () => {
      render(<PromoCodeInput {...defaultProps} error="Error message" />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("remove button has accessible name", () => {
      render(
        <PromoCodeInput
          {...defaultProps}
          appliedCodes={[{ code: "TEST10", discount: 10 }]}
        />
      );

      expect(screen.getByRole("button", { name: "Remove promo code TEST10" })).toBeInTheDocument();
    });
  });
});
