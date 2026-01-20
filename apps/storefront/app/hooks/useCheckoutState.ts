import { useReducer, useMemo } from 'react';
import type { CheckoutState, CheckoutAction } from '../types/checkout';

const initialState: CheckoutState = {
  status: 'idle',
  shippingAddress: null,
  email: '',
  shippingOptions: [],
  selectedShippingOption: null,
  isShippingPersisted: false,
  paymentCollectionId: null,
};

function checkoutReducer(state: CheckoutState, action: CheckoutAction): CheckoutState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.payload };
    case 'SET_ADDRESS':
      return { ...state, shippingAddress: action.payload };
    case 'SET_EMAIL':
      return { ...state, email: action.payload };
    case 'SET_SHIPPING_OPTIONS':
      return { ...state, shippingOptions: action.payload };
    case 'SELECT_SHIPPING_OPTION':
      return { 
        ...state, 
        selectedShippingOption: action.payload,
        // Reset persisted flag if selection changes
        isShippingPersisted: state.selectedShippingOption?.id === action.payload?.id 
          ? state.isShippingPersisted 
          : false 
      };
    case 'SET_SHIPPING_PERSISTED':
      return { ...state, isShippingPersisted: action.payload };
    case 'SET_PAYMENT_COLLECTION_ID':
      return { ...state, paymentCollectionId: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function useCheckoutState() {
  const [state, dispatch] = useReducer(checkoutReducer, initialState);

  const actions = useMemo(() => ({
    setStatus: (status: CheckoutState['status']) => dispatch({ type: 'SET_STATUS', payload: status }),
    setAddress: (address: CheckoutState['shippingAddress']) => dispatch({ type: 'SET_ADDRESS', payload: address }),
    setEmail: (email: string) => dispatch({ type: 'SET_EMAIL', payload: email }),
    setShippingOptions: (options: CheckoutState['shippingOptions']) => dispatch({ type: 'SET_SHIPPING_OPTIONS', payload: options }),
    selectShippingOption: (option: CheckoutState['selectedShippingOption']) => dispatch({ type: 'SELECT_SHIPPING_OPTION', payload: option }),
    setShippingPersisted: (isPersisted: boolean) => dispatch({ type: 'SET_SHIPPING_PERSISTED', payload: isPersisted }),
    setPaymentCollectionId: (id: string | null) => dispatch({ type: 'SET_PAYMENT_COLLECTION_ID', payload: id }),
    reset: () => dispatch({ type: 'RESET' }),
  }), []);

  return { state, dispatch, actions };
}
