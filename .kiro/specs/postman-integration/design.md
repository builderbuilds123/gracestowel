# Design Document: Postman Integration

## Overview

This design document outlines the architecture and implementation approach for integrating Postman into the Grace Stowel e-commerce platform development workflow. The integration provides organized API collections, environment management, request chaining for complex flows, contract testing, CI/CD integration via Newman, and Stripe webhook testing capabilities.

The solution consists of:
1. **Postman Collections** - JSON files defining API requests organized by domain
2. **Environment Files** - JSON files containing environment-specific variables
3. **Newman CI Integration** - GitHub Actions workflow for automated API testing
4. **Stripe Webhook Simulator** - Pre-request scripts for generating valid webhook signatures

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        POSTMAN INTEGRATION ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         POSTMAN COLLECTIONS                           │   │
│  ├──────────────────────────────────────────────────────────────────────┤   │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  Store API  │  │  Admin API  │  │   Custom    │  │   Stripe    │  │   │
│  │  │ Collection  │  │ Collection  │  │  Endpoints  │  │  Webhooks   │  │   │
│  │  ├─────────────┤  ├─────────────┤  ├─────────────┤  ├─────────────┤  │   │
│  │  │ • Products  │  │ • Products  │  │ • Health    │  │ • payment_  │  │   │
│  │  │ • Carts     │  │ • Orders    │  │ • Store     │  │   intent.   │  │   │
│  │  │ • Checkout  │  │ • Customers │  │   Custom    │  │   succeeded │  │   │
│  │  │ • Regions   │  │ • Users     │  │ • Admin     │  │ • checkout. │  │   │
│  │  │ • Collect.  │  │             │  │   Custom    │  │   completed │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          ENVIRONMENTS                                 │   │
│  ├──────────────────────────────────────────────────────────────────────┤   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │    Local    │  │   Staging   │  │ Production  │                   │   │
│  │  ├─────────────┤  ├─────────────┤  ├─────────────┤                   │   │
│  │  │ localhost:  │  │ Railway     │  │ Railway     │                   │   │
│  │  │ 9000        │  │ Staging URL │  │ Prod URL    │                   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         CI/CD INTEGRATION                             │   │
│  ├──────────────────────────────────────────────────────────────────────┤   │
│  │                                                                       │   │
│  │  GitHub Actions ──► Newman ──► Contract Tests ──► HTML Report        │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Collection Files

Location: `postman/collections/`

| File | Purpose |
|------|---------|
| `store-api.postman_collection.json` | Medusa Store API requests |
| `admin-api.postman_collection.json` | Medusa Admin API requests |
| `custom-endpoints.postman_collection.json` | Grace Stowel custom routes |
| `stripe-webhooks.postman_collection.json` | Stripe webhook simulators |

### 2. Environment Files

Location: `postman/environments/`

| File | Purpose |
|------|---------|
| `local.postman_environment.json` | Local development variables |
| `staging.postman_environment.json` | Railway staging variables |
| `production.postman_environment.json` | Railway production variables |

### 3. Newman CI Workflow

Location: `.github/workflows/api-contract-tests.yml`

Triggers on pull requests to run contract tests against the staging environment.

### 4. Stripe Signature Generator

Embedded in webhook collection pre-request scripts using CryptoJS for HMAC-SHA256 signature generation.

## Data Models

### Collection Structure (Postman Collection v2.1)

```typescript
interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
  };
  item: (PostmanFolder | PostmanRequest)[];
  variable?: PostmanVariable[];
}

interface PostmanFolder {
  name: string;
  description?: string;
  item: PostmanRequest[];
}

interface PostmanRequest {
  name: string;
  description?: string;
  request: {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    header: PostmanHeader[];
    url: PostmanUrl;
    body?: PostmanBody;
  };
  response?: PostmanExampleResponse[];
  event?: PostmanEvent[];
}

interface PostmanEvent {
  listen: "prerequest" | "test";
  script: {
    type: "text/javascript";
    exec: string[];
  };
}

interface PostmanVariable {
  key: string;
  value: string;
  type?: "string" | "secret";
}
```

