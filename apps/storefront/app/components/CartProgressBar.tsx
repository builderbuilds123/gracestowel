import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { Truck, ShoppingBag, Sparkles, Circle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SITE_CONFIG } from "../config/site";

// Map milestone labels to icons
const MILESTONE_ICONS: Record<string, LucideIcon> = {
    "Free Wool Dryer Ball": Circle,
    "Free Tote Bag": ShoppingBag,
    "Free Embroidery": Sparkles,
    "Free Delivery": Truck,
};

export function CartProgressBar() {
    const { cartTotal } = useCart();
    const { formatPrice } = useLocale();

    // Get milestones from centralized config and add icons
    const configMilestones = SITE_CONFIG.cart.milestones;
    const milestones = configMilestones.map(m => ({
        ...m,
        icon: MILESTONE_ICONS[m.label] || Circle,
    }));

    // Calculate progress based on segments dynamically
    const calculateProgress = (): number => {
        // Find which segment the cart total falls into
        for (let i = configMilestones.length - 1; i >= 0; i--) {
            if (cartTotal >= configMilestones[i].price) {
                return configMilestones[i].position;
            }
        }

        // Before first milestone - calculate proportional progress
        if (configMilestones.length > 0) {
            const firstMilestone = configMilestones[0];
            return (cartTotal / firstMilestone.price) * firstMilestone.position;
        }

        return 0;
    };

    // Add interpolation between milestones for smoother progress
    const calculateSmoothProgress = (): number => {
        for (let i = 0; i < configMilestones.length; i++) {
            const current = configMilestones[i];
            if (cartTotal < current.price) {
                const prev = configMilestones[i - 1];
                if (prev) {
                    const range = current.price - prev.price;
                    const posRange = current.position - prev.position;
                    return prev.position + ((cartTotal - prev.price) / range) * posRange;
                } else {
                    return (cartTotal / current.price) * current.position;
                }
            }
        }
        return 100;
    };

    const progress = calculateSmoothProgress();

    const nextMilestone = milestones.find(m => m.price > cartTotal);

    return (
        <div className="mb-6">
            {/* Progress Message */}
            <div className="text-center mb-3 text-sm text-text-earthy">
                {nextMilestone ? (
                    <>
                        Spend <span className="font-bold text-accent-earthy">{formatPrice(nextMilestone.price - cartTotal)}</span> more for <span className="font-bold">{nextMilestone.label}</span>
                    </>
                ) : (
                    <span className="font-bold text-green-600">🎉 You've unlocked all rewards!</span>
                )}
            </div>

            {/* Progress Bar Container */}
            <div className="relative h-3 bg-gray-200 rounded-full mt-2 mx-4">
                {/* Fill */}
                <div
                    className="absolute top-0 left-0 h-full bg-accent-earthy rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />

                {/* Milestones */}
                {milestones.map((milestone, index) => {
                    const isUnlocked = cartTotal >= milestone.price;
                    const Icon = milestone.icon;

                    return (
                        <div
                            key={index}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center group"
                            style={{ left: `${milestone.position}%` }}
                        >
                            {/* Marker Dot/Icon */}
                            <div
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors z-10 ${isUnlocked
                                    ? "bg-accent-earthy border-accent-earthy text-white"
                                    : "bg-white border-gray-300 text-gray-300"
                                    }`}
                            >
                                <Icon size={12} fill={isUnlocked ? "currentColor" : "none"} />
                            </div>

                            {/* Tooltip (visible on hover) */}
                            <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-text-earthy text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none z-20">
                                {milestone.label} (${milestone.price})
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-text-earthy"></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
