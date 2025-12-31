import { APIRequestContext } from '@playwright/test';
import { Order, createOrder } from './order-factory';
import { apiRequest } from '../helpers/api-request';

export class OrderFactory {
  private createdOrderIds: string[] = [];

  constructor(private request: APIRequestContext) {}

  async createOrder(overrides: Partial<Order> = {}): Promise<Order> {
    const order = createOrder(overrides);
    // Creating an order typically requires a cart + payment + completion flow.
    // This might be complex to seed directly via one API call.
    // Ideally we use a "seed" helper or just return the object for mocking.

    // For now, we return the object. Real seeding might need a specialized helper
    // that creates cart -> payment -> complete order.
    return order;
  }

  async cleanup(): Promise<void> {
    // Orders are hard to delete in some systems, usually archived.
  }
}
