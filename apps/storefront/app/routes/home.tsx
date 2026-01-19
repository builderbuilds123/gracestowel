import type { Route } from "./+types/home";
import { ProductCard } from "../components/ProductCard";
import { Link } from "react-router";
import { useState } from "react";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { ArrowRight, Leaf, Heart, Sparkles, Star, Quote, Truck, RefreshCw, ShieldCheck } from "lucide-react";
import { Towel } from "@phosphor-icons/react";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Grace's Towel - Premium Turkish Cotton Towels for Your Home" },
    { name: "description", content: "Wrap yourself in comfort with our premium Turkish cotton towels. Luxuriously soft, surprisingly affordable, and made to feel like home." },
    // Open Graph
    { property: "og:title", content: "Grace's Towel - Premium Turkish Cotton Towels" },
    { property: "og:description", content: "Wrap yourself in comfort with our premium Turkish cotton towels. Luxuriously soft, surprisingly affordable, and made to feel like home." },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://gracestowel.com" },
    { property: "og:site_name", content: "Grace's Towel" },
    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "Grace's Towel - Premium Turkish Cotton Towels" },
    { name: "twitter:description", content: "Wrap yourself in comfort with our premium Turkish cotton towels. Luxuriously soft, surprisingly affordable, and made to feel like home." },
    // Additional SEO
    { name: "keywords", content: "Turkish cotton towels, premium towels, luxury bath towels, affordable luxury towels, soft towels, home essentials" },
    { name: "robots", content: "index, follow" },
  ];
}

// Testimonial data
const testimonials = [
  {
    id: 1,
    name: "Sarah M.",
    location: "Vancouver, BC",
    quote: "These towels feel like a warm hug after every shower. My whole family loves them!",
    rating: 5,
  },
  {
    id: 2,
    name: "James L.",
    location: "Toronto, ON",
    quote: "Finally found towels that are both luxurious AND affordable. They've held up beautifully after months of use.",
    rating: 5,
  },
  {
    id: 3,
    name: "Emily R.",
    location: "Montreal, QC",
    quote: "The Nuzzle washcloths are so gentle on my sensitive skin. Ordered a set for my mom too!",
    rating: 5,
  },
];