### Environment Structure

```typescript
interface PostmanEnvironment {
  name: string;
  values: EnvironmentVariable[];
}

interface EnvironmentVariable {
  key: string;
  value: string;
  type: "default" | "secret";
  enabled: boolean;
}
```

### Required Environment Variables

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `base_url` | `http://localhost:9000` | Railway staging URL | Railway prod URL |
| `storefront_url` | `http://localhost:5173` | Cloudflare staging URL | Cloudflare prod URL |
| `jwt_token` | (empty) | (from secrets) | (from secrets) |
| `stripe_webhook_secret` | `whsec_...` | (from secrets) | (from secrets) |
| `cart_id` | (dynamic) | (dynamic) | (dynamic) |
| `client_secret` | (dynamic) | (dynamic) | (dynamic) |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Collection Structure Validity

*For any* Postman collection file in the `postman/collections/` directory, the JSON structure SHALL conform to the Postman Collection v2.1 schema and contain the required folders as specified in the requirements.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

### Property 2: Request Documentation Completeness

*For any* request in any collection, the request object SHALL contain a non-empty `description` field and at least one example response in the `response` array.

**Validates: Requirements 1.5, 7.3**

### Property 3: Authentication Variable Usage

*For any* request in the Admin API collection, the request headers SHALL include an `Authorization` header that references the `{{jwt_token}}` environment variable.

**Validates: Requirements 2.5**

### Property 4: Variable Chaining in Checkout Flow

*For any* request in the "Complete Checkout Flow" folder that creates a resource (cart, payment intent), the test script SHALL contain code that stores the resource identifier in a collection variable using `pm.collectionVariables.set()`.

**Validates: Requirements 3.2, 3.3**

### Property 5: Contract Test Schema Presence

*For any* request with contract tests, the test script SHALL contain a JSON schema definition and a call to `tv4.validate()` or `pm.expect().to.have.jsonSchema()` for response validation.

**Validates: Requirements 4.1**

### Property 6: Webhook Signature Generation

*For any* request in the Stripe Webhooks collection, the pre-request script SHALL generate a valid `Stripe-Signature` header using HMAC-SHA256 with the webhook secret and include the timestamp and signature in the correct format (`t=timestamp,v1=signature`).

**Validates: Requirements 6.1, 6.2**

## Error Handling

### Collection Import Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| Invalid JSON | Malformed collection file | Validate JSON syntax before commit |
| Schema mismatch | Wrong Postman schema version | Use v2.1.0 schema consistently |
| Missing variables | Environment not selected | Prompt user to select environment |

### Newman CI Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| Connection refused | Backend not running | Ensure staging is deployed before PR |
| 401 Unauthorized | Invalid/expired JWT | Refresh token in GitHub Secrets |
| Timeout | Slow response | Increase Newman timeout setting |

### Webhook Signature Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| Invalid signature | Wrong webhook secret | Update `stripe_webhook_secret` variable |
| Timestamp too old | Clock skew | Use current timestamp in pre-request script |

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests (for collection validation) and integration tests (for Newman CI workflow).

#### Unit Tests (Vitest)

Test the structure and content of Postman collection/environment JSON files:

- Validate collection schema compliance
- Verify required folders exist
- Check all requests have descriptions
- Validate environment variables are defined

#### Property-Based Tests (fast-check)

Use property-based testing to verify correctness properties across all collections:

- Generate variations of collection structures
- Verify schema validation catches invalid structures
- Test that all requests in a collection satisfy documentation requirements

**Property-Based Testing Library**: `fast-check` (TypeScript)

**Minimum iterations**: 100

#### Integration Tests

- Run Newman against a test collection to verify CI workflow
- Test Stripe webhook signature generation against known test vectors

### Test File Locations

| Test Type | Location |
|-----------|----------|
| Collection validation | `postman/__tests__/collections.test.ts` |
| Environment validation | `postman/__tests__/environments.test.ts` |
| Webhook signature | `postman/__tests__/stripe-signature.test.ts` |
| Newman CI | `.github/workflows/api-contract-tests.yml` (self-testing) |

