import React from 'react';
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import '@testing-library/jest-dom';
import { createMemoryRouter, RouterProvider } from "react-router";
import { OrderModificationDialogs } from "../OrderModificationDialogs";

// Mock the dialogs since we tested them individually
vi.mock("../../CancelOrderDialog", () => ({
    CancelOrderDialog: ({ isOpen, onConfirm }: any) => isOpen ? (
        <div data-testid="cancel-dialog">
            <button onClick={onConfirm}>Confirm Cancel</button>
        </div>
    ) : null
}));

vi.mock("../../EditAddressDialog", () => ({
    EditAddressDialog: ({ isOpen, onSave }: any) => isOpen ? (
        <div data-testid="edit-address-dialog">
            <button onClick={() => onSave({ first_name: "New" })}>Save Address</button>
        </div>
    ) : null
}));

vi.mock("../../AddItemsDialog", () => ({
    AddItemsDialog: ({ isOpen, onAdd }: any) => isOpen ? (
        <div data-testid="add-items-dialog">
            <button onClick={() => onAdd([{ variant_id: "123", quantity: 1 }])}>Add Item</button>
        </div>
    ) : null
}));

// Mock useFetcher since we can't easily test Remix actions in unit tests
vi.mock("react-router", async () => {
    const actual = await vi.importActual("react-router");
    return {
        ...actual,
        useFetcher: () => ({
            data: null,
            state: "idle",
            submit: vi.fn(),
        }),
    };
});

describe("OrderModificationDialogs", () => {
    const mockProps = {
        orderId: "order_123",
        orderNumber: "1001",
        currencyCode: "usd",
        currentAddress: {},
        onOrderUpdated: vi.fn(),
        onAddressUpdated: vi.fn(),
        onOrderCanceled: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders modification buttons", () => {
        render(<OrderModificationDialogs {...mockProps} />);

        expect(screen.getByText("Cancel Order")).toBeInTheDocument();
        expect(screen.getByText("Add Items")).toBeInTheDocument();
        expect(screen.getByText("Edit Address")).toBeInTheDocument();
    });

    it("opens cancel dialog when button clicked", () => {
        render(<OrderModificationDialogs {...mockProps} />);

        // Dialog should not be visible initially
        expect(screen.queryByTestId("cancel-dialog")).not.toBeInTheDocument();

        // Open Dialog
        fireEvent.click(screen.getByText("Cancel Order"));
        expect(screen.getByTestId("cancel-dialog")).toBeInTheDocument();
    });

    it("opens add items dialog when button clicked", () => {
        render(<OrderModificationDialogs {...mockProps} />);

        expect(screen.queryByTestId("add-items-dialog")).not.toBeInTheDocument();

        fireEvent.click(screen.getByText("Add Items"));
        expect(screen.getByTestId("add-items-dialog")).toBeInTheDocument();
    });

    it("opens edit address dialog when button clicked", () => {
        render(<OrderModificationDialogs {...mockProps} />);

        expect(screen.queryByTestId("edit-address-dialog")).not.toBeInTheDocument();

        fireEvent.click(screen.getByText("Edit Address"));
        expect(screen.getByTestId("edit-address-dialog")).toBeInTheDocument();
    });
});
