import { useState, useRef, useCallback } from "react";
import { useInViewReveal } from "./hooks";

interface Hotspot {
  id: string;
  x: number; // percentage
  y: number; // percentage
  title: string;
  description: string;
}

interface TextureDiscoveryProps {
  image: string;
  hotspots?: Hotspot[];
  className?: string;
}

const defaultHotspots: Hotspot[] = [
  {
    id: "weave",
    x: 30,
    y: 40,
    title: "The Weave",
    description: "800 GSM Turkish cotton loops for maximum absorbency",
  },
  {
    id: "softness",
    x: 70,
    y: 30,
    title: "Cloud-Soft Texture",
    description: "Pre-washed for immediate softness that grows with every wash",
  },
  {
    id: "durability",
    x: 50,
    y: 70,
    title: "Built to Last",
    description: "Double-stitched edges and reinforced fibers for years of luxury",
  },
];

/**
 * Interactive texture exploration with zoom lens and hotspots
 * Simulates examining fabric in-store
 */
export function TextureDiscovery({
  image,
  hotspots = defaultHotspots,
  className = "",
}: TextureDiscoveryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const { ref: revealRef, isInView } = useInViewReveal({ threshold: 0.2 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setMousePosition({ x, y });
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current || e.touches.length === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;

    setMousePosition({ x, y });
  }, []);

  return (
    <section
      ref={revealRef}
      className={`py-20 px-6 ${className}`}
      aria-label="Texture exploration"
    >
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div
          className={`text-center mb-12 transition-all duration-700 ${
            isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-serif text-text-earthy mb-4">
            Touch Without Touching
          </h2>
          <p className="text-text-earthy/70 max-w-md mx-auto">
            Explore the texture. Hover to zoom in and discover what makes our towels special.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Zoom lens container */}
          <div
            ref={containerRef}
            className={`relative aspect-square rounded-3xl overflow-hidden cursor-crosshair shadow-soft-lg transition-all duration-700 ${
              isInView ? "opacity-100 scale-100" : "opacity-0 scale-95"
            }`}
            style={{ transitionDelay: "200ms" }}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onTouchMove={handleTouchMove}
            onTouchStart={() => setIsHovering(true)}
            onTouchEnd={() => setIsHovering(false)}
          >
            {/* Base image */}
            <img
              src={image}
              alt="Towel texture close-up"
              className="w-full h-full object-cover animate-zoom-breathe"
            />

            {/* Zoom lens overlay */}
            <div
              className={`absolute w-40 h-40 rounded-full border-4 border-white/80 shadow-2xl pointer-events-none transition-opacity duration-300 overflow-hidden ${
                isHovering ? "opacity-100" : "opacity-0"
              }`}
              style={{
                left: `${mousePosition.x}%`,
                top: `${mousePosition.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {/* Zoomed image inside lens */}
              <div
                className="absolute w-[300%] h-[300%]"
                style={{
                  backgroundImage: `url(${image})`,
                  backgroundSize: "cover",
                  backgroundPosition: `${mousePosition.x}% ${mousePosition.y}%`,
                  left: "-100%",
                  top: "-100%",
                }}
              />
              {/* Lens highlight */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
            </div>

            {/* Hotspots */}
            {hotspots.map((hotspot, index) => (
              <button
                key={hotspot.id}
                className={`absolute w-10 h-10 md:w-8 md:h-8 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 touch-target ${
                  isInView ? "opacity-100 scale-100" : "opacity-0 scale-0"
                }`}
                style={{
                  left: `${hotspot.x}%`,
                  top: `${hotspot.y}%`,
                  transitionDelay: `${400 + index * 150}ms`,
                }}
                onClick={() => setActiveHotspot(activeHotspot === hotspot.id ? null : hotspot.id)}
                onMouseEnter={() => setActiveHotspot(hotspot.id)}
                onMouseLeave={() => setActiveHotspot(null)}
                onFocus={() => setActiveHotspot(hotspot.id)}
                onBlur={() => setActiveHotspot(null)}
                aria-label={`Discover: ${hotspot.title}`}
                aria-expanded={activeHotspot === hotspot.id}
                aria-describedby={`hotspot-desc-${hotspot.id}`}
              >
                {/* Pulse ring */}
                <span
                  className={`absolute inset-0 rounded-full bg-accent-earthy/30 ${
                    activeHotspot === hotspot.id ? "" : "animate-pulse-soft"
                  }`}
                />
                {/* Center dot */}
                <span
                  className={`absolute inset-2 rounded-full bg-accent-earthy transition-transform duration-300 ${
                    activeHotspot === hotspot.id ? "scale-125" : "scale-100"
                  }`}
                />
              </button>
            ))}

            {/* Hotspot tooltip */}
            {activeHotspot ? (
              <div
                id={`hotspot-desc-${activeHotspot}`}
                role="tooltip"
                className="absolute bg-white/95 backdrop-blur-sm rounded-2xl p-4 shadow-soft-lg max-w-xs pointer-events-none animate-fade-up z-10"
                style={{
                  left: `${hotspots.find((h) => h.id === activeHotspot)?.x}%`,
                  top: `${(hotspots.find((h) => h.id === activeHotspot)?.y || 0) + 8}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <h4 className="font-serif text-lg text-text-earthy mb-1">
                  {hotspots.find((h) => h.id === activeHotspot)?.title}
                </h4>
                <p className="text-sm text-text-earthy/70">
                  {hotspots.find((h) => h.id === activeHotspot)?.description}
                </p>
              </div>
            ) : null}
          </div>

          {/* Texture facts */}
          <div className="space-y-8">
            {hotspots.map((hotspot, index) => (
              <div
                key={hotspot.id}
                className={`p-6 rounded-2xl transition-all duration-500 cursor-pointer ${
                  activeHotspot === hotspot.id
                    ? "bg-card-earthy/40 shadow-soft"
                    : "bg-card-earthy/10 hover:bg-card-earthy/20"
                } ${isInView ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
                style={{ transitionDelay: `${300 + index * 100}ms` }}
                onMouseEnter={() => setActiveHotspot(hotspot.id)}
                onMouseLeave={() => setActiveHotspot(null)}
              >
                <div className="flex items-start gap-4">
                  <span
                    className={`flex-shrink-0 w-3 h-3 rounded-full bg-accent-earthy mt-2 transition-transform duration-300 ${
                      activeHotspot === hotspot.id ? "scale-150" : "scale-100"
                    }`}
                  />
                  <div>
                    <h3 className="font-serif text-xl text-text-earthy mb-2">
                      {hotspot.title}
                    </h3>
                    <p className="text-text-earthy/70 leading-relaxed">
                      {hotspot.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