export default function Home() {
  const { addToCart } = useCart();
  const { formatPrice } = useLocale();
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  const handleQuickAdd = (product: typeof products[0]) => {
    addToCart({
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
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
      variantId: undefined,
      sku: undefined,
    },
    {
      id: 2,
      title: "The Cradle",
      description: "The perfect hand towel. Soft, absorbent, and ready to comfort your hands.",
      price: "$25.00",
      image: "/hand-towel-cradle.jpg",
      handle: "the-cradle",
      variantId: undefined,
      sku: undefined,
    },
    {
      id: 3,
      title: "The Bear Hug",
      description: "Wrap yourself in a warm embrace with our oversized, ultra-plush bath towel.",
      price: "$35.00",
      image: "/bath-towel-bearhug.jpg",
      handle: "the-bear-hug",
      variantId: undefined,
      sku: undefined,
    },
  ];

  // JSON-LD structured data
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Grace's Towel",
    url: "https://gracestowel.com",
    logo: "https://gracestowel.com/logo.png",
    description: "Premium Turkish cotton towels, crafted with care and designed to make your home feel warmer.",
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
    name: "Grace's Towel",
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

      {/* Hero Section - Warm Welcome */}
      <section className="relative -mt-24 min-h-screen overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src="/hero-towels-new.jpg"
            alt="Luxuriously soft Turkish cotton towels in warm, inviting setting"
            className="w-full h-full object-cover object-[center_40%]"
            fetchPriority="high"
          />
          {/* Warm overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/40"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 min-h-screen flex flex-col justify-center items-center text-center px-4 pt-24">
          <div className="max-w-3xl mx-auto">
            {/* Tagline */}
            <p className="text-white/90 text-sm md:text-base tracking-[0.3em] uppercase mb-4 font-medium">
              Premium Turkish Cotton
            </p>

            {/* Main Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-sigmar text-white mb-6 drop-shadow-lg leading-tight">
              Wrap Yourself in Comfort
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-white/90 mb-8 font-serif leading-relaxed max-w-2xl mx-auto">
              Luxuriously soft towels that make every day feel like a spa day.
              Quality you can feel, at prices you'll love.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                to="/towels"
                className="group inline-flex items-center gap-2 px-8 py-4 bg-accent-earthy text-white font-semibold rounded-full hover:bg-accent-earthy/90 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Shop Our Collection
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/about"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white/20 backdrop-blur-sm text-white font-semibold rounded-full hover:bg-white/30 transition-all duration-300 border border-white/40"
              >
                Our Story
              </Link>
            </div>
          </div>

          {/* Scroll Indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
            <div className="w-6 h-10 rounded-full border-2 border-white/50 flex items-start justify-center p-2">
              <div className="w-1.5 h-2.5 bg-white/70 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="bg-card-earthy/40 py-4 border-y border-card-earthy/50">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12 text-text-earthy/80 text-sm">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-accent-earthy" />
              <span>Free Shipping Over $75</span>
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-accent-earthy" />
              <span>30-Day Easy Returns</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-accent-earthy" />
              <span>2-Year Quality Guarantee</span>
            </div>
            <div className="flex items-center gap-2">
              <Leaf className="w-4 h-4 text-accent-earthy" />
              <span>Sustainably Made</span>
            </div>
          </div>
        </div>
      </section>

      {/* Welcome Message Section */}
      <section className="py-16 md:py-24 bg-bg-earthy">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl text-center">
          <Heart className="w-8 h-8 text-accent-earthy mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-serif text-text-earthy mb-6">
            Welcome Home
          </h2>
          <p className="text-lg text-text-earthy/80 leading-relaxed mb-4">
            At Grace's Towel, we believe that small luxuries make a big difference.
            That's why we craft our towels from the finest Turkish cotton -
            so every time you reach for one, it feels like coming home.
          </p>
          <p className="text-lg text-text-earthy/80 leading-relaxed">
            Premium quality shouldn't cost a fortune. We've cut out the middlemen
            to bring you hotel-quality towels at prices that won't make you wince.
          </p>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-16 md:py-24 bg-bg-earthy">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          {/* Section Header */}
          <div className="text-center mb-12">
            <p className="text-accent-earthy text-sm tracking-[0.2em] uppercase mb-3 font-medium">
              Meet the Family
            </p>
            <h2 className="text-3xl md:text-4xl font-serif text-text-earthy mb-4">
              Our Bestselling Towels
            </h2>
            <p className="text-text-earthy/70 max-w-xl mx-auto">
              Each towel is named for the way it makes you feel. Which one will you fall in love with?
            </p>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
            {products.map((product) => (
              <div key={product.id} className="group">
                {/* Product Image Container */}
                <div className="relative overflow-hidden rounded-lg mb-4 bg-card-earthy/20 aspect-[4/3]">
                  <Link to={`/products/${product.handle}`}>
                    <img
                      src={product.image}
                      alt={product.title}
                      loading="lazy"
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                  </Link>
                  {/* Quick Add Button */}
                  <button
                    onClick={() => handleQuickAdd(product)}
                    className="absolute bottom-4 right-4 p-3 bg-white/95 backdrop-blur-sm text-text-earthy rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 hover:bg-accent-earthy hover:text-white cursor-pointer"
                    aria-label={`Add ${product.title} to cart`}
                  >
                    <Towel size={20} weight="regular" />
                  </button>
                </div>

                {/* Product Info */}
                <div className="text-center">
                  <Link to={`/products/${product.handle}`}>
                    <h3 className="text-xl font-serif text-text-earthy mb-2 hover:text-accent-earthy transition-colors">
                      {product.title}
                    </h3>
                  </Link>
                  <p className="text-text-earthy/70 text-sm mb-3 px-4">
                    {product.description}
                  </p>
                  <span className="text-accent-earthy font-semibold text-lg">
                    {formatPrice(product.price)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* View All Link */}
          <div className="text-center mt-12">
            <Link
              to="/towels"
              className="inline-flex items-center gap-2 text-accent-earthy font-medium hover:text-text-earthy transition-colors group"
            >
              Browse All Towels
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Why Grace's Towel - Benefits Section */}
      <section className="py-16 md:py-24 bg-card-earthy/20">
        <div className="container mx-auto px-4 md:px-8 max-w-6xl">
          {/* Section Header */}
          <div className="text-center mb-12 md:mb-16">
            <p className="text-accent-earthy text-sm tracking-[0.2em] uppercase mb-3 font-medium">
              Why Choose Us
            </p>
            <h2 className="text-3xl md:text-4xl font-serif text-text-earthy">
              The Grace's Towel Difference
            </h2>
          </div>

          {/* Benefits Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Benefit 1 */}
            <div className="text-center group">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-earthy/10 flex items-center justify-center group-hover:bg-accent-earthy/20 transition-colors">
                <Sparkles className="w-7 h-7 text-accent-earthy" />
              </div>
              <h3 className="font-serif text-lg text-text-earthy mb-2">
                Premium Turkish Cotton
              </h3>
              <p className="text-text-earthy/70 text-sm leading-relaxed">
                Long-fiber cotton that gets softer with every wash. The same quality used in 5-star hotels.
              </p>
            </div>

            {/* Benefit 2 */}
            <div className="text-center group">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-earthy/10 flex items-center justify-center group-hover:bg-accent-earthy/20 transition-colors">
                <Heart className="w-7 h-7 text-accent-earthy" />
              </div>
              <h3 className="font-serif text-lg text-text-earthy mb-2">
                Made with Love
              </h3>
              <p className="text-text-earthy/70 text-sm leading-relaxed">
                Each towel is crafted with attention to detail, from weave to edge finishing.
              </p>
            </div>

            {/* Benefit 3 */}
            <div className="text-center group">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-earthy/10 flex items-center justify-center group-hover:bg-accent-earthy/20 transition-colors">
                <Leaf className="w-7 h-7 text-accent-earthy" />
              </div>
              <h3 className="font-serif text-lg text-text-earthy mb-2">
                Eco-Conscious
              </h3>
              <p className="text-text-earthy/70 text-sm leading-relaxed">
                Sustainably sourced materials and eco-friendly packaging. Good for you and the planet.
              </p>
            </div>

            {/* Benefit 4 */}
            <div className="text-center group">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-earthy/10 flex items-center justify-center group-hover:bg-accent-earthy/20 transition-colors">
                <Star className="w-7 h-7 text-accent-earthy" />
              </div>
              <h3 className="font-serif text-lg text-text-earthy mb-2">
                Honest Pricing
              </h3>
              <p className="text-text-earthy/70 text-sm leading-relaxed">
                No markups, no gimmicks. Premium quality at fair prices, always.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 md:py-24 bg-bg-earthy">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl">
          {/* Section Header */}
          <div className="text-center mb-12">
            <p className="text-accent-earthy text-sm tracking-[0.2em] uppercase mb-3 font-medium">
              Happy Homes
            </p>
            <h2 className="text-3xl md:text-4xl font-serif text-text-earthy">
              What Our Customers Say
            </h2>
          </div>

          {/* Testimonial Card */}
          <div className="relative bg-white rounded-2xl shadow-lg p-8 md:p-12 text-center">
            <Quote className="w-10 h-10 text-accent-earthy/20 mx-auto mb-6" />

            <p className="text-lg md:text-xl text-text-earthy leading-relaxed mb-6 font-serif italic">
              "{testimonials[activeTestimonial].quote}"
            </p>

            {/* Rating Stars */}
            <div className="flex justify-center gap-1 mb-4">
              {[...Array(testimonials[activeTestimonial].rating)].map((_, i) => (
                <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              ))}
            </div>

            <p className="font-semibold text-text-earthy">
              {testimonials[activeTestimonial].name}
            </p>
            <p className="text-sm text-text-earthy/60">
              {testimonials[activeTestimonial].location}
            </p>

            {/* Testimonial Navigation */}
            <div className="flex justify-center gap-2 mt-8">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveTestimonial(index)}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    index === activeTestimonial
                      ? 'bg-accent-earthy w-8'
                      : 'bg-card-earthy hover:bg-accent-earthy/50'
                  }`}
                  aria-label={`View testimonial ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Lifestyle/Featured Image Section */}
      <section className="relative py-24 md:py-32 overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src="/hero-towels.jpg"
            alt="Cozy bathroom setting with Grace's Towel products"
            loading="lazy"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-text-earthy/80 to-text-earthy/40"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 container mx-auto px-4 md:px-8 max-w-3xl">
          <div className="text-white">
            <p className="text-white/80 text-sm tracking-[0.2em] uppercase mb-4 font-medium">
              Transform Your Space
            </p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-sigmar mb-6 leading-tight">
              Make Every Day Feel Special
            </h2>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
              Your bathroom should be a sanctuary. Start your morning right and end your day
              wrapped in the comfort you deserve.
            </p>
            <Link
              to="/towels"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-text-earthy font-semibold rounded-full hover:bg-bg-earthy transition-all duration-300 shadow-lg group"
            >
              Start Your Collection
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="py-16 md:py-24 bg-accent-earthy">
        <div className="container mx-auto px-4 md:px-8 max-w-2xl text-center">
          <h2 className="text-3xl md:text-4xl font-sigmar text-white mb-4">
            Join the Family
          </h2>
          <p className="text-white/90 mb-8 text-lg">
            Sign up for cozy tips, exclusive offers, and a warm welcome to your inbox.
          </p>

          <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="Your email address"
              className="flex-1 px-5 py-4 rounded-full bg-white/95 text-text-earthy placeholder:text-text-earthy/50 focus:outline-none focus:ring-2 focus:ring-white/50"
              required
            />
            <button
              type="submit"
              className="px-8 py-4 bg-text-earthy text-white font-semibold rounded-full hover:bg-text-earthy/90 transition-colors whitespace-nowrap"
            >
              Subscribe
            </button>
          </form>

          <p className="text-white/70 text-sm mt-4">
            No spam, just warmth. Unsubscribe anytime.
          </p>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-16 md:py-20 bg-bg-earthy">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl text-center">
          <h2 className="text-2xl md:text-3xl font-serif text-text-earthy mb-4">
            Ready to Experience the Difference?
          </h2>
          <p className="text-text-earthy/70 mb-8 max-w-xl mx-auto">
            Join thousands of happy customers who've upgraded their daily comfort.
            Your new favorite towels are waiting.
          </p>
          <Link
            to="/towels"
            className="inline-flex items-center gap-2 px-8 py-4 bg-accent-earthy text-white font-semibold rounded-full hover:bg-accent-earthy/90 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 group"
          >
            Shop Now
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>
    </>
  );
}
