/**
 * Promotion Types for Medusa v2 Promotions Module
 * @see https://docs.medusajs.com/resources/commerce-modules/promotion
 */

export interface Promotion {
  id: string;
  code: string | null;
  type: "standard" | "buyget";
  is_automatic: boolean;
  status: "active" | "inactive" | "draft";
  application_method: ApplicationMethod;
  rules?: PromotionRule[];
  campaign_id?: string | null;
  campaign?: Campaign | null;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationMethod {
  id: string;
  type: "percentage" | "fixed";
  target_type: "order" | "items" | "shipping";
  value: number;
  currency_code?: string;
  allocation?: "each" | "across";
  max_quantity?: number;
  apply_to_quantity?: number;
  buy_rules_min_quantity?: number;
}

export interface PromotionRule {
  id: string;
  attribute: string;
  operator: "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte";
  values: PromotionRuleValue[];
}

export interface PromotionRuleValue {
  id: string;
  value: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  starts_at?: string;
  ends_at?: string;
  budget?: CampaignBudget;
}

export interface CampaignBudget {
  id: string;
  type: "spend" | "usage";
  limit: number;
  used: number;
}

export interface LineItemAdjustment {
  id: string;
  item_id?: string;
  amount: number;
  promotion_id?: string;
  code?: string | null;
  description?: string;
}

export interface ShippingMethodAdjustment {
  id: string;
  shipping_method_id?: string;
  amount: number;
  promotion_id?: string;
  code?: string | null;
  description?: string;
}

export interface AppliedPromoCode {
  code: string;
  discount: number;
  description?: string;
  isAutomatic?: boolean;
}

/**
 * Cart with promotion adjustments
 * Used for extracting applied promo codes from cart response
 */
export interface CartWithPromotions {
  id: string;
  region_id?: string;
  currency_code?: string;
  subtotal?: number;
  discount_total?: number;
  shipping_total?: number;
  tax_total?: number;
  total?: number;
  promotions?: Array<{
    id?: string;
    code?: string;
    is_automatic?: boolean;
    application_method?: {
      target_type?: string;
      type?: string;
      value?: string | number;
    };
  }>;
  items?: Array<{
    id: string;
    adjustments?: LineItemAdjustment[];
  }>;
  shipping_methods?: Array<{
    id: string;
    adjustments?: ShippingMethodAdjustment[];
  }>;
}
