import { useState } from "react";
import { Star, ThumbsUp, ChevronDown } from "lucide-react";

export interface Review {
    id: string;
    customer_name: string;
    rating: number;
    title: string;
    content: string;
    verified_purchase: boolean;
    helpful_count: number;
    created_at: string;
}

export interface ReviewStats {
    average: number;
    count: number;
    distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
}

interface ReviewSectionProps {
    reviews: Review[];
    stats: ReviewStats;
    productId: string;
    onLoadMore?: () => void;
    hasMore?: boolean;
    isLoading?: boolean;
    onSortChange?: (sort: string) => void;
    currentSort?: string;
}

export function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" | "lg" }) {
    const sizeClasses = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" };
    return (
        <div className="flex">
            {[1, 2, 3, 4, 5].map((star) => (
                <Star
                    key={star}
                    className={`${sizeClasses[size]} ${
                        star <= rating ? "fill-accent-earthy text-accent-earthy" : "fill-gray-200 text-gray-200"
                    }`}
                />
            ))}
        </div>
    );
}

function RatingBar({ rating, count, total }: { rating: number; count: number; total: number }) {
    const percentage = total > 0 ? (count / total) * 100 : 0;
    return (
        <div className="flex items-center gap-2 text-sm">
            <span className="w-8 text-right">{rating}★</span>
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-accent-earthy rounded-full" style={{ width: `${percentage}%` }} />
            </div>
            <span className="w-8 text-text-earthy/60">{count}</span>
        </div>
    );
}

function ReviewCard({ review }: { review: Review }) {
    const [helpfulClicked, setHelpfulClicked] = useState(false);
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    };
    return (
        <div className="border-b border-gray-200 py-6 last:border-b-0">
            <div className="flex items-start justify-between mb-2">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <StarRating rating={review.rating} />
                        {review.verified_purchase && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Verified Purchase</span>
                        )}
                    </div>
                    <h4 className="font-medium text-text-earthy">{review.title}</h4>
                </div>
            </div>
            <p className="text-text-earthy/80 mb-3">{review.content}</p>
            <div className="flex items-center justify-between text-sm text-text-earthy/60">
                <span>By <span className="font-medium">{review.customer_name}</span> on {formatDate(review.created_at)}</span>
                <button
                    onClick={() => setHelpfulClicked(true)}
                    disabled={helpfulClicked}
                    className={`flex items-center gap-1 ${helpfulClicked ? "text-accent-earthy" : "hover:text-accent-earthy"}`}
                >
                    <ThumbsUp className="w-4 h-4" />
                    <span>Helpful ({review.helpful_count + (helpfulClicked ? 1 : 0)})</span>
                </button>
            </div>
        </div>
    );
}


export function ReviewSection({ reviews, stats, productId, onLoadMore, hasMore = false, isLoading = false, onSortChange, currentSort = "newest" }: ReviewSectionProps) {
    return (
        <div className="grid md:grid-cols-3 gap-8 mb-8">
                <div className="md:col-span-1 bg-cream-earthy p-6 rounded-lg">
                    <div className="text-center mb-4">
                        <div className="text-4xl font-bold text-text-earthy mb-1">{stats.average.toFixed(1)}</div>
                        <StarRating rating={Math.round(stats.average)} size="lg" />
                        <p className="text-sm text-text-earthy/60 mt-2">Based on {stats.count} review{stats.count !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="space-y-2">
                        {[5, 4, 3, 2, 1].map((r) => (
                            <RatingBar key={r} rating={r} count={stats.distribution[r as 1|2|3|4|5]} total={stats.count} />
                        ))}
                    </div>
                </div>
                <div className="md:col-span-2">
                    {reviews.length > 0 && onSortChange && (
                        <div className="flex justify-end mb-4">
                            <div className="relative">
                                <select value={currentSort} onChange={(e) => onSortChange(e.target.value)}
                                    className="appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2 pr-10 text-sm cursor-pointer hover:border-accent-earthy focus:outline-none focus:ring-2 focus:ring-accent-earthy/20">
                                    <option value="newest">Most Recent</option>
                                    <option value="oldest">Oldest First</option>
                                    <option value="highest">Highest Rated</option>
                                    <option value="lowest">Lowest Rated</option>
                                    <option value="helpful">Most Helpful</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                        </div>
                    )}
                    {reviews.length > 0 ? (
                        <div>
                            {reviews.map((review) => (<ReviewCard key={review.id} review={review} />))}
                            {hasMore && (
                                <button onClick={onLoadMore} disabled={isLoading}
                                    className="mt-6 w-full py-3 border border-accent-earthy text-accent-earthy rounded-lg hover:bg-accent-earthy hover:text-white transition-colors disabled:opacity-50">
                                    {isLoading ? "Loading..." : "Load More Reviews"}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-gray-50 rounded-lg">
                            <p className="text-text-earthy/60 mb-4">No reviews yet</p>
                            <p className="text-sm text-text-earthy/40">Be the first to share your experience!</p>
                        </div>
                    )}
                </div>
            </div>
    );
}