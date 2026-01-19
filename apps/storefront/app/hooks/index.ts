export {
    useMedusaProducts,
    useMedusaProduct,
    getFormattedPrice,
    getPriceAmount,
    type MedusaProduct,
} from "./useMedusaProducts";

// Analytics tracking hooks (Story 5.1)
export { useNavigationTracking } from "./useNavigationTracking";
export { useScrollTracking } from "./useScrollTracking";
export { useEngagementTracking } from "./useEngagementTracking";
export { useFormTracking } from "./useFormTracking";

// Payment hooks (CHK-02-B Race Condition Fix)
export { usePaymentCollection } from "./usePaymentCollection";
export { usePaymentSession } from "./usePaymentSession";

// PostHog Survey hooks (replacing custom FEEDBACK-01)
export { usePostHogSurveys } from "./usePostHogSurveys";
export { useExitIntent } from "./useExitIntent";

// Promotions hooks (PROMO-1)
export { usePromoCode } from "./usePromoCode";
export { useAutomaticPromotions } from "./useAutomaticPromotions";

// Region management (MULTI-REGION)
export { useRegions, clearRegionsCache, type MedusaRegion } from "./useRegions";

