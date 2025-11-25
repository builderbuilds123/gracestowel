# Railway Environment Variables Setup Script
# Run these commands to set environment variables for the backend service

# Database URL (uses private network)
railway variables --set DATABASE_URL='${{Postgres.DATABASE_PRIVATE_URL}}'

# Redis URL (uses private network)  
railway variables --set REDIS_URL='${{Redis.REDIS_PRIVATE_URL}}'

# CORS Configuration
railway variables --set STORE_CORS='https://gracestowel.com,https://www.gracestowel.com'
railway variables --set ADMIN_CORS='https://admin.gracestowel.com'
railway variables --set AUTH_CORS='https://gracestowel.com,https://www.gracestowel.com'

# Secrets (GENERATE SECURE VALUES)
railway variables --set JWT_SECRET='CHANGE_ME_TO_SECURE_RANDOM_STRING'
railway variables --set COOKIE_SECRET='CHANGE_ME_TO_SECURE_RANDOM_STRING'

# Medusa Config
railway variables --set MEDUSA_ADMIN_ONBOARDING_TYPE='default'
railway variables --set NODE_ENV='production'
