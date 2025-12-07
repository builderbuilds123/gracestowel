# Story 1.1: Backend Stripe Plugin Setup

## Goal
Configure the `medusa-payment-stripe` plugin in the backend to securely process payments via Stripe API.

## Implementation Steps

### 1. Installation
- [ ] Run `npm install @medusajs/payment-stripe` in `apps/backend`.
- [ ] Verify `package.json` dependency.

### 2. Configuration
- [ ] Add env vars to `.env.template`:
    - `STRIPE_API_KEY`
    - `STRIPE_WEBHOOK_SECRET`
- [ ] Update `apps/backend/medusa-config.ts`:
    - Register `payment-stripe` module.
    - Map `stripe` provider to the plugin.
    - Set `capture: false` in plugin options (if supported globally) or document it for Order creation.

### 3. Verification
- [ ] Run the server and check logs for "Stripe provider initialized".
- [ ] Verify `GET /store/payment-providers` lists `stripe`.

## Acceptance Criteria
- [ ] Stripe provider registered in Medusa.
- [ ] Webhooks configured for `payment_intent.succeeded`.
- [ ] API keys loaded from environment variables.
