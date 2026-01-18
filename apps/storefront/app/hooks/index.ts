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

// Feedback hooks (FEEDBACK-01)
export { useFeedbackContext } from "./useFeedbackContext";
export { useFeedbackTrigger } from "./useFeedbackTrigger";
export { useFeedbackSubmit } from "./useFeedbackSubmit";

// Promotions hooks (PROMO-1)
export { usePromoCode } from "./usePromoCode";
export { useAutomaticPromotions } from "./useAutomaticPromotions";

// Region management (MULTI-REGION)
export { useRegions, clearRegionsCache, type MedusaRegion } from "./useRegions";

