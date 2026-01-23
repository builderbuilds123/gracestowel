import { useState } from "react";
import { Star, X } from "../lib/icons";

interface ReviewFormProps {
    productId: string;
    productTitle: string;
    onSubmit: (review: { rating: number; title: string; content: string; customer_name: string; customer_email?: string }) => Promise<void>;
    onClose: () => void;
    isSubmitting?: boolean;
}

function InteractiveStarRating({ rating, onRatingChange }: { rating: number; onRatingChange: (rating: number) => void }) {
    const [hoverRating, setHoverRating] = useState(0);
    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => onRatingChange(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 transition-transform hover:scale-110"
                >
                    <Star
                        className={`w-8 h-8 ${
                            star <= (hoverRating || rating)
                                ? "fill-accent-earthy text-accent-earthy"
                                : "fill-gray-200 text-gray-200"
                        }`}
                    />
                </button>
            ))}
        </div>
    );
}

export function ReviewForm({ productId, productTitle, onSubmit, onClose, isSubmitting = false }: ReviewFormProps) {
    const [rating, setRating] = useState(0);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [customerName, setCustomerName] = useState("");
    const [customerEmail, setCustomerEmail] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (rating === 0) {
            setError("Please select a rating");
            return;
        }
        if (title.length < 3) {
            setError("Title must be at least 3 characters");
            return;
        }
        if (content.length < 10) {
            setError("Review must be at least 10 characters");
            return;
        }
        if (customerName.length < 2) {
            setError("Please enter your name");
            return;
        }

        try {
            await onSubmit({ rating, title, content, customer_name: customerName, customer_email: customerEmail || undefined });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to submit review");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-serif text-text-earthy">Write a Review</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <p className="text-sm text-text-earthy/60 mb-1">Reviewing</p>
                        <p className="font-medium text-text-earthy">{productTitle}</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-earthy mb-2">Your Rating *</label>
                        <InteractiveStarRating rating={rating} onRatingChange={setRating} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-earthy mb-2">Review Title *</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Summarize your experience"
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy/20"
                            maxLength={100}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-earthy mb-2">Your Review *</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Tell others about your experience with this product"
                            rows={4}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy/20 resize-none"
                            maxLength={1000}
                        />
                        <p className="text-xs text-text-earthy/40 mt-1">{content.length}/1000</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-text-earthy mb-2">Your Name *</label>
                            <input
                                type="text"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="John D."
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy/20"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-earthy mb-2">Email (optional)</label>
                            <input
                                type="email"
                                value={customerEmail}
                                onChange={(e) => setCustomerEmail(e.target.value)}
                                placeholder="john@example.com"
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy/20"
                            />
                        </div>
                    </div>

                    {error && <p className="text-red-600 text-sm">{error}</p>}

                    <div className="flex gap-3">
                        <button type="button" onClick={onClose}
                            className="flex-1 py-3 border border-gray-200 text-text-earthy rounded-lg hover:bg-gray-50 transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting}
                            className="flex-1 py-3 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors disabled:opacity-50">
                            {isSubmitting ? "Submitting..." : "Submit Review"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

