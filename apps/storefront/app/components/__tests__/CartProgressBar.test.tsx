import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CartProgressBar } from "../CartProgressBar";

describe("CartProgressBar", () => {
  describe("rendering", () => {
    it("should not render when threshold is 0", () => {
      const { container } = render(
        <CartProgressBar currentAmount={50} threshold={0} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("should not render when threshold is negative", () => {
      const { container } = render(
        <CartProgressBar currentAmount={50} threshold={-10} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("should render progress bar when threshold is positive", () => {
      render(<CartProgressBar currentAmount={50} threshold={75} />);
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });
  });

  describe("progress calculation", () => {
    it("should display correct amounts", () => {
      render(<CartProgressBar currentAmount={50} threshold={75} />);
      expect(screen.getByText("$50 / $75")).toBeInTheDocument();
    });

    it("should show amount remaining", () => {
      render(<CartProgressBar currentAmount={50} threshold={75} />);
      expect(screen.getByText("$25")).toBeInTheDocument();
    });

    it("should calculate progress percentage correctly", () => {
      render(<CartProgressBar currentAmount={37.50} threshold={75} />);
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "50");
    });

    it("should cap progress at 100%", () => {
      render(<CartProgressBar currentAmount={100} threshold={75} />);
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "100");
    });
  });

  describe("goal reached state", () => {
    it("should show celebration when goal reached", () => {
      render(<CartProgressBar currentAmount={80} threshold={75} />);
      expect(screen.getByText(/🎉/)).toBeInTheDocument();
      expect(screen.getByText(/Unlocked!/)).toBeInTheDocument();
    });

    it("should show success message when goal reached", () => {
      render(<CartProgressBar currentAmount={80} threshold={75} />);
      expect(screen.getByText(/You've unlocked/)).toBeInTheDocument();
    });

    it("should show progress message when goal not reached", () => {
      render(<CartProgressBar currentAmount={50} threshold={75} />);
      expect(screen.getByText(/more to get free shipping/)).toBeInTheDocument();
    });
  });

  describe("promotion types", () => {
    it("should show free shipping label by default", () => {
      render(<CartProgressBar currentAmount={50} threshold={75} />);
      expect(screen.getByText("Free Shipping")).toBeInTheDocument();
    });

    it("should show discount label when type is discount", () => {
      render(
        <CartProgressBar currentAmount={50} threshold={75} type="discount" />
      );
      expect(screen.getByText("Discount")).toBeInTheDocument();
    });

    it("should use custom label when provided", () => {
      render(
        <CartProgressBar
          currentAmount={50}
          threshold={75}
          promotionLabel="Summer Sale"
        />
      );
      expect(screen.getByText("Summer Sale")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have accessible progressbar role", () => {
      render(<CartProgressBar currentAmount={50} threshold={75} />);
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    });

    it("should have descriptive aria-label", () => {
      render(<CartProgressBar currentAmount={50} threshold={75} />);
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute(
        "aria-label",
        "Progress toward Free Shipping"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle exact threshold match", () => {
      render(<CartProgressBar currentAmount={75} threshold={75} />);
      expect(screen.getByText(/Unlocked!/)).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    });

    it("should format currency correctly for cents", () => {
      render(<CartProgressBar currentAmount={49.99} threshold={75} />);
      expect(screen.getByText("$49.99 / $75")).toBeInTheDocument();
    });
  });
});
