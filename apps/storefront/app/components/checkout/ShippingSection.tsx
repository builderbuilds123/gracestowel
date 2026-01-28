import type { ShippingOption } from "../../types/checkout";
import { useLocale } from "../../context/LocaleContext";

interface ShippingSectionProps {
  shippingOptions: ShippingOption[];
  selectedShipping: ShippingOption | null;
  onSelectShipping: (option: ShippingOption) => void;
  isCalculating: boolean;
  error?: string;
  forwardedRef?: React.Ref<HTMLDivElement>;
}

export function ShippingSection({
  shippingOptions,
  selectedShipping,
  onSelectShipping,
  isCalculating,
  error,
  forwardedRef,
}: ShippingSectionProps) {
  const { formatPrice } = useLocale();

  return (
    <div 
      ref={forwardedRef}
      className={`p-4 rounded-lg transition-all ${error ? 'border-2 border-red-500 bg-red-50' : 'border border-transparent'}`}
    >
      <h2 className="text-lg font-medium mb-4">Delivery Method</h2>
      
      {isCalculating ? (
        <div className="mt-6 text-sm text-gray-500 animate-pulse">
            Calculating shipping rates...
        </div>
      ) : shippingOptions.length > 0 ? (
        <div className="space-y-3">
          {shippingOptions.map((option) => (
            <label
              key={option.id}
              className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedShipping?.id === option.id
                  ? 'border-accent-earthy bg-accent-earthy/5'
                  : 'border-gray-200 hover:border-accent-earthy/50'
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <input
                  type="radio"
                  name="shipping"
                  checked={selectedShipping?.id === option.id}
                  onChange={() => onSelectShipping(option)}
                  className="w-5 h-5 text-accent-earthy"
                />
                <div className="flex-1">
                  <div className="font-medium text-text-earthy">
                    {option.displayName}
                  </div>
                  {option.deliveryEstimate ? (
                    <div className="text-sm text-gray-500 mt-0.5">
                      {option.deliveryEstimate}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="font-medium text-text-earthy">
                {formatPrice(option.amount)}
              </div>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm italic">Please enter your address to see shipping options.</p>
      )}

      {error ? (
        <p className="text-red-600 text-sm mt-2">{error}</p>
      ) : null}
    </div>
  );
}
