const SITE_URL = "https://gracestowel.com";

export async function loader() {
    const robotsTxt = `# Grace Stowel Robots.txt
User-agent: *
Allow: /

# Disallow admin and API routes
Disallow: /api/
Disallow: /checkout
Disallow: /account

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml

# Crawl-delay for polite crawling
Crawl-delay: 1
`;

    return new Response(robotsTxt, {
        headers: {
            "Content-Type": "text/plain",
            "Cache-Control": "public, max-age=86400",
        },
    });
}

