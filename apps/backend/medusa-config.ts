import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const isIntegrationTest = process.env.TEST_TYPE?.startsWith("integration")

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    workerMode: (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") || "shared",
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
    // Disable admin for worker instances (saves ~100MB RAM)
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true" || process.env.MEDUSA_WORKER_MODE === "worker",
    backendUrl: process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
      : (process.env.MEDUSA_BACKEND_URL || "/"),
    path: "/app"
  },
  modules: [
    {
      resolve: "@medusajs/medusa/auth",
      options: {
        providers: [
          {
            resolve: "@medusajs/auth-emailpass",
            id: "emailpass",
          },
          {
            resolve: "@medusajs/auth-google",
            id: "google",
            options: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              callbackUrl: process.env.GOOGLE_CALLBACK_URL,
            },
          },
        ],
      },
    },
    // Temporarily disabled to debug auth issue
    // {
    //   resolve: "@medusajs/medusa/analytics",
    //   options: {
    //     providers: process.env.NODE_ENV === "production"
    //       ? [
    //           {
    //             resolve: "@medusajs/analytics-posthog",
    //             id: "posthog",
    //             options: {
    //               posthogEventsKey: process.env.POSTHOG_EVENTS_API_KEY,
    //               posthogHost: process.env.POSTHOG_HOST,
    //             },
    //           },
    //         ]
    //       : [
    //           {
    //             resolve: "@medusajs/analytics-local",
    //             id: "local",
    //           },
    //         ],
    //   },
    // },
    {
      // Event bus backed by Redis for durable cross-instance delivery (useful in dev/staging/prod)
      key: "eventBusService",
      resolve: isIntegrationTest ? "@medusajs/event-bus-local" : "@medusajs/event-bus-redis",
      options: isIntegrationTest
        ? {}
        : {
            redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
          },
    },
    {
      resolve: "@medusajs/file",
      options: {
        providers: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? [
              {
                resolve: "@medusajs/file-s3",
                id: "s3",
                options: {
                  // For R2: file_url is the public URL (custom domain) for accessing uploaded files
                  //         endpoint is the R2 API URL for upload operations
                  file_url: process.env.S3_PUBLIC_URL,
                  bucket: process.env.S3_BUCKET,
                  region: process.env.S3_REGION,
                  access_key_id: process.env.S3_ACCESS_KEY_ID,
                  secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                  cache_control: process.env.S3_CACHE_CONTROL || "public, max-age=31536000",
                  download_file_duration: 60 * 60, // 1 hour
                  endpoint: process.env.S3_ENDPOINT,
                },
              },
            ]
          : [
              // Use local file provider when S3 credentials are not available (e.g., in test environments)
              {
                resolve: "@medusajs/file-local",
                id: "local",
                options: {
                  upload_dir: "uploads",
                  backend_url: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
                },
              },
            ],
      },
    },
    {
      resolve: "@medusajs/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/resend",
            id: "notification-resend",
            options: {
              channels: ["email"],
              api_key: process.env.RESEND_API_KEY,
              from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
              test_mode: process.env.NODE_ENV === "test" || process.env.RESEND_TEST_MODE === "true",
            },
          },
          {
            resolve: "@medusajs/medusa/notification-local",
            id: "local",
            options: {
              channels: ["feed"],
            },
          },
        ],
      },
    },
    {
      resolve: "./src/modules/review",
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/stripePartialCapture",
            options: {
              apiKey: process.env.STRIPE_SECRET_KEY,
              webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/translation",
    },
  ],
})
