# Stripe Payment Intent Error Troubleshooting Guide

This document provides guidance on debugging and resolving common Stripe PaymentIntent creation errors.

## Overview

When a PaymentIntent fails to be created, the system now provides detailed error information:
- **Frontend**: Error message with Stripe error details displayed to developers
- **Browser Console**: Full error object with trace ID for debugging
- **Server Logs**: Comprehensive Stripe API response with error details
- **Trace ID**: Unique identifier to correlate logs across frontend, backend, and Stripe

## Common Error Scenarios

### 1. Amount Too Small

**Error Code**: `amount_too_small`

**Message**: "Amount must be at least $0.50 usd"

**Cause**: The payment amount is below Stripe's minimum charge amount (50 cents for USD).

**Resolution**:
- Ensure cart total + shipping is at least $0.50
- Check for calculation errors that might result in very small amounts
- Verify the `toCents()` function is working correctly

**Example**:
```javascript
// Frontend sends: amount: 0.25, currency: 'usd'
// Stripe receives: 25 cents (below minimum)
```

### 2. Invalid Currency

**Error Code**: `invalid_currency`

**Message**: "Invalid currency: xxx"

**Cause**: Currency code is not a valid 3-letter ISO currency code, or Stripe doesn't support it.

**Resolution**:
- Ensure currency is lowercase 3-letter ISO code (e.g., 'usd', 'eur', 'gbp')
- Verify currency is supported by Stripe: https://stripe.com/docs/currencies
- Check the `LocaleContext` is providing valid currency codes

**Example**:
```javascript
// Invalid: currency: 'DOLLAR' or 'US' or 'USD' (uppercase)
// Valid: currency: 'usd'
```

### 3. Invalid Request Error - Missing Required Fields

**Error Code**: `parameter_missing` or `parameter_invalid_empty`

**Message**: "Missing required param: {param_name}"

**Cause**: A required parameter is missing or empty in the Stripe API request.

**Resolution**:
- Check server logs for the full request body sent to Stripe
- Verify all required fields are being set:
  - `amount` (in cents)
  - `currency`
  - `capture_method` (for auth-only flow)
- Ensure the request body is properly formatted

**Example**:
```javascript
// Missing: body.append("currency", ...)
// This causes Stripe to reject the request
```

### 4. Authentication Error

**Error Code**: `authentication_error` or `invalid_api_key`

**Message**: "Invalid API Key provided" or "No API key provided"

**Cause**: Stripe API key is missing, invalid, or incorrect for the environment.

**Resolution**:
- Verify `STRIPE_SECRET_KEY` environment variable is set
- Ensure you're using the correct key for the environment:
  - Test mode: starts with `sk_test_`
  - Live mode: starts with `sk_live_`
- Check the key hasn't been deleted or revoked in Stripe Dashboard
- Verify the Authorization header is correctly formatted: `Bearer {key}`

**Example Error Response**:
```json
{
  "error": {
    "type": "authentication_error",
    "message": "Invalid API Key provided: sk_test_****abc"
  }
}
```

### 5. Idempotency Key Error

**Error Code**: `idempotency_error`

**Message**: "Keys for idempotent requests can only be used with the same parameters they were first used with"

**Cause**: The same idempotency key is being used with different request parameters.

**Resolution**:
- Review the `generateIdempotencyKey()` function logic
- Ensure the key includes all parameters that might change (amount, cart items, customer)
- The current implementation uses a 5-minute time bucket to allow reasonable retries
- Clear browser cache/storage if testing locally

**How Idempotency Works**:
```javascript
// Same cart + amount within 5-min window = same key (OK)
// Different cart or amount = different key (OK)
// Same key with different amount = ERROR
```

### 6. Rate Limit Exceeded

**Error Code**: `rate_limit`

**Message**: "Too many requests hit the API too quickly"

**Cause**: Too many API requests in a short time period.

**Resolution**:
- Check for infinite loops or rapid-fire requests in the code
- Review the debouncing logic in `checkout.tsx` (currently 300ms)
- Implement exponential backoff for retries
- Check if multiple browser tabs are open with the same checkout

**Debugging Steps**:
1. Check browser console for rapid fetch calls
2. Review network tab for request frequency
3. Verify `useEffect` dependencies aren't causing unnecessary re-renders

