/**
 * Property-Based Tests for Postman Collection Structure Validity
 * 
 * **Feature: postman-integration, Property 1: Collection Structure Validity**
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// Postman Collection v2.1 Schema Types
interface PostmanInfo {
  name: string;
  description?: string;
  schema: string;
}

interface PostmanHeader {
  key: string;
  value: string;
  type?: string;
}

interface PostmanUrl {
  raw: string;
  host?: string[];
  path?: string[];
  query?: Array<{ key: string; value: string }>;
}

interface PostmanBody {
  mode: 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql';
  raw?: string;
  urlencoded?: Array<{ key: string; value: string }>;
  formdata?: Array<{ key: string; value: string }>;
}

interface PostmanRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  header?: PostmanHeader[];
  url: PostmanUrl | string;
  body?: PostmanBody;
}

interface PostmanEvent {
  listen: 'prerequest' | 'test';
  script: {
    type: string;
    exec: string[];
  };
}

interface PostmanItem {
  name: string;
  description?: string;
  request?: PostmanRequest;
  response?: unknown[];
  event?: PostmanEvent[];
  item?: PostmanItem[];
}

interface PostmanVariable {
  key: string;
  value: string;
  type?: 'string' | 'secret';
}

interface PostmanCollection {
  info: PostmanInfo;
  item: PostmanItem[];
  variable?: PostmanVariable[];
  event?: PostmanEvent[];
}

// Validation functions
const POSTMAN_SCHEMA_V2_1 = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

function isValidPostmanCollection(obj: unknown): obj is PostmanCollection {
  if (typeof obj !== 'object' || obj === null) return false;
  
  const collection = obj as Record<string, unknown>;
  
  // Check info object
  if (typeof collection.info !== 'object' || collection.info === null) return false;
  const info = collection.info as Record<string, unknown>;
  if (typeof info.name !== 'string' || info.name.length === 0) return false;
  if (typeof info.schema !== 'string') return false;
  
  // Check item array
  if (!Array.isArray(collection.item)) return false;
  
  return true;
}

function hasCorrectSchema(collection: PostmanCollection): boolean {
  return collection.info.schema === POSTMAN_SCHEMA_V2_1;
}

function isValidItem(item: PostmanItem): boolean {
  // Must have a name
  if (typeof item.name !== 'string' || item.name.length === 0) return false;
  
  // If it's a folder (has nested items), validate children
  if (item.item && Array.isArray(item.item)) {
    return item.item.every(isValidItem);
  }
  
  // If it's a request, must have request object
  if (item.request) {
    const req = item.request;
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return false;
    if (!req.url) return false;
  }
  
  return true;
}

function validateCollectionStructure(collection: PostmanCollection): boolean {
  return collection.item.every(isValidItem);
}

// Arbitraries for generating valid Postman structures
const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH') as fc.Arbitrary<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>;

const postmanUrlArb: fc.Arbitrary<PostmanUrl> = fc.record({
  raw: fc.webUrl(),
  host: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 3 }),
  path: fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 5 }),
});

const postmanHeaderArb: fc.Arbitrary<PostmanHeader> = fc.record({
  key: fc.string({ minLength: 1 }),
  value: fc.string(),
  type: fc.constant('text'),
});

const postmanRequestArb: fc.Arbitrary<PostmanRequest> = fc.record({
  method: httpMethodArb,
  header: fc.array(postmanHeaderArb, { minLength: 0, maxLength: 3 }),
  url: postmanUrlArb,
});

const postmanRequestItemArb: fc.Arbitrary<PostmanItem> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  request: postmanRequestArb,
  response: fc.constant([]),
});

const postmanFolderArb: fc.Arbitrary<PostmanItem> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  item: fc.array(postmanRequestItemArb, { minLength: 1, maxLength: 5 }),
});

const postmanInfoArb: fc.Arbitrary<PostmanInfo> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
  schema: fc.constant(POSTMAN_SCHEMA_V2_1),
});

const postmanCollectionArb: fc.Arbitrary<PostmanCollection> = fc.record({
  info: postmanInfoArb,
  item: fc.array(postmanFolderArb, { minLength: 1, maxLength: 5 }),
  variable: fc.option(
    fc.array(
      fc.record({
        key: fc.string({ minLength: 1 }),
        value: fc.string(),
      }),
      { minLength: 0, maxLength: 5 }
    ),
    { nil: undefined }
  ),
});

describe('Property 1: Collection Structure Validity', () => {
  /**
   * **Feature: postman-integration, Property 1: Collection Structure Validity**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
   * 
   * For any Postman collection file in the postman/collections/ directory,
   * the JSON structure SHALL conform to the Postman Collection v2.1 schema
   * and contain the required folders as specified in the requirements.
   */
  
  it('should validate that any generated collection conforms to Postman v2.1 schema', () => {
    fc.assert(
      fc.property(postmanCollectionArb, (collection) => {
        // Property: Any valid collection must pass schema validation
        expect(isValidPostmanCollection(collection)).toBe(true);
        expect(hasCorrectSchema(collection)).toBe(true);
        expect(validateCollectionStructure(collection)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject collections with invalid schema version', () => {
    fc.assert(
      fc.property(
        postmanCollectionArb,
        fc.string({ minLength: 1 }).filter(s => s !== POSTMAN_SCHEMA_V2_1),
        (collection, invalidSchema) => {
          const invalidCollection = {
            ...collection,
            info: { ...collection.info, schema: invalidSchema },
          };
          // Property: Collections with wrong schema should fail validation
          expect(hasCorrectSchema(invalidCollection as PostmanCollection)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject collections with empty name', () => {
    fc.assert(
      fc.property(postmanCollectionArb, (collection) => {
        const invalidCollection = {
          ...collection,
          info: { ...collection.info, name: '' },
        };
        // Property: Collections with empty name should fail validation
        expect(isValidPostmanCollection(invalidCollection)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject collections with missing item array', () => {
    fc.assert(
      fc.property(postmanCollectionArb, (collection) => {
        const invalidCollection = {
          info: collection.info,
          // Missing item array
        };
        // Property: Collections without item array should fail validation
        expect(isValidPostmanCollection(invalidCollection)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should validate nested folder structures', () => {
    fc.assert(
      fc.property(postmanCollectionArb, (collection) => {
        // Property: All items in collection must be valid
        const allItemsValid = collection.item.every(item => {
          if (item.item) {
            // It's a folder - check nested items
            return item.item.every(nestedItem => 
              typeof nestedItem.name === 'string' && nestedItem.name.length > 0
            );
          }
          return typeof item.name === 'string' && item.name.length > 0;
        });
        expect(allItemsValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should validate request items have required fields', () => {
    fc.assert(
      fc.property(postmanRequestItemArb, (requestItem) => {
        // Property: Request items must have name and valid request
        expect(requestItem.name.length).toBeGreaterThan(0);
        expect(requestItem.request).toBeDefined();
        expect(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).toContain(requestItem.request?.method);
        expect(requestItem.request?.url).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });
});

describe('Collection File Validation (Integration)', () => {
  const collectionsDir = path.join(__dirname, '..', 'collections');

  it('should validate all existing collection files conform to schema', () => {
    // Skip if no collection files exist yet
    if (!fs.existsSync(collectionsDir)) {
      return;
    }

    const files = fs.readdirSync(collectionsDir)
      .filter(f => f.endsWith('.postman_collection.json'));

    for (const file of files) {
      const filePath = path.join(collectionsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const collection = JSON.parse(content);

      expect(isValidPostmanCollection(collection)).toBe(true);
      expect(hasCorrectSchema(collection)).toBe(true);
      expect(validateCollectionStructure(collection)).toBe(true);
    }
  });
});

/**
 * Property 2: Request Documentation Completeness
 * 
 * **Feature: postman-integration, Property 2: Request Documentation Completeness**
 * **Validates: Requirements 1.5, 7.3**
 * 
 * For any request in any collection, the request object SHALL contain a non-empty
 * description field and at least one example response in the response array.
 */

// Helper function to check if a request item has complete documentation
function hasCompleteDocumentation(item: PostmanItem): boolean {
  // If it's a folder, check all nested items
  if (item.item && Array.isArray(item.item)) {
    return item.item.every(hasCompleteDocumentation);
  }
  
  // If it's a request item, check documentation requirements
  if (item.request) {
    // Must have a non-empty description
    if (typeof item.description !== 'string' || item.description.trim().length === 0) {
      return false;
    }
    
    // Must have at least one example response
    if (!Array.isArray(item.response) || item.response.length === 0) {
      return false;
    }
    
    return true;
  }
  
  // Non-request items (folders without nested items) are valid
  return true;
}

// Helper to extract all request items from a collection (flattened)
function extractAllRequests(items: PostmanItem[]): PostmanItem[] {
  const requests: PostmanItem[] = [];
  
  for (const item of items) {
    if (item.item && Array.isArray(item.item)) {
      // It's a folder - recurse
      requests.push(...extractAllRequests(item.item));
    } else if (item.request) {
      // It's a request
      requests.push(item);
    }
  }
  
  return requests;
}

// Arbitrary for generating well-documented request items
const documentedRequestItemArb: fc.Arbitrary<PostmanItem> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ minLength: 10, maxLength: 200 }), // Non-empty description
  request: postmanRequestArb,
  response: fc.array(
    fc.record({
      name: fc.string({ minLength: 1 }),
      status: fc.constantFrom('OK', 'Created', 'Bad Request', 'Not Found'),
      code: fc.constantFrom(200, 201, 400, 404),
      body: fc.string(),
    }),
    { minLength: 1, maxLength: 3 } // At least one response
  ),
});

// Arbitrary for generating undocumented request items (missing description or response)
const undocumentedRequestItemArb: fc.Arbitrary<PostmanItem> = fc.oneof(
  // Missing description
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    request: postmanRequestArb,
    response: fc.array(
      fc.record({
        name: fc.string({ minLength: 1 }),
        status: fc.constant('OK'),
        code: fc.constant(200),
        body: fc.string(),
      }),
      { minLength: 1, maxLength: 2 }
    ),
  }),
  // Empty description
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.constant(''),
    request: postmanRequestArb,
    response: fc.array(
      fc.record({
        name: fc.string({ minLength: 1 }),
        status: fc.constant('OK'),
        code: fc.constant(200),
        body: fc.string(),
      }),
      { minLength: 1, maxLength: 2 }
    ),
  }),
  // Missing response array
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 10, maxLength: 200 }),
    request: postmanRequestArb,
  }),
  // Empty response array
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 10, maxLength: 200 }),
    request: postmanRequestArb,
    response: fc.constant([]),
  })
);

describe('Property 2: Request Documentation Completeness', () => {
  /**
   * **Feature: postman-integration, Property 2: Request Documentation Completeness**
   * **Validates: Requirements 1.5, 7.3**
   */

  it('should validate that well-documented requests pass documentation check', () => {
    fc.assert(
      fc.property(documentedRequestItemArb, (requestItem) => {
        // Property: Any request with description and responses should pass
        expect(hasCompleteDocumentation(requestItem)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject requests missing description or responses', () => {
    fc.assert(
      fc.property(undocumentedRequestItemArb, (requestItem) => {
        // Property: Requests without proper documentation should fail
        expect(hasCompleteDocumentation(requestItem)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should validate documentation completeness for nested folder structures', () => {
    // Generate a folder with documented requests
    const documentedFolderArb = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }),
      description: fc.string({ minLength: 1, maxLength: 200 }),
      item: fc.array(documentedRequestItemArb, { minLength: 1, maxLength: 5 }),
    });

    fc.assert(
      fc.property(documentedFolderArb, (folder) => {
        // Property: Folders with all documented requests should pass
        expect(hasCompleteDocumentation(folder)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject folders containing any undocumented requests', () => {
    // Generate a folder with at least one undocumented request
    const mixedFolderArb = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }),
      description: fc.string({ minLength: 1, maxLength: 200 }),
      item: fc.tuple(
        documentedRequestItemArb,
        undocumentedRequestItemArb
      ).map(([doc, undoc]) => [doc, undoc]),
    });

    fc.assert(
      fc.property(mixedFolderArb, (folder) => {
        // Property: Folders with any undocumented request should fail
        expect(hasCompleteDocumentation(folder)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 2: Request Documentation Completeness (Integration)', () => {
  const collectionsDir = path.join(__dirname, '..', 'collections');

  it('should validate all requests in existing collections have complete documentation', () => {
    // Skip if no collection files exist yet
    if (!fs.existsSync(collectionsDir)) {
      return;
    }

    const files = fs.readdirSync(collectionsDir)
      .filter(f => f.endsWith('.postman_collection.json'));

    for (const file of files) {
      const filePath = path.join(collectionsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const collection = JSON.parse(content) as PostmanCollection;

      const allRequests = extractAllRequests(collection.item);
      
      for (const request of allRequests) {
        // Each request must have documentation
        expect(
          hasCompleteDocumentation(request),
          `Request "${request.name}" in ${file} is missing documentation (description or example responses)`
        ).toBe(true);
      }
    }
  });
});

/**
 * Property 3: Authentication Variable Usage
 * 
 * **Feature: postman-integration, Property 3: Authentication Variable Usage**
 * **Validates: Requirements 2.5**
 * 
 * For any request in the Admin API collection, the request headers SHALL include
 * an Authorization header that references the {{jwt_token}} environment variable.
 */

// Types for collection-level auth
interface PostmanBearerAuth {
  type: 'bearer';
  bearer: Array<{
    key: string;
    value: string;
    type?: string;
  }>;
}

interface PostmanCollectionWithAuth extends PostmanCollection {
  auth?: PostmanBearerAuth;
}

// Helper function to check if a collection has proper bearer auth setup
function hasCollectionLevelBearerAuth(collection: PostmanCollectionWithAuth): boolean {
  if (!collection.auth) return false;
  if (collection.auth.type !== 'bearer') return false;
  if (!Array.isArray(collection.auth.bearer)) return false;
  
  // Check for jwt_token variable reference
  const tokenConfig = collection.auth.bearer.find(b => b.key === 'token');
  if (!tokenConfig) return false;
  
  // Must reference {{jwt_token}} variable
  return tokenConfig.value === '{{jwt_token}}';
}

// Helper function to check if a request has Authorization header with jwt_token
function hasAuthorizationHeader(item: PostmanItem): boolean {
  // If it's a folder, check all nested items
  if (item.item && Array.isArray(item.item)) {
    return item.item.every(hasAuthorizationHeader);
  }
  
  // If it's a request item, check for Authorization header
  if (item.request && item.request.header) {
    const authHeader = item.request.header.find(
      h => h.key.toLowerCase() === 'authorization'
    );
    if (authHeader) {
      // Check if it references jwt_token
      return authHeader.value.includes('{{jwt_token}}');
    }
  }
  
  // Requests without explicit auth header are valid if collection-level auth is set
  return true;
}

// Helper to check if collection is an Admin API collection (requires auth)
function isAdminApiCollection(collection: PostmanCollection): boolean {
  return collection.info.name.toLowerCase().includes('admin');
}

// Arbitrary for generating Admin API collection with proper auth
const adminCollectionAuthArb: fc.Arbitrary<PostmanCollectionWithAuth> = fc.record({
  info: fc.record({
    name: fc.constant('Admin API'),
    description: fc.string({ minLength: 10, maxLength: 500 }),
    schema: fc.constant(POSTMAN_SCHEMA_V2_1),
  }),
  auth: fc.constant({
    type: 'bearer' as const,
    bearer: [
      {
        key: 'token',
        value: '{{jwt_token}}',
        type: 'string',
      },
    ],
  }),
  item: fc.array(postmanFolderArb, { minLength: 1, maxLength: 5 }),
  variable: fc.constant([
    { key: 'base_url', value: 'http://localhost:9000' },
    { key: 'jwt_token', value: '' },
  ]),
});

// Arbitrary for generating Admin API collection WITHOUT proper auth (invalid)
const adminCollectionNoAuthArb: fc.Arbitrary<PostmanCollectionWithAuth> = fc.oneof(
  // Missing auth entirely
  fc.record({
    info: fc.record({
      name: fc.constant('Admin API'),
      description: fc.string({ minLength: 10, maxLength: 500 }),
      schema: fc.constant(POSTMAN_SCHEMA_V2_1),
    }),
    item: fc.array(postmanFolderArb, { minLength: 1, maxLength: 5 }),
  }),
  // Wrong auth type
  fc.record({
    info: fc.record({
      name: fc.constant('Admin API'),
      description: fc.string({ minLength: 10, maxLength: 500 }),
      schema: fc.constant(POSTMAN_SCHEMA_V2_1),
    }),
    auth: fc.constant({
      type: 'basic' as unknown as 'bearer',
      bearer: [],
    }),
    item: fc.array(postmanFolderArb, { minLength: 1, maxLength: 5 }),
  }),
  // Missing jwt_token reference
  fc.record({
    info: fc.record({
      name: fc.constant('Admin API'),
      description: fc.string({ minLength: 10, maxLength: 500 }),
      schema: fc.constant(POSTMAN_SCHEMA_V2_1),
    }),
    auth: fc.constant({
      type: 'bearer' as const,
      bearer: [
        {
          key: 'token',
          value: 'hardcoded-token', // Not using variable
          type: 'string',
        },
      ],
    }),
    item: fc.array(postmanFolderArb, { minLength: 1, maxLength: 5 }),
  })
);

describe('Property 3: Authentication Variable Usage', () => {
  /**
   * **Feature: postman-integration, Property 3: Authentication Variable Usage**
   * **Validates: Requirements 2.5**
   */

  it('should validate that Admin API collections with proper bearer auth pass validation', () => {
    fc.assert(
      fc.property(adminCollectionAuthArb, (collection) => {
        // Property: Admin collections with proper jwt_token auth should pass
        expect(hasCollectionLevelBearerAuth(collection)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject Admin API collections without proper authentication setup', () => {
    fc.assert(
      fc.property(adminCollectionNoAuthArb, (collection) => {
        // Property: Admin collections without proper auth should fail
        expect(hasCollectionLevelBearerAuth(collection)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should validate bearer auth references jwt_token variable specifically', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s !== '{{jwt_token}}'),
        (invalidToken) => {
          const collection: PostmanCollectionWithAuth = {
            info: {
              name: 'Admin API',
              description: 'Test collection',
              schema: POSTMAN_SCHEMA_V2_1,
            },
            auth: {
              type: 'bearer',
              bearer: [
                {
                  key: 'token',
                  value: invalidToken,
                  type: 'string',
                },
              ],
            },
            item: [],
          };
          // Property: Auth with non-jwt_token value should fail
          expect(hasCollectionLevelBearerAuth(collection)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate that all requests in authenticated collections inherit auth', () => {
    fc.assert(
      fc.property(adminCollectionAuthArb, (collection) => {
        // Property: All requests should be valid when collection-level auth is set
        const allRequestsValid = collection.item.every(hasAuthorizationHeader);
        expect(allRequestsValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 3: Authentication Variable Usage (Integration)', () => {
  const collectionsDir = path.join(__dirname, '..', 'collections');

  it('should validate Admin API collection has proper authentication setup', () => {
    const adminApiPath = path.join(collectionsDir, 'admin-api.postman_collection.json');
    
    // Skip if admin-api collection doesn't exist yet
    if (!fs.existsSync(adminApiPath)) {
      return;
    }

    const content = fs.readFileSync(adminApiPath, 'utf-8');
    const collection = JSON.parse(content) as PostmanCollectionWithAuth;

    // Admin API must have collection-level bearer auth with jwt_token
    expect(
      hasCollectionLevelBearerAuth(collection),
      'Admin API collection must have bearer auth with {{jwt_token}} variable'
    ).toBe(true);
  });

  it('should validate all admin collections use jwt_token for authentication', () => {
    // Skip if no collection files exist yet
    if (!fs.existsSync(collectionsDir)) {
      return;
    }

    const files = fs.readdirSync(collectionsDir)
      .filter(f => f.endsWith('.postman_collection.json'));

    for (const file of files) {
      const filePath = path.join(collectionsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const collection = JSON.parse(content) as PostmanCollectionWithAuth;

      // Only check admin collections
      if (isAdminApiCollection(collection)) {
        expect(
          hasCollectionLevelBearerAuth(collection),
          `Admin collection "${file}" must have bearer auth with {{jwt_token}} variable`
        ).toBe(true);
      }
    }
  });
});


/**
 * Property 4: Variable Chaining in Checkout Flow
 * 
 * **Feature: postman-integration, Property 4: Variable Chaining in Checkout Flow**
 * **Validates: Requirements 3.2, 3.3**
 * 
 * For any request in the "Complete Checkout Flow" folder that creates a resource
 * (cart, payment intent), the test script SHALL contain code that stores the
 * resource identifier in a collection variable using pm.collectionVariables.set().
 */

// Helper function to check if a test script stores a variable
function storesCollectionVariable(scriptExec: string[], variableName: string): boolean {
  const scriptContent = scriptExec.join('\n');
  // Check for pm.collectionVariables.set('variableName', ...)
  const setPattern = new RegExp(`pm\\.collectionVariables\\.set\\s*\\(\\s*['"]${variableName}['"]`);
  return setPattern.test(scriptContent);
}

// Helper function to check if a request has test script that stores required variables
function hasVariableChainingScript(item: PostmanItem, requiredVariables: string[]): boolean {
  // If it's a folder, check all nested items
  if (item.item && Array.isArray(item.item)) {
    // For checkout flow folder, we need to check specific requests
    return true; // Folders themselves don't need scripts
  }
  
  // If it's a request item with test events
  if (item.request && item.event) {
    const testEvent = item.event.find(e => e.listen === 'test');
    if (testEvent && testEvent.script && testEvent.script.exec) {
      // Check if any of the required variables are stored
      return requiredVariables.some(varName => 
        storesCollectionVariable(testEvent.script.exec, varName)
      );
    }
  }
  
  return false;
}

// Helper to find checkout flow folder in a collection
function findCheckoutFlowFolder(items: PostmanItem[]): PostmanItem | null {
  for (const item of items) {
    // Check if this is the checkout flow folder
    if (item.name && item.name.toLowerCase().includes('checkout') && item.item) {
      // Look for "Complete Checkout Flow" subfolder
      const completeFlow = item.item.find(
        subItem => subItem.name && subItem.name.toLowerCase().includes('complete checkout flow')
      );
      if (completeFlow) return completeFlow;
      // Or return the checkout folder itself if it has the flow
      if (item.item.some(subItem => subItem.request)) {
        return item;
      }
    }
    // Recurse into folders
    if (item.item) {
      const found = findCheckoutFlowFolder(item.item);
      if (found) return found;
    }
  }
  return null;
}

// Helper to extract requests that create resources (cart, payment)
function getResourceCreationRequests(checkoutFolder: PostmanItem): PostmanItem[] {
  if (!checkoutFolder.item) return [];
  
  return checkoutFolder.item.filter(item => {
    if (!item.request) return false;
    const name = item.name.toLowerCase();
    // Requests that create resources that need to be chained
    return (
      name.includes('create cart') ||
      name.includes('payment') ||
      (item.request.method === 'POST' && 
       (name.includes('cart') || name.includes('payment')))
    );
  });
}

// Arbitrary for generating checkout flow request with proper variable chaining
const checkoutRequestWithChainingArb: fc.Arbitrary<PostmanItem> = fc.record({
  name: fc.constantFrom('1. Create Cart', '4. Create Payment Sessions'),
  description: fc.string({ minLength: 10, maxLength: 200 }),
  request: fc.record({
    method: fc.constant('POST' as const),
    header: fc.array(postmanHeaderArb, { minLength: 0, maxLength: 3 }),
    url: postmanUrlArb,
  }),
  response: fc.array(
    fc.record({
      name: fc.string({ minLength: 1 }),
      status: fc.constant('OK'),
      code: fc.constant(200),
      body: fc.string(),
    }),
    { minLength: 1, maxLength: 2 }
  ),
  event: fc.constant([
    {
      listen: 'test' as const,
      script: {
        type: 'text/javascript',
        exec: [
          "pm.test('Resource created successfully', function () {",
          "    pm.response.to.have.status(200);",
          "});",
          "",
          "pm.test('Store resource ID', function () {",
          "    const response = pm.response.json();",
          "    if (response.cart && response.cart.id) {",
          "        pm.collectionVariables.set('cart_id', response.cart.id);",
          "    }",
          "    if (response.cart && response.cart.payment_session) {",
          "        const data = response.cart.payment_session.data;",
          "        if (data && data.client_secret) {",
          "            pm.collectionVariables.set('client_secret', data.client_secret);",
          "        }",
          "    }",
          "});"
        ],
      },
    },
  ]),
});

// Arbitrary for generating checkout flow request WITHOUT variable chaining (invalid)
const checkoutRequestWithoutChainingArb: fc.Arbitrary<PostmanItem> = fc.oneof(
  // Missing event entirely
  fc.record({
    name: fc.constantFrom('1. Create Cart', '4. Create Payment Sessions'),
    description: fc.string({ minLength: 10, maxLength: 200 }),
    request: fc.record({
      method: fc.constant('POST' as const),
      header: fc.array(postmanHeaderArb, { minLength: 0, maxLength: 3 }),
      url: postmanUrlArb,
    }),
    response: fc.array(
      fc.record({
        name: fc.string({ minLength: 1 }),
        status: fc.constant('OK'),
        code: fc.constant(200),
        body: fc.string(),
      }),
      { minLength: 1, maxLength: 2 }
    ),
  }),
  // Has test event but no variable storage
  fc.record({
    name: fc.constantFrom('1. Create Cart', '4. Create Payment Sessions'),
    description: fc.string({ minLength: 10, maxLength: 200 }),
    request: fc.record({
      method: fc.constant('POST' as const),
      header: fc.array(postmanHeaderArb, { minLength: 0, maxLength: 3 }),
      url: postmanUrlArb,
    }),
    response: fc.array(
      fc.record({
        name: fc.string({ minLength: 1 }),
        status: fc.constant('OK'),
        code: fc.constant(200),
        body: fc.string(),
      }),
      { minLength: 1, maxLength: 2 }
    ),
    event: fc.constant([
      {
        listen: 'test' as const,
        script: {
          type: 'text/javascript',
          exec: [
            "pm.test('Status is 200', function () {",
            "    pm.response.to.have.status(200);",
            "});",
            // No pm.collectionVariables.set() call
          ],
        },
      },
    ]),
  })
);

// Arbitrary for generating a complete checkout flow folder with proper chaining
const checkoutFlowFolderArb: fc.Arbitrary<PostmanItem> = fc.record({
  name: fc.constant('Complete Checkout Flow'),
  description: fc.string({ minLength: 10, maxLength: 200 }),
  item: fc.tuple(
    checkoutRequestWithChainingArb, // Create Cart with chaining
    documentedRequestItemArb, // Add Line Item (doesn't need chaining)
    documentedRequestItemArb, // Set Shipping (doesn't need chaining)
    checkoutRequestWithChainingArb, // Payment Sessions with chaining
    documentedRequestItemArb, // Complete Cart (doesn't need chaining)
  ).map(items => items),
});

describe('Property 4: Variable Chaining in Checkout Flow', () => {
  /**
   * **Feature: postman-integration, Property 4: Variable Chaining in Checkout Flow**
   * **Validates: Requirements 3.2, 3.3**
   */

  it('should validate that checkout requests with proper variable chaining pass validation', () => {
    fc.assert(
      fc.property(checkoutRequestWithChainingArb, (requestItem) => {
        // Property: Checkout requests with pm.collectionVariables.set() should pass
        const hasChaining = hasVariableChainingScript(requestItem, ['cart_id', 'client_secret']);
        expect(hasChaining).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject checkout requests without variable chaining scripts', () => {
    fc.assert(
      fc.property(checkoutRequestWithoutChainingArb, (requestItem) => {
        // Property: Checkout requests without variable storage should fail
        const hasChaining = hasVariableChainingScript(requestItem, ['cart_id', 'client_secret']);
        expect(hasChaining).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should validate cart_id is stored after cart creation', () => {
    fc.assert(
      fc.property(checkoutRequestWithChainingArb, (requestItem) => {
        if (requestItem.name.toLowerCase().includes('cart')) {
          // Property: Cart creation must store cart_id
          const testEvent = requestItem.event?.find(e => e.listen === 'test');
          if (testEvent) {
            expect(storesCollectionVariable(testEvent.script.exec, 'cart_id')).toBe(true);
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should validate client_secret is stored after payment session creation', () => {
    fc.assert(
      fc.property(checkoutRequestWithChainingArb, (requestItem) => {
        if (requestItem.name.toLowerCase().includes('payment')) {
          // Property: Payment session creation must store client_secret
          const testEvent = requestItem.event?.find(e => e.listen === 'test');
          if (testEvent) {
            expect(storesCollectionVariable(testEvent.script.exec, 'client_secret')).toBe(true);
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 4: Variable Chaining in Checkout Flow (Integration)', () => {
  const collectionsDir = path.join(__dirname, '..', 'collections');

  it('should validate Store API collection has checkout flow with proper variable chaining', () => {
    const storeApiPath = path.join(collectionsDir, 'store-api.postman_collection.json');
    
    // Skip if store-api collection doesn't exist yet
    if (!fs.existsSync(storeApiPath)) {
      return;
    }

    const content = fs.readFileSync(storeApiPath, 'utf-8');
    const collection = JSON.parse(content) as PostmanCollection;

    // Find the checkout flow folder
    const checkoutFlow = findCheckoutFlowFolder(collection.item);
    
    if (!checkoutFlow) {
      // No checkout flow folder yet - skip
      return;
    }

    // Get resource creation requests
    const resourceCreationRequests = getResourceCreationRequests(checkoutFlow);

    for (const request of resourceCreationRequests) {
      const name = request.name.toLowerCase();
      
      if (name.includes('cart') && !name.includes('complete')) {
        // Cart creation should store cart_id
        expect(
          hasVariableChainingScript(request, ['cart_id']),
          `Request "${request.name}" should store cart_id using pm.collectionVariables.set()`
        ).toBe(true);
      }
      
      if (name.includes('payment')) {
        // Payment session creation should store client_secret
        expect(
          hasVariableChainingScript(request, ['client_secret']),
          `Request "${request.name}" should store client_secret using pm.collectionVariables.set()`
        ).toBe(true);
      }
    }
  });

  it('should validate all checkout flow requests use collection variables for chaining', () => {
    const storeApiPath = path.join(collectionsDir, 'store-api.postman_collection.json');
    
    // Skip if store-api collection doesn't exist yet
    if (!fs.existsSync(storeApiPath)) {
      return;
    }

    const content = fs.readFileSync(storeApiPath, 'utf-8');
    const collection = JSON.parse(content) as PostmanCollection;

    // Find the checkout flow folder
    const checkoutFlow = findCheckoutFlowFolder(collection.item);
    
    if (!checkoutFlow || !checkoutFlow.item) {
      return;
    }

    // Check that requests after cart creation use {{cart_id}}
    const requestsUsingCartId = checkoutFlow.item.filter(item => {
      if (!item.request) return false;
      const url = typeof item.request.url === 'string' 
        ? item.request.url 
        : item.request.url.raw;
      return url.includes('{{cart_id}}');
    });

    // Should have multiple requests using cart_id (add line item, set shipping, payment, complete)
    expect(
      requestsUsingCartId.length,
      'Checkout flow should have requests that use {{cart_id}} variable'
    ).toBeGreaterThan(0);
  });
});
