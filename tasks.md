# Grace Stowel - Project Tasks

## 🚨 High Priority (Immediate Blockers)

- [ ] **Fix Medusa Production Build**
  - [/] Resolve `@medusajs/framework/utils` resolution error in production
  - [x] Verify `tsconfig.json` settings for backend
  - [ ] Confirm successful deployment on Railway

- [ ] **Verify Checkout Flow**
  - [ ] Test Stripe PaymentIntent creation (`api.payment-intent.ts`)
  - [ ] Test Shipping Rates retrieval (`api.shipping-rates.ts`)
  - [ ] Verify "Powered by Stripe" compliance
  - [ ] Ensure Order Summary is sticky and responsive

## 🚧 In Progress

- [ ] **Localization & Currency**
  - [x] Implement `LocaleContext`
  - [x] Add Language/Currency Selectors to Header
  - [ ] Complete French translations in `LocaleContext.tsx` (currently partial)
  - [ ] Verify currency conversion logic (currently hardcoded 0.75 rate)

- [ ] **Storefront Refinement**
  - [ ] Audit mobile responsiveness for Checkout
  - [ ] Verify "Return to Towels" link behavior

## 📋 Backlog (Future)

- [ ] **Testing**
  - [ ] Add integration tests for Checkout flow
  - [ ] Add unit tests for `LocaleContext`

- [ ] **Content**
  - [ ] Populate `about.tsx` with real content
  - [ ] Add real blog posts to `blog.tsx`

- [ ] **SEO**
  - [ ] Add meta tags for all pages
  - [ ] Generate sitemap.xml
