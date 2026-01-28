import { X, AlertCircle } from "../../lib/icons";

interface CancelRejectedModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Modal shown when an order cannot be canceled because it has already been shipped.
 * Satisfies Story 3.5 AC3 and AC6.
 */
export function CancelRejectedModal({ isOpen, onClose }: CancelRejectedModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Warning icon */}
                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
                        <AlertCircle className="w-8 h-8 text-amber-600" />
                    </div>
                </div>

                {/* Content */}
                <h2 className="text-xl font-serif text-center text-text-earthy mb-2">
                    Cannot Cancel Order
                </h2>
                <p className="text-center text-text-earthy/70 mb-6">
                    This order has already been processed for shipping and can no longer be canceled. 
                    If you need assistance, please contact support.
                </p>

                {/* Actions */}
                <div className="flex flex-col gap-3">
                    <a
                        href="/support"
                        className="flex-1 px-4 py-3 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors text-center font-medium"
                    >
                        Contact Support
                    </a>
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-text-earthy hover:bg-gray-50 transition-colors font-medium"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
