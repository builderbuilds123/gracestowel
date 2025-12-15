import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { Truck, ShoppingBag, Sparkles, Circle } from "lucide-react";

export function CartProgressBar() {
    const { cartTotal } = useCart();
    const { formatPrice } = useLocale();

    const milestones = [
        { price: 35, label: "Free Wool Dryer Ball", icon: Circle, position: 25 },
        { price: 50, label: "Free Tote Bag", icon: ShoppingBag, position: 50 },
        { price: 75, label: "Free Embroidery", icon: Sparkles, position: 75 },
        { price: 99, label: "Free Delivery", icon: Truck, position: 100 },
    ];

    // Calculate progress based on segments
    let progress = 0;
    if (cartTotal >= 99) {
        progress = 100;
    } else if (cartTotal >= 75) {
        progress = 75 + ((cartTotal - 75) / (99 - 75)) * 25;
    } else if (cartTotal >= 50) {
        progress = 50 + ((cartTotal - 50) / (75 - 50)) * 25;
    } else if (cartTotal >= 35) {
        progress = 25 + ((cartTotal - 35) / (50 - 35)) * 25;
    } else {
        progress = (cartTotal / 35) * 25;
    }

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
