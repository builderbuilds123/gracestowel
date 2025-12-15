# Story 1-4: Create Data Factory Fixture for Test Isolation

**Epic:** Epic 1 - Test Infrastructure Foundation  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR3.2, FR3.3, FR11.3

---

## User Story

As a **QA engineer**,  
I want **a data factory fixture that generates unique test data**,  
So that **tests can run in parallel without data collisions**.

---

## Acceptance Criteria

### AC1: Unique Test Data Generation
**Given** I need unique test data  
**When** I use the DataFactory fixture  
**Then** unique identifiers (timestamps, UUIDs) are generated for each test

### AC2: Automatic Cleanup
**Given** a test creates data  
**When** the test completes  
**Then** the cleanup function removes created test data

### AC3: Parallel Test Isolation
**Given** tests run in parallel  
**When** multiple tests use the DataFactory  
**Then** no data collisions occur between tests

---

## Technical Context

### Architecture Reference
From `.kiro/specs/e2e-testing-overhaul/design.md`:

```typescript
interface DataFactoryFixture {
  createProduct(overrides?: Partial<Product>): Promise<Product>;
  createCustomer(overrides?: Partial<Customer>): Promise<Customer>;
  createOrder(overrides?: Partial<Order>): Promise<Order>;
  cleanup(): Promise<void>;
}
```

### Test Data Strategy
From design document:
> - **Dynamic product discovery**: Fetch available products via Medusa API at test start
> - **Unique identifiers**: Use timestamps and UUIDs for test data to prevent collisions
> - **Cleanup**: Delete created test data after each test using API calls
> - **Environment configuration**: Read API URLs and keys from environment variables

---

## Implementation Tasks

### Task 1: Create Unique ID Generator
**File:** `apps/e2e/helpers/id-generator.ts`

```typescript
import { randomUUID } from 'crypto';

/**
 * Generate a unique test ID with optional prefix
 */
export function generateTestId(prefix = 'test'): string {
  const timestamp = Date.now();
  const random = randomUUID().slice(0, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate a unique email for test customers
 */
export function generateTestEmail(): string {
  const id = generateTestId('user');
  return `${id}@test.gracestowel.com`;
}

/**
 * Generate a unique phone number for testing
 */
export function generateTestPhone(): string {
  const random = Math.floor(Math.random() * 9000000) + 1000000;
  return `+1555${random}`;
}

/**
 * Check if an ID is a test ID (for cleanup)
 */
export function isTestId(id: string): boolean {
  return id.startsWith('test_') || id.includes('@test.gracestowel.com');
}
```

### Task 2: Create Data Factory Class
**File:** `apps/e2e/helpers/data-factory.ts`

