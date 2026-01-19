import { Star, CheckCircle, ThumbsUp } from "lucide-react";

interface Review {
  id: string;
  rating: number;
  title: string;
  content: string;
  customer_name: string;
  created_at: string;
  verified_purchase?: boolean;
  helpful_count?: number;
}

interface ReviewStats {
  average: number;
  count: number;
  distribution: Record<number, number>;
}

interface ReviewRiverProps {
  reviews: Review[];
  stats: ReviewStats;
  onWriteReview?: () => void;
  className?: string;
}

/**
 * Customer reviews section with rating distribution
 */
export function ReviewRiver({
  reviews,
  stats,
  onWriteReview,
  className = "",
}: ReviewRiverProps) {
  return (
    <section
      className={`py-16 px-6 ${className}`}
      aria-label="Customer reviews"
    >
      <div className="max-w-5xl mx-auto">
        {/* Header with stats */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif text-text-earthy mb-6">
            Customer Reviews
          </h2>

          {/* Overall rating */}
          {stats.count > 0 && (
            <div className="flex flex-col items-center gap-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="text-5xl font-serif text-accent-earthy">
                  {stats.average.toFixed(1)}
                </span>
                <div className="flex flex-col items-start">
                  <StarRating rating={stats.average} size="lg" />
                  <span className="text-sm text-text-earthy/60 mt-1">
                    Based on {stats.count} {stats.count === 1 ? "review" : "reviews"}
                  </span>
                </div>
              </div>

              {/* Rating distribution bars */}
              <div className="w-full max-w-xs space-y-2 mt-4">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const count = stats.distribution[rating] || 0;
                  const percentage = stats.count > 0 ? (count / stats.count) * 100 : 0;

                  return (
                    <div key={rating} className="flex items-center gap-2">
                      <span className="text-sm text-text-earthy/60 w-3">{rating}</span>
                      <Star className="w-4 h-4 text-accent-earthy fill-accent-earthy" />
                      <div className="flex-1 h-2 bg-card-earthy/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-earthy rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-text-earthy/50 w-8">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Write review button */}
          {onWriteReview && (
            <button
              onClick={onWriteReview}
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-earthy text-white rounded-full hover:bg-accent-earthy/90 transition-colors"
            >
              <Star className="w-5 h-5" />
              Write a Review
            </button>
          )}
        </div>

        {/* Reviews list */}
        <div className="space-y-6">
          {reviews.length === 0 ? (
            <div className="text-center py-12 bg-card-earthy/10 rounded-2xl">
              <p className="text-text-earthy/60 mb-4">
                Be the first to share your experience!
              </p>
              {onWriteReview && (
                <button
                  onClick={onWriteReview}
                  className="text-accent-earthy hover:underline"
                >
                  Write a review
                </button>
              )}
            </div>
          ) : (
            reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

interface ReviewCardProps {
  review: Review;
}

function ReviewCard({ review }: ReviewCardProps) {
  return (
    <article className="p-6 md:p-8 bg-white rounded-2xl shadow-soft">
      <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
        {/* Left: Rating and verification */}
        <div className="flex md:flex-col items-center md:items-start gap-3 md:gap-2">
          <StarRating rating={review.rating} />
          {review.verified_purchase && (
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <CheckCircle className="w-3 h-3" />
              Verified
            </span>
          )}
        </div>

        {/* Right: Content */}
        <div className="flex-1">
          <h4 className="font-serif text-lg text-text-earthy mb-2">
            {review.title}
          </h4>
          <p className="text-text-earthy/70 leading-relaxed mb-4">
            {review.content}
          </p>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2 text-text-earthy/60">
              <span className="font-medium text-text-earthy">{review.customer_name}</span>
              <span>•</span>
              <time dateTime={review.created_at}>
                {formatRelativeTime(review.created_at)}
              </time>
            </div>

            {review.helpful_count !== undefined && review.helpful_count > 0 && (
              <span className="flex items-center gap-1 text-text-earthy/50">
                <ThumbsUp className="w-4 h-4" />
                {review.helpful_count} found helpful
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

interface StarRatingProps {
  rating: number;
  size?: "sm" | "md" | "lg";
}

function StarRating({ rating, size = "md" }: StarRatingProps) {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  return (
    <div className="flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= Math.round(rating);

        return (
          <Star
            key={star}
            className={`${sizes[size]} ${
              isFilled
                ? "text-accent-earthy fill-accent-earthy"
                : "text-card-earthy fill-card-earthy/30"
            }`}
          />
        );
      })}
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) return "Today";
  if (diffInDays === 1) return "Yesterday";
  if (diffInDays < 7) return `${diffInDays} days ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
  return `${Math.floor(diffInDays / 365)} years ago`;
}
