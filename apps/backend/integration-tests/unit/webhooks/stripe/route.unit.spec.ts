
import { http } from "@medusajs/framework/http";
import { POST } from "../../../../src/api/webhooks/stripe/route";

// Mock Workflow
const mockWorkflowRun = jest.fn();

jest.mock("../../../../src/workflows/create-order-from-stripe", () => ({
    createOrderFromStripeWorkflow: jest.fn().mockImplementation(() => ({
        run: mockWorkflowRun
    }))
}));

// Mock Stripe
const mockConstructEvent = jest.fn();
jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }));
});

describe("Stripe Webhook POST", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_SECRET_KEY = "sk_test_key";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should return 500 if STRIPE_WEBHOOK_SECRET is missing", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const req = {
      headers: { "stripe-signature": "sig_123" },
      body: JSON.stringify({ id: "evt_123" }),
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await POST(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Webhook secret not configured" }));
  });

  it("should return 400 if stripe-signature is missing", async () => {
    const req = {
      headers: {},
      body: JSON.stringify({ id: "evt_123" }),
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await POST(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "No signature provided" }));
  });

  it("should return 400 if signature verification fails", async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error("Invalid signature");
    });

    const req = {
      headers: { "stripe-signature": "sig_invalid" },
      body: JSON.stringify({ id: "evt_123" }),
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await POST(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Webhook Error: Invalid signature" }));
  });

  // M2: Skip order creation when cart missing
  it("should skip order creation when cart_data is missing", async () => {
     const mockEvent = {
        type: "payment_intent.amount_capturable_updated",
        data: { 
            object: { 
                id: "pi_no_cart", 
                amount_capturable: 1000, 
                amount: 1000,
                currency: "usd",
                status: "requires_capture",
                metadata: { /* No cart_data */ }
            } 
        }
    };
    mockConstructEvent.mockReturnValue(mockEvent);

    const req = {
      headers: { "stripe-signature": "sig_valid" },
      body: JSON.stringify({ id: "evt_no_cart" }),
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    // Spy on console.log using jest.spyOn if we wanted to verify log, but for now just ensure workflow NOT called
    await POST(req, res);

    expect(mockConstructEvent).toHaveBeenCalled();
    const { createOrderFromStripeWorkflow } = require("../../../../src/workflows/create-order-from-stripe");
    expect(createOrderFromStripeWorkflow).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // M3: Handle payment failed
  it("should handle payment_intent.payment_failed without error", async () => {
    const mockEvent = {
        type: "payment_intent.payment_failed",
        data: { object: { id: "pi_fail_123", last_payment_error: { message: "Card declined" } } }
    };
    mockConstructEvent.mockReturnValue(mockEvent);

    const req = {
      headers: { "stripe-signature": "sig_valid" },
      body: JSON.stringify({ id: "evt_fail" }),
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    // We mainly want to ensure it doesn't crash and returns 200
    await POST(req, res);

    expect(mockConstructEvent).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // L2: Use correct event type "payment_intent.amount_capturable_updated" for Order Creation path (or ensure succeeded works too)
  // Actually, let's keep the happy path test for general signature but use a benign event
  it("should return 200 and process event if signature is valid", async () => {
    const mockEvent = {
        type: "payment_intent.amount_capturable_updated", // Changed from succeeded to allow simpler mocking
        data: { 
            object: { 
                id: "pi_123", amount: 1000, currency: "usd", status: "requires_capture", metadata: { cart_data: "{}" }
            } 
        } 
    };
    mockConstructEvent.mockReturnValue(mockEvent);
    mockWorkflowRun.mockResolvedValue({ result: { id: "order_123" } });

     const req = {
      headers: { "stripe-signature": "sig_valid" },
      body: JSON.stringify({ id: "evt_123" }),
       scope: {
        resolve: jest.fn(),
      },
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await POST(req, res);

    expect(mockConstructEvent).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  // H1: Validate Order Creation logic interactions
  it("should trigger createOrderFromStripeWorkflow on payment_intent.amount_capturable_updated", async () => {
    const mockEvent = {
        type: "payment_intent.amount_capturable_updated",
        data: { 
            object: { 
                id: "pi_auth_123", 
                amount_capturable: 1000, 
                amount: 1000,
                currency: "usd",
                status: "requires_capture",
                metadata: { cart_data: "{}", customer_email: "test@example.com" }
            } 
        }
    };
    mockConstructEvent.mockReturnValue(mockEvent);
    // H1 Fix: Mock return value to include status pending
    mockWorkflowRun.mockResolvedValue({ 
        result: { 
            id: "order_123", 
            modification_token: "token_123",
            status: "pending" 
        } 
    });

    const req = {
      headers: { "stripe-signature": "sig_valid" },
      body: JSON.stringify({ id: "evt_auth_123" }),
      scope: {
        resolve: jest.fn(),
      },
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await POST(req, res);

    expect(mockConstructEvent).toHaveBeenCalled();
    // Verify workflow was called
    const { createOrderFromStripeWorkflow } = require("../../../../src/workflows/create-order-from-stripe");
    expect(createOrderFromStripeWorkflow).toHaveBeenCalled();
    expect(mockWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({
        input: expect.objectContaining({
            paymentIntentId: "pi_auth_123",
            amount: 1000
        })
    }));

    // We implicitly verify correct handling by ensuring 200 OK and mock interaction matches
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
