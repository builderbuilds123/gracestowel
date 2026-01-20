import type { ShippingOption } from "../components/CheckoutForm";

export type CheckoutStatus = 
  | 'idle'
  | 'initializing'
  | 'syncing_cart'
  | 'fetching_shipping'
  | 'ready'
  | 'processing_payment'
  | 'completed'
  | 'error';

export interface CheckoutAddress {
  firstName: string;
  lastName: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  phone?: string;
}

export interface CheckoutState {
  status: CheckoutStatus;
  shippingAddress: CheckoutAddress | null;
  email: string;
  shippingOptions: ShippingOption[];
  selectedShippingOption: ShippingOption | null;
  isShippingPersisted: boolean;
  paymentCollectionId: string | null;
}

export type CheckoutAction =
  | { type: 'SET_STATUS'; payload: CheckoutStatus }
  | { type: 'SET_ADDRESS'; payload: CheckoutAddress | null }
  | { type: 'SET_EMAIL'; payload: string }
  | { type: 'SET_SHIPPING_OPTIONS'; payload: ShippingOption[] }
  | { type: 'SELECT_SHIPPING_OPTION'; payload: ShippingOption | null }
  | { type: 'SET_SHIPPING_PERSISTED'; payload: boolean }
  | { type: 'SET_PAYMENT_COLLECTION_ID'; payload: string | null }
  | { type: 'RESET' };
