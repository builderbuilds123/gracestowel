import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { CancelOrderDialog } from '../CancelOrderDialog';

describe('CancelOrderDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        orderNumber: '1001',
    };

    it('should not render when isOpen is false', () => {
        render(<CancelOrderDialog {...defaultProps} isOpen={false} />);

        expect(screen.queryByText(/Cancel Order/)).toBeNull();
    });

    it('should render when isOpen is true', () => {
        render(<CancelOrderDialog {...defaultProps} />);

        // Check for the title which contains "Cancel Order"
        expect(screen.getByText(/Cancel Order #/)).toBeDefined();
        // Check for the refund message
        expect(screen.getByText(/refunded/i)).toBeDefined();
    });

    it('should call onClose when clicking the close button', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<CancelOrderDialog {...defaultProps} onClose={onClose} />);

        const closeButton = screen.getByText('Keep Order');
        await user.click(closeButton);

        expect(onClose).toHaveBeenCalled();
    });

    it('should call onConfirm when clicking the confirm button', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        render(<CancelOrderDialog {...defaultProps} onConfirm={onConfirm} />);

        // Find the red cancel button (not the title)
        const confirmButton = screen.getByRole('button', { name: "Cancel Order" });
        
        await user.click(confirmButton);

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalled();
        });
    });

    it('should display warning about refund', () => {
        render(<CancelOrderDialog {...defaultProps} />);

        expect(screen.getByText(/refunded/i)).toBeDefined();
    });

    it('should have Keep Order and Cancel Order buttons', () => {
        render(<CancelOrderDialog {...defaultProps} />);

        expect(screen.getByText('Keep Order')).toBeDefined();
        // Find the cancel button
        const buttons = screen.getAllByRole('button');
        const cancelButton = buttons.find(btn => btn.textContent === 'Cancel Order');
        expect(cancelButton).toBeDefined();
    });
});

