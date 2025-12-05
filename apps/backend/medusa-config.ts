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
