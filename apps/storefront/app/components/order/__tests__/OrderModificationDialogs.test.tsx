import React from 'react';
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import '@testing-library/jest-dom';
import { OrderModificationDialogs } from "../OrderModificationDialogs";

// Mock the dialogs since we tested them individually in legacy tests or assume they work
// We focus on the orchestrator logic here
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

describe("OrderModificationDialogs", () => {
    const mockProps = {
        orderId: "order_123",
        token: "token_123",
        orderNumber: "1001",
        currencyCode: "usd",
        currentAddress: {},
        onOrderUpdated: vi.fn(),
        onAddressUpdated: vi.fn(),
        onOrderCanceled: vi.fn(),
        medusaBackendUrl: "http://localhost:9000",
        medusaPublishableKey: "pk_123"
    };

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it("opens cancel dialog and calls API on confirm", async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({})
        });

        render(<OrderModificationDialogs {...mockProps} />);

        // Open Dialog
        fireEvent.click(screen.getByText("Cancel Order"));
        expect(screen.getByTestId("cancel-dialog")).toBeInTheDocument();

        // Confirm
        fireEvent.click(screen.getByText("Confirm Cancel"));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "http://localhost:9000/store/orders/order_123/cancel",
                expect.objectContaining({
                    method: "POST",
                    body: JSON.stringify({ token: "token_123", reason: "Customer requested cancellation" })
                })
            );
            expect(mockProps.onOrderCanceled).toHaveBeenCalled();
        });
    });

    it("opens add items dialog and updates total", async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({ new_total: 5000 })
        });

        render(<OrderModificationDialogs {...mockProps} />);

        fireEvent.click(screen.getByText("Add Items"));
        expect(screen.getByTestId("add-items-dialog")).toBeInTheDocument();

        fireEvent.click(screen.getByText("Add Item"));

        await waitFor(() => {
            expect(mockProps.onOrderUpdated).toHaveBeenCalledWith(5000);
        });
    });
});
