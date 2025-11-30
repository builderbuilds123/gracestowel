import { useState } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";

interface CancelOrderDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    orderNumber: string;
}

/**
 * Confirmation dialog for canceling an order.
 * Shows warning and handles the cancellation flow.
 */
export function CancelOrderDialog({ isOpen, onClose, onConfirm, orderNumber }: CancelOrderDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await onConfirm();
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to cancel order. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={!isLoading ? onClose : undefined}
            />

            {/* Dialog */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                {/* Close button */}
                <button
                    onClick={onClose}
                    disabled={isLoading}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Warning icon */}
                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-8 h-8 text-red-600" />
                    </div>
                </div>

                {/* Content */}
                <h2 className="text-xl font-serif text-center text-text-earthy mb-2">
                    Cancel Order #{orderNumber}?
                </h2>
                <p className="text-center text-text-earthy/70 mb-6">
                    This action cannot be undone. Your payment will be refunded to your original payment method within 5-10 business days.
                </p>

                {/* Error message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {error}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-text-earthy hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        Keep Order
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Canceling...
                            </>
                        ) : (
                            "Cancel Order"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CancelOrderDialog;