### 7. Card/Payment Method Errors

**Error Code**: Various (`card_declined`, `insufficient_funds`, etc.)

**Message**: Varies based on card issue

**Cause**: Issues with the payment method during confirmation (not creation).

**Note**: These errors typically occur during `confirmPayment()`, not during PaymentIntent creation. However, if you see them during creation:

**Resolution**:
- Ensure you're not trying to attach a payment method during creation
- Use the two-step flow: create intent → collect payment → confirm
- For testing, use Stripe test cards: https://stripe.com/docs/testing

### 8. Invalid Amount Format

**Error Type**: Validation error (400 response from our API)

**Message**: "Invalid amount: must be greater than 0"

**Cause**: Amount is zero, negative, or not a valid number.

**Resolution**:
- Check cart total calculation
- Verify `parsePrice()` function is handling prices correctly
- Ensure shipping costs are being added correctly
- Check for NaN values in calculations

**Example**:
```javascript
// Invalid
amount: 0        // Caught by our validation
amount: -10      // Caught by our validation
amount: "abc"    // Would fail JSON parsing

// Valid
amount: 25.50    // Frontend sends dollars
// Backend converts to: 2550 cents
```

## Debugging Workflow

When a payment initialization error occurs:

### 1. Check Frontend Error Display
- Error message shows Stripe error details
- Look for `debugInfo` field with specific error message
- Note the trace ID for correlation

### 2. Check Browser Console
```javascript
// Look for logs like:
[Checkout] Payment intent request: {...}
[Checkout] Payment initialization error: {...}
```

### 3. Check Server Logs
```json
{
  "level": "error",
  "message": "Stripe API error",
  "context": {
    "traceId": "gt_xxx_yyy",
    "status": 400,
    "stripeErrorType": "invalid_request_error",
    "stripeErrorCode": "amount_too_small",
    "stripeErrorMessage": "Amount must be at least $0.50 usd",
    "requestAmount": 0.25,
    "requestAmountInCents": 25
  }
}
```

### 4. Correlate Using Trace ID
- Frontend and backend logs share the same trace ID
- Use trace ID to search logs end-to-end
- Format: `gt_{timestamp}_{random}`

### 5. Verify Request Parameters
Check the "Calling Stripe API" log entry:
```json
{
  "operation": "create",
  "amount": 25.50,
  "currency": "usd",
  "amountInCents": 2550,
  "hasCartItems": true,
  "cartItemCount": 3,
  "idempotencyKey": "pi_abc123_2550"
}
```

## Testing Error Scenarios

### Local Testing

1. **Test Invalid Amount**:
```javascript
// In browser console on checkout page:
fetch('/api/payment-intent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 0.25, currency: 'usd' })
})
```

2. **Test Invalid Currency**:
```javascript
fetch('/api/payment-intent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 10, currency: 'INVALID' })
})
```

3. **Test Missing API Key**:
- Temporarily remove `STRIPE_SECRET_KEY` from environment
- Attempt checkout
- Verify error message

### Unit Tests

Run the test suite to verify error handling:
```bash
pnpm test:storefront app/routes/api.payment-intent.test.ts
```

Tests cover:
- Invalid amount (zero/negative)
- Invalid currency code
- Stripe API failures with detailed error responses
- Missing API key
- Stock validation failures

## Prevention Best Practices

1. **Input Validation**: Always validate amounts and currency before sending to Stripe
2. **Error Logging**: Use structured logging with trace IDs
3. **User Feedback**: Provide clear, actionable error messages
4. **Monitoring**: Track error rates and types in your monitoring system
5. **Testing**: Test error scenarios in your CI/CD pipeline

## Related Documentation

- [Stripe API Errors](https://stripe.com/docs/api/errors)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Payment Intent API](https://stripe.com/docs/api/payment_intents)
- [Supported Currencies](https://stripe.com/docs/currencies)

## Support

If you encounter an error not covered in this guide:
1. Check the Stripe Dashboard for the PaymentIntent (if created)
2. Search Stripe documentation using the error code
3. Review recent code changes related to payment flow
4. Check for Stripe API version mismatches
