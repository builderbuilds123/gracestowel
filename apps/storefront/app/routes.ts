import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("products/:handle", "routes/products.$handle.tsx"),
    route("collections/:handle", "routes/collections.$handle.tsx"),
    route("checkout", "routes/checkout.tsx"),
    route("checkout/success", "routes/checkout.success.tsx"),
    route("about", "routes/about.tsx"),
    route("blog", "routes/blog.tsx"),
    route("towels", "routes/towels.tsx"),
    route("search", "routes/search.tsx"),
    route("wishlist", "routes/wishlist.tsx"),
    route("account", "routes/account.tsx"),
    route("account/login", "routes/account.login.tsx"),
    route("account/register", "routes/account.register.tsx"),
    route("account/auth/google/callback", "routes/account.auth.google.callback.tsx"),
    route("order/status/:id", "routes/order_.status.$id.tsx"),
    route("order/:id/edit", "routes/order_.$id.edit.tsx"),
    route("order/:id/return", "routes/order_.$id.return.tsx"),
    route("api/shipping-rates", "routes/api.shipping-rates.ts"),
    route("api/checkout-session", "routes/api.checkout-session.ts"),
    // Cart API routes
    route("api/carts", "routes/api.carts.ts"),
    route("api/carts/:id", "routes/api.carts.$id.ts"),
    route("api/carts/:id/shipping-options", "routes/api.carts.$id.shipping-options.ts"),
    route("api/carts/:id/shipping-methods", "routes/api.carts.$id.shipping-methods.ts"),
    route("api/carts/:id/complete", "routes/api.carts.$id.complete.ts"),
    // Payment Collection routes
    route("api/payment-collections", "routes/api.payment-collections.ts"),
    route("api/payment-collections/:id/sessions", "routes/api.payment-collections.$id.sessions.ts"),
    // Utility routes
    route("api/health", "routes/api.health.ts"),
    route("api/set-guest-token", "routes/api.set-guest-token.ts"),
    // Order API routes
    route("api/orders/:id/batch-modify", "routes/api.orders.$id.batch-modify.ts"),
    route("blog/:id", "routes/blog.$id.tsx"),
    // SEO routes
    route("sitemap.xml", "routes/sitemap[.]xml.tsx"),
    route("robots.txt", "routes/robots[.]txt.tsx"),
] satisfies RouteConfig;
