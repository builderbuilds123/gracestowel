import type { Route } from "./+types/sitemap[.]xml";
import { getMedusaClient, castToMedusaProduct, type MedusaProduct } from "../lib/medusa";

const SITE_URL = "https://gracestowel.com";

// Static pages that should always be in the sitemap
const staticPages = [
    { url: "/", priority: "1.0", changefreq: "daily" },
    { url: "/towels", priority: "0.9", changefreq: "daily" },
    { url: "/about", priority: "0.7", changefreq: "monthly" },
    { url: "/blog", priority: "0.6", changefreq: "weekly" },
];

export async function loader({ context }: Route.LoaderArgs) {
    // Fetch all products for dynamic URLs
    let productUrls: { url: string; priority: string; changefreq: string }[] = [];
    
    try {
        const medusa = getMedusaClient(context);
        const { products } = await medusa.store.product.list({ limit: 100, fields: "+handle" });
        
        productUrls = products.map(castToMedusaProduct).map((product: MedusaProduct) => ({
            url: `/products/${product.handle}`,
            priority: "0.8",
            changefreq: "weekly",
        }));
    } catch (error) {
        console.error("Failed to fetch products for sitemap:", error);
    }

    const allUrls = [...staticPages, ...productUrls];
    const lastmod = new Date().toISOString().split("T")[0];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
    .map(
        (page) => `  <url>
    <loc>${SITE_URL}${page.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
    )
    .join("\n")}
</urlset>`;

    return new Response(sitemap, {
        headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
        },
    });
}

