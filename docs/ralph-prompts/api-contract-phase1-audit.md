# Task: Audit API Contract Tests

Analyze all Postman collections and create a comprehensive audit report:

## Analysis Requirements

1. **Test Validation**
   - Run all existing contract tests
   - Identify broken/failing tests
   - Document test failures with error messages
   - Check schema validation accuracy
   - Verify tv4.validate() usage

2. **Coverage Analysis**
   - Map all backend API routes to Postman requests
   - Map all storefront API routes to Postman requests
   - Identify missing endpoints
   - Document endpoints without contract tests
   - Create coverage matrix

3. **Collection Structure**
   - Verify collection structure validity
   - Check request organization
   - Validate environment variable usage
   - Verify request chaining in checkout flow
   - Check authentication setup

4. **Schema Quality**
   - Review JSON schemas for completeness
   - Check required fields are defined
   - Verify data type validations
   - Ensure nested object schemas
   - Check error response schemas

## Backend API Routes to Map

Located in `apps/backend/src/api/`:
- Admin: reviews, stripe-queue-status, custom
- Store: orders, products, reviews, custom, debug
- Webhooks: stripe
- Health: health, workers

## Storefront API Routes to Map

Located in `apps/storefront/app/routes/api.*`:
- Carts: api.carts.ts, api.carts.$id.ts, api.carts.$id.shipping-*.ts, api.carts.$id.complete.ts
- Payment: api.payment-intent.ts, api.checkout-session.ts
- Shipping: api.shipping-rates.ts
- Infrastructure: api.health.ts

## Output

Create `docs/analysis/api-contract-test-audit.md` with:
- Executive summary
- Broken tests inventory
- Coverage gaps (missing endpoints)
- Schema quality assessment
- Priority ranking (Critical/High/Medium/Low)
- Specific fix recommendations
- Coverage matrix showing which endpoints have tests

## Success Criteria
- [ ] All collections analyzed
- [ ] All tests executed and results recorded
- [ ] Coverage matrix created
- [ ] Audit report generated
- [ ] TASK_COMPLETE
