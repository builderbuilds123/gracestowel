---
title: Grace Stowel
description: Premium e-commerce platform for Turkish cotton towels.
last-updated: 2025-12-02
---

Grace Stowel is a premium e-commerce platform for Turkish cotton towels, built with a modern headless architecture.

## 📚 Documentation

Full documentation is available in the [docs](./docs/index.md) directory.

### Quick Links

- [System Architecture](./docs/architecture.md)
- [Environment Setup](./docs/devops/environment-setup.md)
- [Development Guide](./docs/development-guide.md)

## 🚀 Getting Started

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd gracestowel
   ```

2. **Setup Environment**

   Follow the [Environment Setup](./docs/devops/environment-setup.md) guide to configure your `.env` files and dependencies.

3. **Start Development**

   ```bash
   pnpm install
   pnpm run dev
   ```

   See the [Development Guide](./docs/development-guide.md) for detailed workflows.

## 🏗️ Tech Stack

- **Backend**: Medusa v2 (Node.js)
- **Storefront**: React Router v7 + Cloudflare Workers
- **Database**: PostgreSQL + Redis (Railway)
- **Payments**: Stripe

## 🧪 API Testing with Postman

The project includes comprehensive Postman collections for API testing and documentation.

### Collections

- **Store API** - Public storefront endpoints (products, carts, checkout)
- **Admin API** - Authenticated admin endpoints
- **Custom Endpoints** - Grace Stowel custom routes
- **Stripe Webhooks** - Webhook event simulators

### Quick Start

1. Import collections from `postman/collections/`
2. Import environments from `postman/environments/`
3. Select the **Local** environment
4. Start testing!

See the [Postman README](./postman/README.md) for detailed setup instructions.

## 📄 License

Private repository. All rights reserved.
