# Quick Start Guide - Local Development

## Current Status
✅ All services are running!

- **Backend**: http://localhost:9000
- **Storefront**: https://localhost:5173 (HTTPS)
- **Admin Dashboard**: http://localhost:9000/app
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Starting Services

### Option 1: Using Docker Compose (Recommended)

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f storefront

# Stop all services
docker compose down

# Restart services
docker compose restart
```

### Option 2: Running Natively (Without Docker)

#### Prerequisites
- Node.js >= 24
- PostgreSQL 16+
- Redis 7+
- pnpm 9.15.2

#### Backend Setup

```bash
cd apps/backend

# Install dependencies
pnpm install

# Run migrations
npx medusa db:migrate

# Seed database (optional)
pnpm run seed

# Start backend
pnpm run dev
```

Backend will be available at:
- API: http://localhost:9000
- Admin: http://localhost:9000/app

#### Storefront Setup

```bash
cd apps/storefront

# Install dependencies
pnpm install

# Start storefront
pnpm run dev
```

Storefront will be available at:
- https://localhost:5173

## Environment Variables

### Backend (`apps/backend/.env`)
Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - JWT signing secret
- `COOKIE_SECRET` - Cookie encryption secret

### Storefront (`apps/storefront/.dev.vars`)
Required variables:
- `MEDUSA_BACKEND_URL` - Backend API URL (default: http://localhost:9000)
- `MEDUSA_PUBLISHABLE_KEY` - Medusa publishable API key

## Troubleshooting

### PostgreSQL Connection Issues
If you see "Connection ended unexpectedly" errors:
1. Check PostgreSQL is running: `docker compose ps postgres`
2. Verify credentials in `apps/backend/.env`
3. Check health: `docker compose logs postgres`

### Storefront Not Loading
- Storefront uses HTTPS by default
- Access via: https://localhost:5173 (not http://)
- Accept the self-signed certificate warning in your browser

### Port Conflicts
If ports are already in use:
- Backend (9000): Change in `docker-compose.yml` or backend config
- Storefront (5173): Change in `docker-compose.yml` or storefront config
- PostgreSQL (5432): Change in `docker-compose.yml`
- Redis (6379): Change in `docker-compose.yml`

## Useful Commands

```bash
# Check service status
docker compose ps

# View all logs
docker compose logs -f

# Restart a specific service
docker compose restart backend
docker compose restart storefront

# Rebuild and restart
docker compose up -d --build

# Clean up (removes containers and volumes)
docker compose down -v
```

## Next Steps

1. **Create Admin User** (if not already created):
   ```bash
   cd apps/backend
   npx medusa user create
   ```

2. **Access Admin Dashboard**:
   - Open http://localhost:9000/app
   - Login with your admin credentials

3. **View Storefront**:
   - Open https://localhost:5173
   - Browse products and test the storefront

4. **Run Migrations** (if needed):
   ```bash
   cd apps/backend
   npx medusa db:migrate
   ```




