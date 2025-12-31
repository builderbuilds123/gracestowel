import { APIRequestContext } from '@playwright/test';
import { User, createUser } from './user-factory';
import { apiRequest } from '../helpers/api-request';

/**
 * UserFactory with auto-cleanup
 * Tracks created users and deletes them after test
 */
export class UserFactory {
  private createdUserIds: string[] = [];

  constructor(private request: APIRequestContext) {}

  async createUser(overrides: Partial<User> = {}): Promise<User> {
    const user = createUser(overrides);

    try {
      // Attempt to create via API
      const created = await apiRequest<{ customer: { id: string } }>({
        request: this.request,
        method: 'POST',
        url: '/admin/customers',
        data: user,
      });

      if (created.customer?.id) {
        this.createdUserIds.push(created.customer.id);
      }
    } catch (error) {
      // If API seeding fails, still return user data for UI tests
      console.warn("User seeding skipped; using generated data.");
    }

    return user;
  }

  async cleanup(): Promise<void> {
    // Cleanup all created users
    for (const userId of this.createdUserIds) {
      try {
        await apiRequest({
          request: this.request,
          method: 'DELETE',
          url: `/admin/customers/${userId}`,
        });
      } catch (error) {
        // Ignore cleanup errors (user may not exist or endpoint may differ)
        console.warn(`Could not cleanup user ${userId}.`);
      }
    }
    this.createdUserIds = [];
  }
}
