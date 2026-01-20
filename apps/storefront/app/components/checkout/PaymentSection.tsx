import { PaymentElement } from '@stripe/react-stripe-js';

interface PaymentSectionProps {
  error?: string;
  forwardedRef?: React.Ref<HTMLDivElement>;
}

export function PaymentSection({ error, forwardedRef }: PaymentSectionProps) {
  return (
    <div 
      ref={forwardedRef}
      className={`p-4 rounded-lg transition-all ${error ? 'border-2 border-red-500 bg-red-50' : 'border border-transparent'}`}
    >
      <h2 className="text-lg font-medium mb-4">Payment</h2>
      <PaymentElement id="payment-element" options={{ layout: { type: 'tabs' } }} />
      {error && (
        <p className="text-red-600 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
