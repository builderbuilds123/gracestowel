# Backend Utility Scripts

This directory contains utility scripts for seeding, maintenance, and debugging the Grace's Towel backend.

## Unified Test CLI (Recommended)

Most testing and debugging tasks are now consolidated into `test-cli.ts`. This tool is secure (loads secrets from `.env`) and provides a unified interface.

### Running the CLI
From `apps/backend`:
```bash
npx ts-node src/scripts/test-cli.ts <command> [options]
```

### Available Commands

| Command | Description | Example Options |
| :--- | :--- | :--- |
| `order` | List recent orders or get details | `--id <id>`, `--limit 5`, `--status pending` |
| `payment` | Check Stripe PI and Medusa status | `--pi-id <id>`, `--order-id <id>` |
| `inventory` | Check stock levels by variant or SKU | `--variant-id <id>`, `--sku <sku>` |
| `queue` | Monitor BullMQ capture queue | `--status`, `--jobs` |
| `api` | Get publishable keys and providers | `--keys`, `--providers` |
| `token` | Generate order modification JWT | `--order-id <id>`, `--pi-id <id>` |

---

## Other Specialized Scripts

- `seed.ts`: Populates the database with initial products, regions, and settings.
- `run-payment-worker.ts`: Manually starts the BullMQ worker for payment capture.
- `fix-product-prices.ts`: Maintenance script for updating variant pricing.
- `test-storage.ts`: Verifies Cloudflare R2 / S3 storage connectivity.

## Development Guidelines

1. **Security**: Never hardcode credentials. Always use `dotenv` to load from `.env`.
2. **Container**: Use `medusa exec` if you need the full Medusa dependency container. Use `ts-node` for lightweight scripts that only need DB/SDK access.
3. **Consolidation**: Prefer adding new debugging subcommands to `test-cli.ts` rather than creating new standalone files.