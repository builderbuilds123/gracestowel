import { createRequestHandler } from "react-router";
import { setServerEnv } from "../app/lib/medusa";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    // Initialize server-side env singleton for global utility access (Codex feedback fix)
    setServerEnv(env);

    try {
      return await requestHandler(request, {
        cloudflare: { env, ctx },
      });
    } catch (error: any) {
      console.error("🔥 Worker Fatal Error:", error);
      
      // Return a clean error response instead of letting the isolate crash
      const errorDetail = {
        error: "Internal Worker Error",
        message: error.message || "Unknown error",
        stack: error.stack,
        url: request.url,
        method: request.method
      };

      return new Response(JSON.stringify(errorDetail), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Error": "true"
        }
      });
    }
  },
} satisfies ExportedHandler<Env>;
