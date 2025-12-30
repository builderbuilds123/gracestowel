# Postman API Collections

This directory contains Postman collections and environments for testing the Grace Stowel e-commerce API.

## Overview

The Postman integration provides:
- **Organized API Collections** - Requests grouped by domain (Store, Admin, Custom, Webhooks)
- **Environment Configurations** - Pre-configured variables for Local, Staging, and Production
- **Contract Tests** - JSON schema validation for API responses
- **Request Chaining** - Automated variable passing for multi-step flows
- **CI/CD Integration** - Newman-based testing in GitHub Actions

## Collections

| Collection | Description |
|------------|-------------|
| `store-api.postman_collection.json` | Public storefront endpoints (products, carts, checkout) |
| `admin-api.postman_collection.json` | Authenticated admin endpoints (products, orders, customers) |
| `custom-endpoints.postman_collection.json` | Grace Stowel custom routes (health, custom store/admin) |
| `stripe-webhooks.postman_collection.json` | Stripe webhook event simulators |

## Quick Start

### 1. Import Collections

1. Open Postman
2. Click **Import** (top-left)
3. Drag and drop all files from `postman/collections/` folder
4. Drag and drop all files from `postman/environments/` folder

### 2. Select Environment

1. Click the environment dropdown (top-right, next to the eye icon)
2. Select **Local** for local development
3. The `{{base_url}}` variable will automatically resolve to `http://localhost:9000`

### 3. Configure Variables

For local development, update these variables in the **Local** environment:

| Variable | Description | Example |
|----------|-------------|---------|
| `jwt_token` | Admin JWT token for authenticated requests | `eyJhbGciOiJIUzI1NiIs...` |
| `region_id` | Default region ID for cart creation | `reg_01EXAMPLE` |
| `variant_id` | Product variant ID for testing | `variant_01EXAMPLE` |
| `stripe_webhook_secret` | Stripe webhook signing secret | `whsec_...` |

### 4. Run Your First Request

1. Expand the **Store API** collection
2. Open the **Products** folder
3. Click **List Products**
4. Click **Send**

## Environment Setup

### Local Environment
- **Base URL**: `http://localhost:9000`
- **Storefront URL**: `http://localhost:5173`
- Requires local Medusa backend running

### Staging Environment
- **Base URL**: Railway staging deployment URL
- **Storefront URL**: Cloudflare staging URL
- Requires valid JWT token in GitHub Secrets

### Production Environment
- **Base URL**: Railway production deployment URL
- **Storefront URL**: Cloudflare production URL
- Use with caution - real data!

## Running Collections

### Manual Execution

**Single Request:**
1. Select a request from any collection
2. Click **Send**

**Entire Folder:**
1. Right-click on a folder (e.g., "Complete Checkout Flow")
2. Select **Run folder**
3. Click **Run** to execute all requests in sequence

**Full Collection:**
1. Click the **...** menu on a collection
2. Select **Run collection**
3. Configure iterations and delay
4. Click **Run**

### Command Line (Newman)

Install Newman globally:
```bash
npm install -g newman newman-reporter-htmlextra
```

Run a collection:
```bash
newman run postman/collections/store-api.postman_collection.json \
  --environment postman/environments/local.postman_environment.json
```

Run with HTML report:
```bash
newman run postman/collections/store-api.postman_collection.json \
  --environment postman/environments/local.postman_environment.json \
  --reporters cli,htmlextra \
  --reporter-htmlextra-export ./newman-report.html
```

## Checkout Flow Testing

The **Store API** collection includes a "Complete Checkout Flow" folder that demonstrates request chaining:

1. **Create Cart** - Creates a new cart, stores `cart_id`
2. **Add Line Item** - Adds a product using stored `cart_id`
3. **Set Shipping Address** - Updates cart with shipping info
4. **Create Payment Sessions** - Initializes payment, stores `client_secret`
5. **Complete Checkout** - Finalizes the order

Variables are automatically passed between requests via test scripts.

## Stripe Webhook Testing

The **Stripe Webhooks** collection allows testing webhook handlers locally:

1. Set `stripe_webhook_secret` in your environment
2. Select a webhook event (e.g., `payment_intent.succeeded`)
3. The pre-request script generates a valid `Stripe-Signature` header
4. Send the request to test your webhook handler

**Supported Events:**
- `payment_intent.succeeded`
- `payment_intent.failed`
- `checkout.session.completed`

## Contract Tests

Collections include JSON schema validation tests that verify:
- Required fields are present
- Data types are correct
- Pagination fields are valid
- Response structure matches expected format

Contract tests run automatically when you send requests and appear in the **Test Results** tab.

## Adding New Requests

### 1. Create the Request

1. Right-click on the appropriate folder
2. Select **Add request**
3. Name it descriptively (e.g., "Update Product Inventory")

### 2. Configure the Request

```
Method: POST/GET/PUT/DELETE
URL: {{base_url}}/store/your-endpoint
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{jwt_token}} (for admin endpoints)
Body: (if applicable)
  {
    "field": "value"
  }
```

### 3. Add Description

Click the description area and document:
- What the endpoint does
- Required parameters
- Expected response

### 4. Add Example Response

1. Send a successful request
2. Click **Save Response** → **Save as example**
3. Name it "Success Response"

### 5. Add Tests (Optional)

```javascript
pm.test('Response status is 200', function () {
    pm.response.to.have.status(200);
});

pm.test('Response has required fields', function () {
    const response = pm.response.json();
    pm.expect(response).to.have.property('id');
});
```

### 6. Store Variables (for chaining)

```javascript
pm.test('Store ID for next request', function () {
    const response = pm.response.json();
    pm.collectionVariables.set('resource_id', response.id);
});
```

## CI/CD Integration

API contract tests run automatically on pull requests via GitHub Actions.

**Workflow:** `.github/workflows/api-contract-tests.yml`

**Required GitHub Secrets:**
- `STAGING_BASE_URL` - Staging API URL
- `STAGING_STOREFRONT_URL` - Staging storefront URL
- `STAGING_JWT_TOKEN` - Admin JWT for authenticated requests

**Reports:**
- HTML reports are uploaded as build artifacts
- Available for 14 days after the workflow run

## Validation Tests

Run the property-based validation tests:

```bash
cd postman
pnpm install
pnpm test
```

These tests verify:
- Collection structure validity
- Request documentation completeness
- Authentication variable usage
- Variable chaining in checkout flow
- Contract test schema presence
- Webhook signature generation

## Troubleshooting

### "Could not get any response"
- Ensure the backend is running (`pnpm run dev` in `apps/backend`)
- Check the environment is selected
- Verify `base_url` is correct

### "401 Unauthorized" on Admin endpoints
- Update `jwt_token` in your environment
- Generate a new token via admin login

### "Invalid Stripe signature" on webhooks
- Verify `stripe_webhook_secret` matches your Stripe dashboard
- Ensure the webhook endpoint is configured correctly

### Variables not resolving
- Check environment is selected (not "No Environment")
- Verify variable names match exactly (case-sensitive)
- Look for typos in `{{variable_name}}` syntax

## File Structure

```
postman/
├── collections/
│   ├── store-api.postman_collection.json
│   ├── admin-api.postman_collection.json
│   ├── custom-endpoints.postman_collection.json
│   └── stripe-webhooks.postman_collection.json
├── environments/
│   ├── local.postman_environment.json
│   ├── staging.postman_environment.json
│   └── production.postman_environment.json
├── __tests__/
│   └── collections.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```