```typescript
import { generateTestId, generateTestEmail, generateTestPhone } from './id-generator';

export interface TestProduct {
  id: string;
  handle: string;
  title: string;
  variants: TestVariant[];
}

export interface TestVariant {
  id: string;
  sku: string;
  price: number;
  inventory_quantity: number;
}

export interface TestCustomer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface TestAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  city: string;
  province: string;
  postal_code: string;
  country_code: string;
  phone: string;
}

export interface TestCartItem {
  variant_id: string;
  quantity: number;
}

export class DataFactory {
  private createdResources: Array<{ type: string; id: string }> = [];
  private backendUrl: string;
  private medusaUrl: string;
  
  constructor() {
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:9000';
    this.medusaUrl = process.env.MEDUSA_URL || 'http://localhost:9000';
  }
  
  /**
   * Fetch available products from the store
   */
  async getAvailableProducts(): Promise<TestProduct[]> {
    const response = await fetch(`${this.medusaUrl}/store/products?limit=10`);
    const data = await response.json();
    return data.products.map((p: any) => ({
      id: p.id,
      handle: p.handle,
      title: p.title,
      variants: p.variants.map((v: any) => ({
        id: v.id,
        sku: v.sku,
        price: v.prices?.[0]?.amount || 0,
        inventory_quantity: v.inventory_quantity || 100,
      })),
    }));
  }
  
  /**
   * Get a random available product
   */
  async getRandomProduct(): Promise<TestProduct> {
    const products = await this.getAvailableProducts();
    if (products.length === 0) {
      throw new Error('No products available in store');
    }
    return products[Math.floor(Math.random() * products.length)];
  }
  
  /**
   * Generate a test shipping address
   */
  generateAddress(overrides?: Partial<TestAddress>): TestAddress {
    return {
      first_name: 'Test',
      last_name: generateTestId('User'),
      address_1: '123 Test Street',
      city: 'Test City',
      province: 'CA',
      postal_code: '90210',
      country_code: 'us',
      phone: generateTestPhone(),
      ...overrides,
    };
  }
  
  /**
   * Generate test customer data
   */
  generateCustomer(overrides?: Partial<TestCustomer>): Omit<TestCustomer, 'id'> {
    return {
      email: generateTestEmail(),
      first_name: 'Test',
      last_name: generateTestId('Customer'),
      ...overrides,
    };
  }
  
  /**
   * Create a cart with items
   */
  async createCart(items?: TestCartItem[]): Promise<{ id: string; items: any[] }> {
    // Create empty cart
    const createResponse = await fetch(`${this.medusaUrl}/store/carts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region_id: await this.getDefaultRegionId() }),
    });
    const { cart } = await createResponse.json();
    
    this.trackResource('cart', cart.id);
    
    // Add items if provided
    if (items && items.length > 0) {
      for (const item of items) {
        await fetch(`${this.medusaUrl}/store/carts/${cart.id}/line-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
      }
      
      // Fetch updated cart
      const updatedResponse = await fetch(`${this.medusaUrl}/store/carts/${cart.id}`);
      const { cart: updatedCart } = await updatedResponse.json();
      return { id: updatedCart.id, items: updatedCart.items };
    }
    
    return { id: cart.id, items: [] };
  }
  
  /**
   * Get default region ID
   */
  private async getDefaultRegionId(): Promise<string> {
    const response = await fetch(`${this.medusaUrl}/store/regions`);
    const { regions } = await response.json();
    return regions[0]?.id || 'reg_01';
  }
  
  /**
   * Track a created resource for cleanup
   */
  private trackResource(type: string, id: string): void {
    this.createdResources.push({ type, id });
  }
  
  /**
   * Clean up all created resources
   */
  async cleanup(): Promise<void> {
    console.log(`🧹 Cleaning up ${this.createdResources.length} test resources...`);
    
    for (const resource of this.createdResources.reverse()) {
      try {
        switch (resource.type) {
          case 'cart':
            // Carts auto-expire, but we can try to delete
            await fetch(`${this.medusaUrl}/store/carts/${resource.id}`, {
              method: 'DELETE',
            }).catch(() => {});
            break;
          case 'customer':
            // Customers may need admin API to delete
            console.log(`  - Skipping customer cleanup: ${resource.id}`);
            break;
          default:
            console.log(`  - Unknown resource type: ${resource.type}`);
        }
      } catch (error) {
        console.warn(`  - Failed to cleanup ${resource.type}:${resource.id}`, error);
      }
    }
    
    this.createdResources = [];
    console.log('✅ Cleanup complete');
  }
}
```

### Task 3: Create Playwright Fixture
**File:** `apps/e2e/fixtures/data-factory.fixture.ts`

```typescript
import { test as base } from '@playwright/test';
import { DataFactory } from '../helpers/data-factory';

export const test = base.extend<{ dataFactory: DataFactory }>({
  dataFactory: async ({}, use) => {
    const factory = new DataFactory();
    
    // Use the factory in the test
    await use(factory);
    
    // Cleanup after test completes
    await factory.cleanup();
  },
});

export { expect } from '@playwright/test';
```

### Task 4: Create Combined Fixtures Export
**File:** `apps/e2e/fixtures/index.ts`

```typescript
import { test as base, expect } from '@playwright/test';
import { DataFactory } from '../helpers/data-factory';
import { 
  simulatePayment, 
  createTestPaymentIntent,
  cancelPaymentIntent,
  capturePaymentIntent,
} from '../helpers/payment.helper';
import { 
  simulateWebhook,
  mockPaymentIntentAuthorized,
} from '../helpers/webhook.helper';
import { TEST_CARDS, getTestCardDetails } from '../helpers/test-cards';

// Combined fixture type
export interface TestFixtures {
  dataFactory: DataFactory;
  payment: {
    testCards: typeof TEST_CARDS;
    getCardDetails: typeof getTestCardDetails;
    simulatePayment: typeof simulatePayment;
    createPaymentIntent: typeof createTestPaymentIntent;
    cancelPaymentIntent: typeof cancelPaymentIntent;
    capturePaymentIntent: typeof capturePaymentIntent;
  };
  webhook: {
    simulateWebhook: typeof simulateWebhook;
    mockPaymentIntentAuthorized: typeof mockPaymentIntentAuthorized;
  };
}

// Extended test with all fixtures
export const test = base.extend<TestFixtures>({
  dataFactory: async ({}, use) => {
    const factory = new DataFactory();
    await use(factory);
    await factory.cleanup();
  },
  
  payment: async ({}, use) => {
    await use({
      testCards: TEST_CARDS,
      getCardDetails: getTestCardDetails,
      simulatePayment,
      createPaymentIntent: createTestPaymentIntent,
      cancelPaymentIntent,
      capturePaymentIntent,
    });
  },
  
  webhook: async ({}, use) => {
    await use({
      simulateWebhook,
      mockPaymentIntentAuthorized,
    });
  },
});

export { expect };
```

---

## Dependencies

### NPM Packages
- `@playwright/test` - Test framework
- `crypto` - Built-in Node.js module for UUID generation

### Environment Variables
```env
BACKEND_URL=http://localhost:9000
MEDUSA_URL=http://localhost:9000
```

---

## Definition of Done

- [ ] `generateTestId()` creates unique IDs with timestamps and UUIDs
- [ ] `generateTestEmail()` creates unique test emails
- [ ] `DataFactory.getAvailableProducts()` fetches products from store
- [ ] `DataFactory.createCart()` creates carts with items
- [ ] `DataFactory.cleanup()` removes created test resources
- [ ] Playwright fixture auto-cleans after each test
- [ ] Combined fixtures export available for all tests
- [ ] Parallel tests don't have data collisions

---

## Test Scenarios

### Scenario 1: Unique ID Generation
```typescript
test('generates unique IDs', async ({ dataFactory }) => {
  const id1 = generateTestId('order');
  const id2 = generateTestId('order');
  
  expect(id1).not.toBe(id2);
  expect(id1).toMatch(/^order_\d+_[a-f0-9]+$/);
});
```

### Scenario 2: Product Discovery
```typescript
test('fetches available products', async ({ dataFactory }) => {
  const products = await dataFactory.getAvailableProducts();
  
  expect(products.length).toBeGreaterThan(0);
  expect(products[0]).toHaveProperty('id');
  expect(products[0]).toHaveProperty('variants');
});
```

### Scenario 3: Cart Creation with Items
```typescript
test('creates cart with items', async ({ dataFactory }) => {
  const product = await dataFactory.getRandomProduct();
  const variant = product.variants[0];
  
  const cart = await dataFactory.createCart([
    { variant_id: variant.id, quantity: 2 }
  ]);
  
  expect(cart.id).toBeTruthy();
  expect(cart.items).toHaveLength(1);
  expect(cart.items[0].quantity).toBe(2);
});
```

### Scenario 4: Automatic Cleanup
```typescript
test('cleans up after test', async ({ dataFactory }) => {
  // Create some test data
  const cart = await dataFactory.createCart();
  
  // Cleanup happens automatically after test
  // Verify in next test that cart doesn't exist
});
```

### Scenario 5: Parallel Test Isolation
```typescript
test.describe.parallel('parallel tests', () => {
  test('test A creates unique data', async ({ dataFactory }) => {
    const email = generateTestEmail();
    expect(email).toContain('@test.gracestowel.com');
  });
  
  test('test B creates different unique data', async ({ dataFactory }) => {
    const email = generateTestEmail();
    expect(email).toContain('@test.gracestowel.com');
    // Different from test A's email
  });
});
```

---

## Notes

- Test IDs include timestamps for debugging and sorting
- Emails use `@test.gracestowel.com` domain for easy identification
- Cleanup runs in reverse order (LIFO) to handle dependencies
- Some resources (like customers) may need admin API for deletion
- Products are fetched dynamically - no hardcoded handles

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: `.kiro/specs/e2e-testing-overhaul/requirements.md` (FR3.2, FR3.3, FR11.3)
- Playwright Fixtures: https://playwright.dev/docs/test-fixtures
- Medusa Store API: https://docs.medusajs.com/api/store
