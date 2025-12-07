# Railway Environment Variables Setup

## Required Variables for R2 Upload Fix

Add these environment variables to your Railway backend service:

```bash
S3_ENDPOINT=https://61ecdebdf79feeed43b7e74f65bf1ae8.r2.cloudflarestorage.com
S3_PUBLIC_URL=https://r2.gracestowel.com
S3_BUCKET=towel-product-image
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=a9a0faeb89a7f430415f080bcafd3d02
S3_SECRET_ACCESS_KEY=70c038ec18e052a33a146ab8c0ab989f3e33407e7277b528c49298da9533528c
S3_CACHE_CONTROL=public, max-age=31536000
```

**CRITICAL**: Region must be `us-east-1` (or any valid AWS region), NOT `auto`.
The AWS SDK does not accept `region="auto"` even though Cloudflare R2 documentation mentions it.

## Steps to Add Variables

1. Go to Railway Dashboard: https://railway.app/dashboard
2. Select "Grace's Towel Platform" project
3. Select the backend service
4. Go to "Variables" tab
5. Add each variable above
6. Railway will automatically redeploy the service

## How This Fixes the 500 Error

- **S3_ENDPOINT**: R2 API endpoint for upload operations (write)
- **S3_PUBLIC_URL**: Custom domain for generating public URLs (read)

The Medusa file-s3 module uses:
- `endpoint` → connects to S3_ENDPOINT for uploads
- `file_url` → uses S3_PUBLIC_URL to generate URLs saved in database

## Verification

After adding variables and redeployment completes:
1. Try uploading an image through Medusa Admin
2. Should succeed with HTTP 200
3. Image URL should be: `https://r2.gracestowel.com/[filename]`
