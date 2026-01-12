import React from 'react';
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("../CancelRejectedModal", () => ({
    CancelRejectedModal: ({ isOpen }: any) => isOpen ? (
        <div data-testid="cancel-rejected-modal">
            Cannot Cancel Order
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

// Helper to create a mock fetcher
const createMockFetcher = (data: any = null): any => ({
    data,
    state: "idle",
    submit: vi.fn(),
    formMethod: "POST",
    formAction: "order/status",
    formEncType: "application/x-www-form-urlencoded",
    text: undefined,
    formData: undefined,
    json: undefined,
    load: vi.fn(),
});

vi.mock("react-router", async () => {
    const actual = await vi.importActual("react-router");
    return {
        ...actual,
        useFetcher: vi.fn(() => createMockFetcher()),
    };
});

describe("OrderModificationDialogs", () => {
    const mockProps = {
        orderId: "order_123",
        orderNumber: "1001",
        currencyCode: "usd",
        currentAddress: {
            first_name: "John",
            last_name: "Doe",
            address_1: "123 Main St",
            city: "New York",
            postal_code: "10001",
            country_code: "us"
        },
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

    it("shows CancelRejectedModal when order_shipped error occurs", async () => {
        const { useFetcher } = await import("react-router");
        vi.mocked(useFetcher).mockReturnValue(createMockFetcher({
            success: false,
            error: "Order already shipped",
            errorCode: "order_shipped"
        }));

        render(<OrderModificationDialogs {...mockProps} />);

        // The modal should be visible because fetcher.data has the error
        expect(screen.getByTestId("cancel-rejected-modal")).toBeInTheDocument();
        expect(screen.getByText("Cannot Cancel Order")).toBeInTheDocument();
    });
});
