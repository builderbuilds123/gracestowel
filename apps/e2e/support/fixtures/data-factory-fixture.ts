import { test as base } from "@playwright/test";
import { CartFactory } from "../factories/cart-factory-class";
import { DiscountFactory } from "../factories/discount-factory-class";
import { OrderFactory } from "../factories/order-factory-class";
import { PaymentFactory } from "../factories/payment-factory-class";
import { ProductFactory } from "../factories/product-factory-class";
import { ShippingFactory } from "../factories/shipping-factory-class";
import { UserFactory } from "../factories/user-factory-class";

/**
 * Data Factory Fixture
 * Provides factories with auto-cleanup for test data
 */
type DataFactoryFixture = {
  userFactory: UserFactory;
  productFactory: ProductFactory;
  cartFactory: CartFactory;
  orderFactory: OrderFactory;
  discountFactory: DiscountFactory;
  shippingFactory: ShippingFactory;
  paymentFactory: PaymentFactory;
};

export const test = base.extend<DataFactoryFixture>({
  userFactory: async ({ request }, use) => {
    const factory = new UserFactory(request);
    await use(factory);
    await factory.cleanup(); // Auto-cleanup after test
  },

  productFactory: async ({ request }, use) => {
    const factory = new ProductFactory(request);
    await use(factory);
    await factory.cleanup(); // Auto-cleanup after test
  },

  cartFactory: async ({ request }, use) => {
    const factory = new CartFactory(request);
    await use(factory);
    await factory.cleanup();
  },

  orderFactory: async ({ request }, use) => {
    const factory = new OrderFactory(request);
    await use(factory);
    await factory.cleanup();
  },

  discountFactory: async ({ request }, use) => {
    const factory = new DiscountFactory(request);
    await use(factory);
    await factory.cleanup();
  },

  shippingFactory: async ({ request }, use) => {
    const factory = new ShippingFactory(request);
    await use(factory);
    await factory.cleanup();
  },

  paymentFactory: async ({ request }, use) => {
    const factory = new PaymentFactory(request);
    await use(factory);
    await factory.cleanup();
  },
});

export { expect } from "@playwright/test";
