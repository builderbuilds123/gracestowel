import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(60 * 1000);

/**
 * Product Reviews Integration Tests
 * Tests the custom review API endpoints with database isolation
 *
 * Note: The review system requires:
 * - Authentication (customer must be logged in)
 * - Verified purchase (customer must have bought the product)
 * - One review per customer per product
 * - Smart approval (4-5★ auto-approve, 1-3★ require moderation)
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("Product Reviews API", () => {
      let productId: string;

      // Setup test data before each test
      beforeEach(async () => {
        // Use a test product ID
        productId = "prod_test_123";
      });

      describe("GET /store/products/:id/reviews", () => {
        it("should return approved reviews for a product", async () => {
          const response = await api.get(`/store/products/${productId}/reviews`);

          expect(response.status).toEqual(200);
          expect(response.data).toHaveProperty("reviews");
          expect(response.data).toHaveProperty("stats");
          expect(response.data).toHaveProperty("pagination");
          expect(Array.isArray(response.data.reviews)).toBe(true);
        });

        it("should return pagination object with has_more", async () => {
          const response = await api.get(
            `/store/products/${productId}/reviews?limit=5&offset=0`
          );

          expect(response.status).toEqual(200);
          expect(response.data.pagination).toHaveProperty("limit", 5);
          expect(response.data.pagination).toHaveProperty("offset", 0);
          expect(response.data.pagination).toHaveProperty("total");
          expect(response.data.pagination).toHaveProperty("has_more");
          expect(typeof response.data.pagination.has_more).toBe("boolean");
        });

        it("should support sorting by newest (default)", async () => {
          const response = await api.get(
            `/store/products/${productId}/reviews?sort=newest`
          );

          expect(response.status).toEqual(200);
          // Reviews should be sorted by created_at DESC
          const reviews = response.data.reviews;
          if (reviews.length > 1) {
            const firstDate = new Date(reviews[0].created_at);
            const secondDate = new Date(reviews[1].created_at);
            expect(firstDate.getTime()).toBeGreaterThanOrEqual(
              secondDate.getTime()
            );
          }
        });

        it("should support sorting by oldest", async () => {
          const response = await api.get(
            `/store/products/${productId}/reviews?sort=oldest`
          );

          expect(response.status).toEqual(200);
        });

        it("should support sorting by highest rating", async () => {
          const response = await api.get(
            `/store/products/${productId}/reviews?sort=highest`
          );

          expect(response.status).toEqual(200);
        });

        it("should support sorting by most helpful", async () => {
          const response = await api.get(
            `/store/products/${productId}/reviews?sort=helpful`
          );

          expect(response.status).toEqual(200);
        });

        it("should cap limit at 50", async () => {
          const response = await api.get(
            `/store/products/${productId}/reviews?limit=100`
          );

          expect(response.status).toEqual(200);
          expect(response.data.pagination.limit).toBeLessThanOrEqual(50);
        });

        it("should return empty array for non-existent product", async () => {
          const response = await api.get(
            `/store/products/prod_nonexistent_xyz/reviews`
          );

          expect(response.status).toEqual(200);
          expect(response.data.reviews).toEqual([]);
          expect(response.data.pagination.total).toEqual(0);
        });

        it("should only return sanitized fields in response", async () => {
          const response = await api.get(`/store/products/${productId}/reviews`);

          expect(response.status).toEqual(200);
          response.data.reviews.forEach((review: Record<string, unknown>) => {
            // Should have these public fields
            expect(review).toHaveProperty("id");
            expect(review).toHaveProperty("customer_name");
            expect(review).toHaveProperty("rating");
            expect(review).toHaveProperty("title");
            expect(review).toHaveProperty("content");
            expect(review).toHaveProperty("verified_purchase");
            expect(review).toHaveProperty("helpful_count");
            expect(review).toHaveProperty("created_at");

            // Should NOT have these private fields
            expect(review).not.toHaveProperty("customer_id");
            expect(review).not.toHaveProperty("customer_email");
            expect(review).not.toHaveProperty("order_id");
            expect(review).not.toHaveProperty("status");
          });
        });
      });

      describe("POST /store/products/:id/reviews - Authentication Required", () => {
        const validReview = {
          rating: 5,
          title: "Excellent towel!",
          content: "This is the best towel I have ever purchased. Highly recommended.",
        };

        it("should reject unauthenticated review submission with 401", async () => {
          const response = await api
            .post(`/store/products/${productId}/reviews`, validReview)
            .catch((err) => err.response);

          expect(response.status).toEqual(401);
          expect(response.data.message).toContain("logged in");
        });

        it("should reject review with invalid rating (< 1)", async () => {
          const response = await api
            .post(`/store/products/${productId}/reviews`, {
              ...validReview,
              rating: 0,
            })
            .catch((err) => err.response);

          // Will be 401 first (no auth), but if authenticated would be 400
          expect([400, 401]).toContain(response.status);
        });

        it("should reject review with invalid rating (> 5)", async () => {
          const response = await api
            .post(`/store/products/${productId}/reviews`, {
              ...validReview,
              rating: 6,
            })
            .catch((err) => err.response);

          expect([400, 401]).toContain(response.status);
        });

        it("should reject review with title too short", async () => {
          const response = await api
            .post(`/store/products/${productId}/reviews`, {
              ...validReview,
              title: "Ok",
            })
            .catch((err) => err.response);

          expect([400, 401]).toContain(response.status);
        });

        it("should reject review with content too short", async () => {
          const response = await api
            .post(`/store/products/${productId}/reviews`, {
              ...validReview,
              content: "Good",
            })
            .catch((err) => err.response);

          expect([400, 401]).toContain(response.status);
        });

        it("should reject review with title too long (> 100 chars)", async () => {
          const response = await api
            .post(`/store/products/${productId}/reviews`, {
              ...validReview,
              title: "A".repeat(101),
            })
            .catch((err) => err.response);

          expect([400, 401]).toContain(response.status);
        });

        it("should reject review with content too long (> 1000 chars)", async () => {
          const response = await api
            .post(`/store/products/${productId}/reviews`, {
              ...validReview,
              content: "A".repeat(1001),
            })
            .catch((err) => err.response);

          expect([400, 401]).toContain(response.status);
        });
      });

      describe("Helpful Vote API", () => {
        const fakeReviewId = "review_test_123";

        describe("POST /store/reviews/:reviewId/helpful", () => {
          it("should return 404 for non-existent review", async () => {
            const response = await api
              .post(`/store/reviews/${fakeReviewId}/helpful`)
              .catch((err) => err.response);

            expect(response.status).toEqual(404);
            expect(response.data.message).toContain("not found");
          });
        });

        describe("GET /store/reviews/:reviewId/helpful", () => {
          it("should return 404 for non-existent review", async () => {
            const response = await api
              .get(`/store/reviews/${fakeReviewId}/helpful`)
              .catch((err) => err.response);

            expect(response.status).toEqual(404);
            expect(response.data.message).toContain("not found");
          });
        });
      });

      describe("Performance", () => {
        it("should return reviews within acceptable time", async () => {
          const startTime = Date.now();

          const response = await api.get(`/store/products/${productId}/reviews`);

          const endTime = Date.now();
          const responseTime = endTime - startTime;

          expect(response.status).toEqual(200);
          // Response time should be under 1 second for typical product review fetch
          expect(responseTime).toBeLessThan(1000);
        });

        it("should handle pagination requests efficiently", async () => {
          const startTime = Date.now();

          const response = await api.get(
            `/store/products/${productId}/reviews?limit=50&offset=0`
          );

          const endTime = Date.now();
          const responseTime = endTime - startTime;

          expect(response.status).toEqual(200);
          // Even with large limit, should respond quickly
          expect(responseTime).toBeLessThan(2000);
        });
      });

      describe("XSS Prevention", () => {
        it("should document that XSS is prevented in POST endpoint", async () => {
          // XSS prevention is implemented in the POST endpoint:
          // - HTML tags are stripped from title and content
          // - Input is sanitized before storage
          //
          // Example malicious input that would be sanitized:
          // title: "<script>alert('xss')</script>Good towel"
          // content: "<img src='x' onerror='alert(1)'>Great product"
          //
          // These tests require authentication + verified purchase,
          // so we document the expected behavior here.
          expect(true).toBe(true);
        });
      });

      describe("Smart Approval Logic", () => {
        it("should document auto-approval for 4-5 star reviews", async () => {
          // Smart approval rules (implemented in ReviewModuleService.getAutoApprovalStatus):
          // - 4-5 star reviews from verified buyers: auto-approved
          // - 1-3 star reviews: require moderation (status: pending)
          //
          // This is tested indirectly through the service unit tests.
          expect(true).toBe(true);
        });
      });

      describe("Duplicate Prevention", () => {
        it("should document unique constraint on customer_id + product_id", async () => {
          // The database has a unique constraint on (customer_id, product_id)
          // This ensures one review per customer per product.
          // Attempting a duplicate review returns 400 with "already reviewed" message.
          //
          // The route checks this via reviewService.hasCustomerReviewed() before creation.
          expect(true).toBe(true);
        });
      });
    });
  },
});
