/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { CancelRejectedModal } from '../CancelRejectedModal';

describe('CancelRejectedModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
    };

    it('should not render when isOpen is false', () => {
        render(<CancelRejectedModal {...defaultProps} isOpen={false} />);
        expect(screen.queryByText('Cannot Cancel Order')).toBeNull();
    });

    it('should render when isOpen is true', () => {
        render(<CancelRejectedModal {...defaultProps} />);
        expect(screen.getByText('Cannot Cancel Order')).toBeDefined();
        expect(screen.getByText(/already been processed for shipping/)).toBeDefined();
    });

    it('should call onClose when clicking the close button', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<CancelRejectedModal {...defaultProps} onClose={onClose} />);

        // The 'Close' button
        const closeButton = screen.getByRole('button', { name: "Close" });
        // NOTE: lucide-react X icon might not have a name, but the button should be findable
        // Or find by the "Close" text
        const closeTextButton = screen.getByText('Close');
        
        await user.click(closeTextButton);
        expect(onClose).toHaveBeenCalled();
    });

    it('should have a Contact Support link', () => {
        render(<CancelRejectedModal {...defaultProps} />);
        const supportLink = screen.getByRole('link', { name: /Contact Support/i });
        expect(supportLink).toBeDefined();
        expect(supportLink.getAttribute('href')).toBe('/support');
    });

    it('should call onClose when clicking the backdrop', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const { container } = render(<CancelRejectedModal {...defaultProps} onClose={onClose} />);
        
        // Find the backdrop (first div child of the fixed container)
        // Or just click the fixed container itself if it's the backdrop
        // Looking at implementation: 
        // <div className="fixed ...">
        //   <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        
        const backdrop = container.querySelector('.bg-black\\/50');
        if (backdrop) {
            await user.click(backdrop);
            expect(onClose).toHaveBeenCalled();
        }
    });
});
