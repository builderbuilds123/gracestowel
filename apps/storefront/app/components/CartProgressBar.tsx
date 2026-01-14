import { Truck, Gift, PartyPopper } from "lucide-react";

interface CartProgressBarProps {
  currentAmount: number;
  threshold: number;
  type?: "free_shipping" | "discount";
  promotionLabel?: string;
}

/**
 * Progress bar showing progress toward a promotional threshold
 * Displays current amount, goal, and visual progress
 * 
 * @see AC3.1, AC3.2, AC3.3 in PROMO-1 story
 */
export function CartProgressBar({
  currentAmount,
  threshold,
  type = "free_shipping",
  promotionLabel,
}: CartProgressBarProps) {
  // Don't render if no threshold configured
  if (threshold <= 0) {
    return null;
  }

  const progressPercent = Math.min(100, (currentAmount / threshold) * 100);
  const isGoalReached = currentAmount >= threshold;
  const amountRemaining = Math.max(0, threshold - currentAmount);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);

  const Icon = type === "free_shipping" ? Truck : Gift;
  const defaultLabel = type === "free_shipping" ? "Free Shipping" : "Discount";
  const label = promotionLabel || defaultLabel;

  // Styles grouped by goal state for maintainability
  const { containerBg, iconColor, progressBg, textColor } = isGoalReached
    ? {
        containerBg: "bg-green-50 border-green-200",
        iconColor: "text-green-600",
        progressBg: "bg-green-500",
        textColor: "text-green-700",
      }
    : {
        containerBg: "bg-gray-50 border-gray-200",
        iconColor: "text-gray-500",
        progressBg: "bg-blue-500",
        textColor: "text-gray-700",
      };

  return (
    <div className={`rounded-lg border p-4 ${containerBg}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isGoalReached ? (
            <PartyPopper className="w-5 h-5 text-green-600" />
          ) : (
            <Icon className={`w-5 h-5 ${iconColor}`} />
          )}
          <span className={`text-sm font-medium ${textColor}`}>
            {isGoalReached ? `🎉 ${label} Unlocked!` : label}
          </span>
        </div>
        <span className="text-sm text-gray-500">
          {formatCurrency(currentAmount)} / {formatCurrency(threshold)}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${progressBg} transition-all duration-500 ease-out rounded-full`}
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress toward ${label}`}
        />
      </div>

      {/* Status Message */}
      <p className={`text-sm mt-2 ${isGoalReached ? "text-green-600 font-medium" : "text-gray-600"}`}>
        {isGoalReached ? (
          `You've unlocked ${label.toLowerCase()}!`
        ) : (
          <>
            Add <span className="font-medium">{formatCurrency(amountRemaining)}</span> more to get {label.toLowerCase()}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Wrapper component that uses the useAutomaticPromotions hook
 * to automatically fetch threshold from backend
 */
export { CartProgressBar as default };
