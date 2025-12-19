
import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || "dev-secret";
const orderId = process.argv[2] || "order_01KCSXV87YBENXHVCE9TG47ZTA";
const paymentIntentId = "pi_mock_generated";

const payload = {
    order_id: orderId,
    payment_intent_id: paymentIntentId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
};

const token = jwt.sign(payload, secret, { algorithm: "HS256" });
console.log("GENERATED_TOKEN:", token);
