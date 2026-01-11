# Test chrome-devtools MCP with Complete Checkout Flow

Conduct a complete automated checkout flow on the storefront to verify the `chrome-devtools` MCP server functionality.

## Proposed Changes

### Automation Steps
1. **Startup Services**:
    - Start Medusa backend (`pnpm run dev` in `apps/backend`).
    - Start Storefront (`pnpm run dev` in `apps/storefront`).
    - Start Stripe tunneling (`stripe listen --forward-to localhost:9000/stripe/hooks`).
2. **Automated Checkout Flow (using chrome-devtools)**:
    - **Navigate**: Open `https://localhost:5173`.
    - **Product Selection**: Find a product, click on it, and add to cart.
    - **Cart**: View cart and proceed to checkout.
    - **Checkout Details**: 
        - Locate the Stripe Developer Tools floating button ("stripe >").
        - Click it to open the test mode tools.
        - Click "Auto-fill" or similar to populate contact, shipping, and payment fields.
    - **Payment**:
        - Click "Pay now".
    - **Verification**: Wait for the "Thank you" / Success page.

## Verification Plan

### Automated Tests
- The entire flow itself is a verification of the `chrome-devtools` MCP.
- I will record the process and provide a `walkthrough.md` with the recording.

### Manual Verification
- None required as the task is to automate "without user input".
