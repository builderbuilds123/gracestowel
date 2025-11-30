import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CancelOrderDialog } from '../CancelOrderDialog';

describe('CancelOrderDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
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

    it('should call onClose when clicking the close button', () => {
        const onClose = vi.fn();
        render(<CancelOrderDialog {...defaultProps} onClose={onClose} />);

        const closeButton = screen.getByText('Keep Order');
        fireEvent.click(closeButton);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onConfirm when clicking the confirm button', async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        render(<CancelOrderDialog {...defaultProps} onConfirm={onConfirm} />);

        // Find the red cancel button (not the title)
        const buttons = screen.getAllByRole('button');
        const confirmButton = buttons.find(btn => btn.textContent === 'Cancel Order');
        expect(confirmButton).toBeDefined();
        fireEvent.click(confirmButton!);

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledTimes(1);
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

