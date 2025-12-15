export interface TestOrder {
  id: string;
  displayId: number;
  paymentIntentId: string;
  items: TestOrderItem[];
  total: number;
  status: string;
  modificationToken: string;
  createdAt: Date;
}

export interface TestOrderItem {
  variantId: string;
  quantity: number;
  unitPrice: number;
}

export interface TestOrderOptions {
  items?: TestOrderItem[];
  shippingAddress?: ShippingAddress;
  email?: string;
  metadata?: Record<string, string>;
}

export interface ShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  postalCode: string;
  countryCode: string;
}
