import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    databaseDriverOptions: process.env.DATABASE_SSL !== "false" ? {
      connection: {
        ssl: {
          rejectUnauthorized: false,
        },
      },
      clientUrl: process.env.DATABASE_URL,
    } : {
      connection: {
        ssl: false,
      },
      clientUrl: process.env.DATABASE_URL,
    },
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET!,
      cookieSecret: process.env.COOKIE_SECRET!,
    }
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: process.env.RAILWAY_PUBLIC_DOMAIN || process.env.MEDUSA_BACKEND_URL || "/"
  },
  modules: [
    {
      // Event bus backed by Redis for durable cross-instance delivery (useful in dev/staging/prod)
      key: "eventBusService",
      resolve: "@medusajs/event-bus-redis",
      options: {
        redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
      },
    },
    {
      resolve: "@medusajs/file",
      options: {
        providers: [
          ...(process.env.S3_ACCESS_KEY_ID ? [{
            resolve: "@medusajs/file-s3",
            id: "s3",
            options: {
              file_url: process.env.S3_PUBLIC_URL,
              bucket: process.env.S3_BUCKET,
              region: process.env.S3_REGION,
              access_key_id: process.env.S3_ACCESS_KEY_ID,
              secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
              cache_control: process.env.S3_CACHE_CONTROL || "public, max-age=31536000",
              download_file_duration: 60 * 60, // 1 hour
              endpoint: process.env.S3_ENDPOINT,
            },
          }] : [{
            resolve: "@medusajs/file-local",
            id: "local",
            options: {
              upload_dir: "static",
              backend_url: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
            }
          }]),
        ],
      },
    },
    {
      resolve: "@medusajs/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/resend",
            id: "resend",
            options: {
              channels: ["email"],
              api_key: process.env.RESEND_API_KEY,
              from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
            },
          },
        ],
      },
    },
    {
      resolve: "./src/modules/review",
    },
  ],
})
