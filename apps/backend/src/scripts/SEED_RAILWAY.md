# Running Seed Script in Railway Staging

The seed script has been updated to support Railway staging environments with automatic S3/R2 image uploads.

## Environment Detection

The script automatically detects the environment:
- **Railway**: Detected by `RAILWAY_ENVIRONMENT` or `RAILWAY_PUBLIC_DOMAIN` env vars
- **S3/R2 Storage**: Detected by presence of `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`
- **Local Dev**: Falls back to local file paths when S3 credentials are not available

## Running in Railway Staging

### Option 1: Via Railway CLI

```bash
# Run seed script in Railway staging
railway run npm run seed
```

### Option 2: Via Railway Dashboard

1. Go to Railway Dashboard → Your Backend Service
2. Navigate to "Deployments" → "Shell"
3. Run: `npm run seed`

### Option 3: Automatic on Deploy (Not Recommended)

The seed script can be added to the Dockerfile CMD, but this is not recommended for production as it runs on every deployment.

## Required Environment Variables

For Railway staging with S3/R2:

```bash
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
S3_PUBLIC_URL=https://r2.gracestowel.com
S3_BUCKET=towel-product-image
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_CACHE_CONTROL=public, max-age=31536000
```

## Safety Features

1. **Production Protection**: The script blocks execution in `NODE_ENV=production` unless `ALLOW_PRODUCTION_SEED=true` is set
2. **Idempotent**: Safe to run multiple times - won't create duplicates
3. **Fallback**: If S3 upload fails, falls back to local paths (for development)

## Image Upload Process

1. **Local Dev**: Uses local file paths (`/uploads/filename.png`)
2. **Railway Staging**: 
   - Reads images from `uploads/` directory (copied into Docker image)
   - Uploads each image to S3/R2 using Medusa file service
   - Uses S3_PUBLIC_URL for image URLs in database
   - Falls back to local paths if upload fails

## Verification

After running the seed script in Railway:

1. Check logs for "Uploaded image to S3/R2" messages
2. Verify images are accessible at `https://r2.gracestowel.com/[filename].png`
3. Check product images in Medusa Admin - should show R2 URLs

## Troubleshooting

### Images not uploading to S3/R2

- Check that S3 environment variables are set correctly
- Verify file service is available: `container.resolve(Modules.FILE)`
- Check Railway logs for upload errors
- Script will fallback to local paths if upload fails

### Production seed blocked

- Set `ALLOW_PRODUCTION_SEED=true` if you intentionally want to seed production
- **Warning**: Only do this if you understand the implications

### Images missing in Docker

- Ensure `uploads/` directory is copied in Dockerfile
- Check that image generation script has been run before building Docker image
