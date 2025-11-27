/**
 * MSW Request Handlers
 * Mock API endpoints for testing
 */
import { http, HttpResponse } from "msw";

// Base URL for the Medusa backend API
const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:9000";

// Mock product data
const mockProducts = [
  {
    id: "prod_01",
    title: "Classic White Towel",
    handle: "classic-white-towel",
    description: "A luxurious white cotton towel",
    thumbnail: "/images/towel-white.jpg",
    variants: [
      {
        id: "variant_01",
        title: "Default",
        prices: [{ amount: 2999, currency_code: "usd" }],
      },
    ],
  },
  {
    id: "prod_02",
    title: "Premium Gray Towel",
    handle: "premium-gray-towel",
    description: "A premium gray cotton towel",
    thumbnail: "/images/towel-gray.jpg",
    variants: [
      {
        id: "variant_02",
        title: "Default",
        prices: [{ amount: 3999, currency_code: "usd" }],
      },
    ],
  },
];

// Mock cart data
const mockCart = {
  id: "cart_01",
  items: [],
  region: {
    id: "reg_01",
    currency_code: "usd",
  },
  total: 0,
  subtotal: 0,
  tax_total: 0,
  shipping_total: 0,
};

export const handlers = [
  // Products endpoints
  http.get(`${BACKEND_URL}/store/products`, () => {
    return HttpResponse.json({
      products: mockProducts,
      count: mockProducts.length,
      offset: 0,
      limit: 20,
    });
  }),

  http.get(`${BACKEND_URL}/store/products/:id`, ({ params }) => {
    const product = mockProducts.find((p) => p.id === params.id);
    if (!product) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ product });
  }),

  // Cart endpoints
  http.post(`${BACKEND_URL}/store/carts`, () => {
    return HttpResponse.json({ cart: mockCart });
  }),

  http.get(`${BACKEND_URL}/store/carts/:id`, () => {
    return HttpResponse.json({ cart: mockCart });
  }),

  http.post(`${BACKEND_URL}/store/carts/:id/line-items`, async ({ request }) => {
    const body = await request.json() as { variant_id: string; quantity: number };
    const updatedCart = {
      ...mockCart,
      items: [
        {
          id: "item_01",
          variant_id: body.variant_id,
          quantity: body.quantity,
          unit_price: 2999,
          total: 2999 * body.quantity,
        },
      ],
      total: 2999 * body.quantity,
      subtotal: 2999 * body.quantity,
    };
    return HttpResponse.json({ cart: updatedCart });
  }),

  // Health check
  http.get(`${BACKEND_URL}/health`, () => {
    return HttpResponse.json({ status: "ok" });
  }),

  // Regions endpoint
  http.get(`${BACKEND_URL}/store/regions`, () => {
    return HttpResponse.json({
      regions: [
        {
          id: "reg_01",
          name: "United States",
          currency_code: "usd",
          countries: [{ iso_2: "us", name: "United States" }],
        },
      ],
    });
  }),
];

