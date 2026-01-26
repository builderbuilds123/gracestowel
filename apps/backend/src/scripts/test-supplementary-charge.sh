#!/bin/bash
# Test Supplementary Charge Flow
# This script tests the complete flow using curl commands

set -e

BACKEND_URL="http://localhost:9000"
PUB_KEY="pk_35ff7cf24e534ee75b55b2726b21445164bd9ae4b9df3e17ca416e7fcb3e2a57"

echo "🧪 Testing Supplementary Charge Flow"
echo "========================================"

# Step 1: Get region
echo -e "\n📍 Step 1: Getting region..."
REGION_RESPONSE=$(curl -s "${BACKEND_URL}/store/regions" -H "x-publishable-api-key: ${PUB_KEY}")
REGION_ID=$(echo $REGION_RESPONSE | jq -r '.regions[0].id')
CURRENCY=$(echo $REGION_RESPONSE | jq -r '.regions[0].currency_code')
echo "Region: $REGION_ID, Currency: $CURRENCY"

# Step 2: Get a product variant
echo -e "\n📦 Step 2: Getting product variant..."
PRODUCT_RESPONSE=$(curl -s "${BACKEND_URL}/store/products?limit=1&region_id=${REGION_ID}" -H "x-publishable-api-key: ${PUB_KEY}")
VARIANT_ID=$(echo $PRODUCT_RESPONSE | jq -r '.products[0].variants[0].id')
PRODUCT_TITLE=$(echo $PRODUCT_RESPONSE | jq -r '.products[0].title')
echo "Variant: $VARIANT_ID ($PRODUCT_TITLE)"

if [ "$VARIANT_ID" == "null" ]; then
    echo "❌ No products found!"
    exit 1
fi

# Step 3: Create cart
echo -e "\n🛒 Step 3: Creating cart..."
CART_RESPONSE=$(curl -s "${BACKEND_URL}/store/carts" \
    -H "x-publishable-api-key: ${PUB_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
        \"region_id\": \"${REGION_ID}\",
        \"items\": [{
            \"variant_id\": \"${VARIANT_ID}\",
            \"quantity\": 1
        }]
    }")
CART_ID=$(echo $CART_RESPONSE | jq -r '.cart.id')
echo "Cart ID: $CART_ID"

# Step 4: Add customer info
echo -e "\n📧 Step 4: Adding customer info..."
curl -s "${BACKEND_URL}/store/carts/${CART_ID}" \
    -H "x-publishable-api-key: ${PUB_KEY}" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{
        "email": "test-supp@example.com",
        "shipping_address": {
            "first_name": "Test",
            "last_name": "Supplementary",
            "address_1": "123 Test St",
            "city": "Toronto",
            "province": "ON",
            "postal_code": "M5V 1A1",
            "country_code": "ca",
            "phone": "+14161234567"
        }
    }' > /dev/null
echo "✅ Customer info added"

# Step 5: Add shipping method
echo -e "\n🚚 Step 5: Adding shipping method..."
SHIPPING_OPTIONS=$(curl -s "${BACKEND_URL}/store/shipping-options?cart_id=${CART_ID}" \
    -H "x-publishable-api-key: ${PUB_KEY}")
SHIPPING_OPTION_ID=$(echo $SHIPPING_OPTIONS | jq -r '.shipping_options[0].id')

if [ "$SHIPPING_OPTION_ID" != "null" ]; then
    curl -s "${BACKEND_URL}/store/carts/${CART_ID}/shipping-methods" \
        -H "x-publishable-api-key: ${PUB_KEY}" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "{\"option_id\": \"${SHIPPING_OPTION_ID}\"}" > /dev/null
    echo "✅ Shipping method added: $SHIPPING_OPTION_ID"
else
    echo "⚠️ No shipping options available"
fi

# Step 6: Initialize payment collection
echo -e "\n💳 Step 6: Initializing payment..."
PC_RESPONSE=$(curl -s "${BACKEND_URL}/store/payment-collections" \
    -H "x-publishable-api-key: ${PUB_KEY}" \
    -H "Content-Type: application/json" \
    -X POST \
    -d "{\"cart_id\": \"${CART_ID}\"}")
PC_ID=$(echo $PC_RESPONSE | jq -r '.payment_collection.id')
echo "Payment Collection: $PC_ID"

if [ "$PC_ID" == "null" ] || [ -z "$PC_ID" ]; then
    echo "❌ Failed to create payment collection"
    echo $PC_RESPONSE | jq '.'
    exit 1
fi

