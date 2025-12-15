import type { Route } from "./+types/home";
import { ProductCard } from "../components/ProductCard";
import { Link } from "react-router";
import { useState } from "react";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { Eye } from "lucide-react";
import { Towel } from "@phosphor-icons/react";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Grace Stowel - Premium Organic Cotton Towels" },
    { name: "description", content: "Discover luxuriously soft, sustainably made organic cotton towels. Handcrafted with care, designed to last." },
    // Open Graph
    { property: "og:title", content: "Grace Stowel - Premium Organic Cotton Towels" },
    { property: "og:description", content: "Discover luxuriously soft, sustainably made organic cotton towels. Handcrafted with care, designed to last." },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://gracestowel.com" },
    { property: "og:site_name", content: "Grace Stowel" },
    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "Grace Stowel - Premium Organic Cotton Towels" },
    { name: "twitter:description", content: "Discover luxuriously soft, sustainably made organic cotton towels. Handcrafted with care, designed to last." },
    // Additional SEO
    { name: "keywords", content: "organic cotton towels, premium towels, luxury bath towels, sustainable towels, handcrafted towels" },
    { name: "robots", content: "index, follow" },
  ];
}

interface ProductHotspot {
  id: number;
  name: string;
  price: string;
  top: string;
  left: string;
  width: string;
  height: string;
  handle: string;
}

export default function Home() {
  const { addToCart } = useCart();
  const { formatPrice } = useLocale();
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null);

  // Define hotspots for products in the hero image
  const hotspots: ProductHotspot[] = [
    {
      id: 1,
      name: "The Nuzzle",
      price: "$18.00",
      top: "80.1%",
      left: "15.5%",
      width: "15%",
      height: "20%",
      handle: "the-nuzzle",
    },
    {
      id: 2,
      name: "The Cradle",
      price: "$25.00",
      top: "65.1%",
      left: "40.5%",
      width: "18%",
      height: "25%",
      handle: "the-cradle",
    },
    {
      id: 3,
      name: "The Bear Hug",
      price: "$35.00",
      top: "50.0%",
      left: "64.3%",
      width: "20%",
      height: "25%",
      handle: "the-bearhug",
    },
  ];



  const handleQuickAdd = (hotspot: ProductHotspot) => {
    let image = "/hero-towels-new.jpg";
    if (hotspot.id === 1) image = "/washcloth-nuzzle.jpg";
    if (hotspot.id === 2) image = "/hand-towel-cradle.jpg";
    if (hotspot.id === 3) image = "/bath-towel-bearhug.jpg";

    addToCart({
      id: hotspot.id,
      title: hotspot.name,
      price: hotspot.price,
      image: image,
    });
  };

  const products = [
    {
      id: 1,
      title: "The Nuzzle",
      description: "Our signature washcloth. Gentle enough for a baby, durable enough for daily use.",
      price: "$18.00",
      image: "/washcloth-nuzzle.jpg",
      handle: "the-nuzzle",
    },
    {
      id: 2,
      title: "The Cradle",
      description: "The perfect hand towel. Soft, absorbent, and ready to comfort your hands.",
      price: "$25.00",
      image: "/hand-towel-cradle.jpg",
      handle: "the-cradle",
    },
    {
      id: 3,
      title: "The Bear Hug",
      description: "Wrap yourself in a warm embrace with our oversized, ultra-plush bath towel.",
      price: "$35.00",
      image: "/bath-towel-bearhug.jpg",
      handle: "the-bearhug",
    },
  ];

  // JSON-LD structured data for organization and website
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Grace Stowel",
    url: "https://gracestowel.com",
    logo: "https://gracestowel.com/logo.png",
    description: "Premium organic cotton towels, handcrafted with care and designed to last.",
    sameAs: [
      "https://instagram.com/gracestowel",
      "https://facebook.com/gracestowel"
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: "hello@gracestowel.com",
      contactType: "customer service"
    }
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Grace Stowel",
    url: "https://gracestowel.com",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://gracestowel.com/search?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />

      {/* Hero Section - Full Screen Background Image with Hotspots */}
      <section className="relative -mt-24 h-[calc(100vh+96px)] overflow-hidden">
        <img
          src="/hero-towels-new.jpg"
          alt="Luxury Towels"
          className="absolute inset-0 w-full h-full object-cover object-[center_40%]"
          fetchPriority="high"
        />
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/10"></div>



        {/* Hotspots */}
        {hotspots.map((spot) => (
          <div
            key={spot.id}
            className="absolute"
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
              transform: 'translate(-50%, -50%)', // Center the spot on the coordinate
              zIndex: 40
            }}
          >
            {/* Pulsing Circle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 group">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-8 w-8 bg-white/30 backdrop-blur-sm border border-white/50 shadow-lg items-center justify-center transition-transform duration-300 group-hover:scale-110">
                <div className="w-2.5 h-2.5 bg-white rounded-full shadow-sm"></div>
              </span>

              {/* Product Info Card (Visible on Hover) - with padding bridge to prevent hover loss */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 pointer-events-none group-hover:pointer-events-auto z-50">
                <div className="bg-white/95 backdrop-blur rounded-lg shadow-xl p-3 text-center border border-stone-100 w-48">
                  <h3 className="font-serif text-stone-900 text-lg">{spot.name}</h3>
                  <p className="text-accent-earthy font-medium mb-2">{spot.price}</p>
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickAdd(spot);
                      }}
                      className="flex items-center justify-center p-2 bg-accent-earthy text-white rounded-full hover:bg-accent-earthy/90 transition-colors cursor-pointer shadow"
                      aria-label="Hang it Up"
                    >
                      <Towel size={16} weight="regular" />
                    </button>
                    <Link
                      to={`/products/${spot.handle}`}
                      className="flex items-center justify-center p-2 border-2 border-accent-earthy text-accent-earthy rounded-full hover:bg-accent-earthy/10 transition-colors cursor-pointer"
                      aria-label="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Featured Collection */}
      <section className="container mx-auto px-4 md:px-8 max-w-7xl mb-20 py-20">
        <div className="flex justify-between items-end mb-8 border-b border-card-earthy/50 pb-4">
          <h3 className="text-2xl font-serif text-text-earthy">Best Sellers</h3>
          <Link to="/collections/best-sellers" className="text-accent-earthy hover:text-text-earthy transition-colors text-sm font-medium">View All &rarr;</Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              title={product.title}
              description={product.description}
              price={product.price}
              image={product.image}
              handle={product.handle}
            />
          ))}
        </div>
      </section>
    </>
  );
}
