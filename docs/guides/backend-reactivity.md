# Backend Reactivity / Hot Reloading Guide

## Issue
The backend may not detect file changes when running in Docker on macOS due to file system event limitations.

## Solution 1: Docker with Polling (Current Setup)

The `docker-compose.yml` has been configured with polling enabled:
- `CHOKIDAR_USEPOLLING: "true"` - Enables polling for file watching
- `WATCHPACK_POLLING: "true"` - Enables polling for webpack/vite

**Restart the backend to apply:**
```bash
docker compose restart backend
```

## Solution 2: Run Backend Natively (Recommended for Development)

For better reactivity, run the backend outside Docker:

### Prerequisites
- PostgreSQL running (use Docker for this)
- Redis running (use Docker for this)
- Node.js >= 24
- pnpm 9.15.2

### Steps

1. **Keep only database services in Docker:**
   ```bash
   # Stop backend container
   docker compose stop backend
   
   # Keep postgres and redis running
   docker compose up -d postgres redis
   ```

2. **Run backend natively:**
   ```bash
   cd apps/backend
   
   # Install dependencies (if not already done)
   pnpm install
   
   # Make sure your .env points to local Docker services
   # DATABASE_URL=postgresql://postgres:postgres@localhost:5432/medusa
   # REDIS_URL=redis://localhost:6379
   
   # Start dev server
   pnpm run dev
   ```

3. **Benefits:**
   - ✅ Instant file change detection
   - ✅ Faster hot reloading
   - ✅ Better debugging experience
   - ✅ Native performance

## Solution 3: Use Docker with Bind Mount Optimization

If you must use Docker, ensure proper volume configuration:

```yaml
volumes:
  - ./apps/backend:/app:cached  # :cached improves macOS performance
  - /app/node_modules           # Anonymous volume prevents overwrite
```

## Troubleshooting

### Changes Not Detected

1. **Check if polling is enabled:**
   ```bash
   docker compose exec backend env | grep -i poll
   ```

2. **Manually trigger reload:**
   ```bash
   docker compose restart backend
   ```

3. **Check file permissions:**
   ```bash
   docker compose exec backend ls -la /app/src
   ```

### Performance Issues with Polling

Polling can be CPU-intensive. If you experience high CPU usage:
- Switch to native development (Solution 2)
- Reduce polling interval (not recommended)
- Use Docker Desktop's file sharing optimization settings

## Verification

To test if hot reloading works:

1. Make a small change to a backend file (e.g., add a console.log)
2. Save the file
3. Check backend logs:
   ```bash
   docker compose logs -f backend
   ```
4. You should see the server restart or reload automatically

## Recommended Setup

For **best development experience**:
- **Databases (PostgreSQL, Redis)**: Run in Docker
- **Backend**: Run natively with `pnpm run dev`
- **Storefront**: Run natively with `pnpm run dev` (or Docker if preferred)

This gives you:
- Fast file watching
- Quick reloads
- Easy debugging
- Native performance









