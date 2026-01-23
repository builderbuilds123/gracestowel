import { useState, type FormEvent } from "react";
import { X, Tag, Loader2 } from "../lib/icons";
import { formatCurrencyFixed } from "../utils/format-currency";

interface PromoCodeInputProps {
  cartId: string | undefined;
  appliedCodes: Array<{ code: string; discount: number; isAutomatic?: boolean }>;
  onApply: (code: string) => Promise<boolean>;
  onRemove: (code: string) => Promise<boolean>;
  isLoading: boolean;
  error?: string | null;
  successMessage?: string | null;
}

/**
 * Promo code input component for checkout
 * Displays input field when no codes applied, or applied code badges
 */
export function PromoCodeInput({
  cartId,
  appliedCodes,
  onApply,
  onRemove,
  isLoading,
  error,
  successMessage,
}: PromoCodeInputProps) {
  const [code, setCode] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.trim() && !isLoading) {
      const success = await onApply(code.trim());
      if (success) {
        setCode("");
      }
    }
  };

  return (
    <div className="promo-code-section border-t border-gray-200 pt-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Promo Code</span>
      </div>

      {/* Applied promo code badges */}
      {appliedCodes.length > 0 ? (
        <div className="space-y-2 mb-3">
          {appliedCodes.map((appliedCode) => (
            <AppliedPromoBadge
              key={appliedCode.code}
              code={appliedCode.code}
              discount={appliedCode.discount}
              isAutomatic={appliedCode.isAutomatic}
              onRemove={() => onRemove(appliedCode.code)}
              isLoading={isLoading}
            />
          ))}
        </div>
      ) : null}

      {/* Promo code input - always visible */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          data-testid="promo-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={appliedCodes.length > 0 ? "Add another promo code" : "Enter promo code"}
          disabled={isLoading || !cartId}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:bg-gray-100 disabled:cursor-not-allowed
                     uppercase placeholder:normal-case"
          aria-label="Promo code"
        />
        <button
          type="submit"
          data-testid="apply-promo-button"
          disabled={isLoading || !code.trim() || !cartId}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md
                     hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500
                     disabled:bg-gray-400 disabled:cursor-not-allowed
                     flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Applying...</span>
            </>
          ) : (
            "Apply"
          )}
        </button>
      </form>

      {/* Success message */}
      {successMessage ? (
        <p className="mt-2 text-sm text-green-600 flex items-center gap-1" data-testid="promo-success-message">
          <span>✓</span> {successMessage}
        </p>
      ) : null}

      {/* Error message */}
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert" data-testid="promo-error-message">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface AppliedPromoBadgeProps {
  code: string;
  discount: number;
  isAutomatic?: boolean;
  onRemove: () => void;
  isLoading: boolean;
}

/**
 * Badge displaying an applied promo code with optional remove button
 * Automatic promotions cannot be removed by the user
 */
function AppliedPromoBadge({
  code,
  discount,
  isAutomatic = false,
  onRemove,
  isLoading,
}: AppliedPromoBadgeProps) {
  const formattedDiscount = formatCurrencyFixed(discount);

  // Style variants for automatic vs manual promos
  const badgeStyles = isAutomatic
    ? "bg-purple-50 border-purple-200"
    : "bg-green-50 border-green-200";
  const iconStyles = isAutomatic ? "text-purple-600" : "text-green-600";
  const textStyles = isAutomatic ? "text-purple-800" : "text-green-800";
  const discountStyles = isAutomatic ? "text-purple-600" : "text-green-600";

  return (
    <div 
      className={`flex items-center justify-between ${badgeStyles} border rounded-md px-3 py-2`} 
      data-testid={`applied-promo-${code}`}
    >
      <div className="flex items-center gap-2">
        <Tag className={`w-4 h-4 ${iconStyles}`} />
        <span className={`text-sm font-medium ${textStyles}`}>{code}</span>
        {isAutomatic ? (
          <span className="text-xs text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">Auto</span>
        ) : null}
        {discount > 0 ? (
          <span className={`text-sm ${discountStyles}`}>-{formattedDiscount}</span>
        ) : null}
      </div>
      {!isAutomatic ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={isLoading}
          data-testid={`remove-promo-${code}`}
          className="p-1 text-green-600 hover:text-green-800 hover:bg-green-100 rounded
                     disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Remove promo code ${code}`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
        </button>
      ) : null}
    </div>
  );
}
