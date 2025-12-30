/**
 * Check Stripe Payment Intent status
 */
import { getStripeClient } from "../utils/stripe";

const paymentIntentId = process.argv[2] || "pi_3SfbTuPAvLfNBsYS0MFeiOWT";

async function checkPayment() {
    try {
        const stripe = getStripeClient();
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        console.log("\n=== Payment Intent Details ===\n");
        console.log(`Payment Intent ID: ${paymentIntent.id}`);
        console.log(`Status: ${paymentIntent.status}`);
        console.log(`Capture Method: ${paymentIntent.capture_method}`);
        console.log(`Amount: $${(paymentIntent.amount / 100).toFixed(2)} ${paymentIntent.currency.toUpperCase()}`);
        console.log(`Amount Captured: $${((paymentIntent.amount_received || 0) / 100).toFixed(2)}`);
        console.log(`Amount Capturable: $${((paymentIntent.amount_capturable || 0) / 100).toFixed(2)}`);
        console.log(`Created: ${new Date(paymentIntent.created * 1000).toISOString()}`);

        if ((paymentIntent as any).charges?.data?.length) {
            console.log("\n=== Charges ===");
            (paymentIntent as any).charges.data.forEach((charge: any, i: number) => {
                console.log(`\nCharge ${i + 1}:`);
                console.log(`  ID: ${charge.id}`);
                console.log(`  Status: ${charge.status}`);
                console.log(`  Amount: $${(charge.amount / 100).toFixed(2)}`);
                console.log(`  Captured: ${charge.captured}`);
                console.log(`  Created: ${new Date(charge.created * 1000).toISOString()}`);
            });
        }

        console.log("\n");
        process.exit(0);
    } catch (error) {
        console.error("Error checking payment:", error);
        process.exit(1);
    }
}

checkPayment();