# Create payment session with setup_future_usage
echo "Creating Stripe payment session with setup_future_usage..."
SESSION_RESPONSE=$(curl -s "${BACKEND_URL}/store/payment-collections/${PC_ID}/payment-sessions" \
    -H "x-publishable-api-key: ${PUB_KEY}" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{
        "provider_id": "pp_stripe",
        "data": {
            "setup_future_usage": "off_session"
        }
    }')
SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.payment_collection.payment_sessions[0].id')
PI_ID=$(echo $SESSION_RESPONSE | jq -r '.payment_collection.payment_sessions[0].data.id')
CLIENT_SECRET=$(echo $SESSION_RESPONSE | jq -r '.payment_collection.payment_sessions[0].data.client_secret')
echo "Payment Session: $SESSION_ID"
echo "PaymentIntent: $PI_ID"

# Step 7: Confirm payment with Stripe CLI
echo -e "\n🔐 Step 7: Confirming payment with Stripe..."
# Use stripe CLI to confirm the payment intent
stripe payment_intents confirm $PI_ID \
    --payment-method=pm_card_visa \
    --return-url="http://localhost:5173/checkout/success" \
    > /tmp/stripe-confirm.json 2>&1 || true

PI_STATUS=$(cat /tmp/stripe-confirm.json | jq -r '.status' 2>/dev/null || echo "error")
echo "PaymentIntent Status: $PI_STATUS"

if [ "$PI_STATUS" != "requires_capture" ]; then
    echo "❌ Payment confirmation failed"
    cat /tmp/stripe-confirm.json
    exit 1
fi

# Step 8: Complete cart
echo -e "\n✅ Step 8: Completing cart..."
COMPLETE_RESPONSE=$(curl -s "${BACKEND_URL}/store/carts/${CART_ID}/complete" \
    -H "x-publishable-api-key: ${PUB_KEY}" \
    -H "Content-Type: application/json" \
    -X POST)
ORDER_ID=$(echo $COMPLETE_RESPONSE | jq -r '.order.id // .data.id // empty')
ORDER_TYPE=$(echo $COMPLETE_RESPONSE | jq -r '.type')

if [ -z "$ORDER_ID" ] || [ "$ORDER_ID" == "null" ]; then
    echo "❌ Order creation failed"
    echo $COMPLETE_RESPONSE | jq '.'
    exit 1
fi

echo "Order ID: $ORDER_ID"

# Get modification token via by-payment-intent endpoint
TOKEN_RESPONSE=$(curl -s "${BACKEND_URL}/store/orders/by-payment-intent?payment_intent_id=${PI_ID}" \
    -H "x-publishable-api-key: ${PUB_KEY}")
MOD_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.modification_token')
echo "Modification Token: ${MOD_TOKEN:0:30}..."

# Get line item ID
LINE_ITEM_ID=$(echo $COMPLETE_RESPONSE | jq -r '.order.items[0].id')
echo "Line Item ID: $LINE_ITEM_ID"

# Step 9: Modify order
echo -e "\n✏️ Step 9: Modifying order (increasing quantity)..."
MODIFY_RESPONSE=$(curl -s "${BACKEND_URL}/store/orders/${ORDER_ID}/batch-modifications" \
    -H "x-publishable-api-key: ${PUB_KEY}" \
    -H "Content-Type: application/json" \
    -H "x-modification-token: ${MOD_TOKEN}" \
    -X POST \
    -d "{
        \"items\": [{
            \"action\": \"update_quantity\",
            \"item_id\": \"${LINE_ITEM_ID}\",
            \"quantity\": 2
        }]
    }")

echo "Modification Response:"
echo $MODIFY_RESPONSE | jq '{
    payment_status,
    total_difference,
    supplementary_charge_created,
    supplementary_payment_collection_id,
    supplementary_amount
}'

SUPP_STATUS=$(echo $MODIFY_RESPONSE | jq -r '.payment_status')
SUPP_CREATED=$(echo $MODIFY_RESPONSE | jq -r '.supplementary_charge_created')
SUPP_PC_ID=$(echo $MODIFY_RESPONSE | jq -r '.supplementary_payment_collection_id')
SUPP_AMOUNT=$(echo $MODIFY_RESPONSE | jq -r '.supplementary_amount')

# Step 10: Verify in database
echo -e "\n🔍 Step 10: Verifying in database..."
psql "postgresql://leonliang:@localhost:5432/medusa" -t -c "
SELECT json_build_object(
    'payment_collections', (
        SELECT json_agg(json_build_object(
            'id', pc.id,
            'status', pc.status,
            'amount', pc.amount,
            'metadata', pc.metadata
        ))
        FROM order_payment_collection opc
        JOIN payment_collection pc ON opc.payment_collection_id = pc.id
        WHERE opc.order_id = '${ORDER_ID}'
    ),
    'order_metadata', (
        SELECT metadata FROM \"order\" WHERE id = '${ORDER_ID}'
    )
);
" | jq '.'

# Step 11: Check Stripe
echo -e "\n💰 Step 11: Checking Stripe for supplementary PaymentIntent..."
if [ "$SUPP_CREATED" == "true" ] && [ "$SUPP_AMOUNT" != "null" ] && [ "$SUPP_AMOUNT" != "0" ]; then
    echo "Looking for supplementary PI with amount: $SUPP_AMOUNT"
    stripe payment_intents list --limit 5 | jq --arg amt "$SUPP_AMOUNT" '
        .data[] | select(.amount == ($amt | tonumber)) | {id, amount, status, capture_method}
    '
else
    echo "Supplementary charge status: $SUPP_STATUS"
    echo "No supplementary PI expected (created: $SUPP_CREATED)"
fi

echo -e "\n========================================"
echo "🎉 Test completed!"
echo "========================================"
echo "Order ID: $ORDER_ID"
echo "PaymentIntent: $PI_ID"
echo "Supplementary Status: $SUPP_STATUS"
echo "Supplementary PC: $SUPP_PC_ID"
