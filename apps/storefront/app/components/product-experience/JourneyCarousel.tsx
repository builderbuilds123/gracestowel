import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "../../lib/icons";
import { useInViewReveal } from "./hooks";

interface JourneyStep {
  id: string;
  title: string;
  description: string;
  image?: string;
  icon?: string;
}

interface JourneyCarouselProps {
  steps?: JourneyStep[];
  className?: string;
}

const defaultSteps: JourneyStep[] = [
  {
    id: "field",
    title: "The Fields",
    description:
      "Our journey begins in the fertile Aegean region of Turkey, where the finest long-staple cotton grows under the Mediterranean sun.",
    icon: "🌾",
  },
  {
    id: "harvest",
    title: "Hand-Picked",
    description:
      "Each cotton boll is carefully selected at peak maturity, ensuring only the longest, softest fibers make it to our mills.",
    icon: "🤲",
  },
  {
    id: "spinning",
    title: "Artisan Spinning",
    description:
      "Traditional ring-spinning techniques create a stronger, more absorbent thread that defines Turkish cotton's legendary quality.",
    icon: "🧵",
  },
  {
    id: "weaving",
    title: "Looped for Luxury",
    description:
      "Our signature 800 GSM loop weave maximizes surface area, creating that plush, cloud-like feel against your skin.",
    icon: "🪡",
  },
  {
    id: "home",
    title: "Your Sanctuary",
    description:
      "From field to fold, every towel carries the warmth of Turkish tradition into your home. Welcome to everyday luxury.",
    icon: "🏠",
  },
];

/**
 * Horizontal scroll carousel telling the craftsmanship story
 * "From Field to Fold" journey
 */
export function JourneyCarousel({
  steps = defaultSteps,
  className = "",
}: JourneyCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const { ref: sectionRef, isInView } = useInViewReveal({ threshold: 0.2 });

  // Update scroll state
  const updateScrollState = () => {
    if (!scrollRef.current) return;

    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);

    // Calculate active step based on scroll position
    const stepWidth = scrollWidth / steps.length;
    const newIndex = Math.round(scrollLeft / stepWidth);
    setActiveIndex(Math.min(newIndex, steps.length - 1));
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.addEventListener("scroll", updateScrollState, { passive: true });
    updateScrollState();

    return () => container.removeEventListener("scroll", updateScrollState);
  }, [steps.length]);

  const scrollTo = (direction: "left" | "right") => {
    if (!scrollRef.current) return;

    const stepWidth = scrollRef.current.clientWidth * 0.8;
    const newScrollLeft =
      scrollRef.current.scrollLeft + (direction === "left" ? -stepWidth : stepWidth);

    scrollRef.current.scrollTo({ left: newScrollLeft, behavior: "smooth" });
  };

  const scrollToStep = (index: number) => {
    if (!scrollRef.current) return;

    const stepWidth = scrollRef.current.scrollWidth / steps.length;
    scrollRef.current.scrollTo({ left: stepWidth * index, behavior: "smooth" });
  };

  return (
    <section
      ref={sectionRef}
      className={`py-20 overflow-hidden ${className}`}
      aria-label="From Field to Fold journey"
    >
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div
          className={`text-center mb-12 transition-all duration-700 ${
            isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-serif text-text-earthy mb-4">
            From Field to Fold
          </h2>
          <p className="text-text-earthy/70 max-w-md mx-auto">
            Discover the journey of your towel, from Turkish cotton fields to your bathroom sanctuary.
          </p>
        </div>

        {/* Progress indicator */}
        <div
          className={`flex justify-center gap-2 mb-8 transition-all duration-700 ${
            isInView ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionDelay: "200ms" }}
        >
          {steps.map((step, index) => (
            <button
              key={step.id}
              onClick={() => scrollToStep(index)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === activeIndex
                  ? "w-8 bg-accent-earthy"
                  : index < activeIndex
                  ? "w-4 bg-accent-earthy/50"
                  : "w-4 bg-card-earthy"
              }`}
              aria-label={`Go to step ${index + 1}: ${step.title}`}
              aria-current={index === activeIndex ? "step" : undefined}
            />
          ))}
        </div>
      </div>

      {/* Scrollable container */}
      <div className="relative">
        {/* Navigation buttons */}
        <button
          onClick={() => scrollTo("left")}
          className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/90 backdrop-blur-sm shadow-soft flex items-center justify-center transition-all duration-300 ${
            canScrollLeft
              ? "opacity-100 hover:bg-white hover:shadow-soft-lg"
              : "opacity-0 pointer-events-none"
          }`}
          aria-label="Previous step"
        >
          <ChevronLeft className="w-6 h-6 text-text-earthy" />
        </button>

        <button
          onClick={() => scrollTo("right")}
          className={`absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/90 backdrop-blur-sm shadow-soft flex items-center justify-center transition-all duration-300 ${
            canScrollRight
              ? "opacity-100 hover:bg-white hover:shadow-soft-lg"
              : "opacity-0 pointer-events-none"
          }`}
          aria-label="Next step"
        >
          <ChevronRight className="w-6 h-6 text-text-earthy" />
        </button>

        {/* Steps container */}
        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto snap-x snap-mandatory hide-scrollbar px-6 md:px-12 pb-8"
          style={{ scrollPaddingLeft: "1.5rem" }}
        >
          {steps.map((step, index) => (
            <article
              key={step.id}
              className={`flex-shrink-0 w-[85vw] md:w-[60vw] lg:w-[40vw] snap-center transition-all duration-700 ${
                isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: `${300 + index * 100}ms` }}
            >
              <div
                className={`h-full bg-gradient-to-br rounded-3xl p-8 md:p-10 shadow-soft transition-all duration-300 ${
                  index === activeIndex
                    ? "from-card-earthy/50 to-card-earthy/30 scale-100"
                    : "from-card-earthy/30 to-card-earthy/10 scale-95 opacity-70"
                }`}
              >
                {/* Step number and icon */}
                <div className="flex items-center gap-4 mb-6">
                  <span
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-serif transition-all duration-300 ${
                      index <= activeIndex
                        ? "bg-accent-earthy text-white"
                        : "bg-card-earthy/50 text-text-earthy/50"
                    }`}
                  >
                    {index + 1}
                  </span>
                  {step.icon ? (
                    <span className="text-3xl" role="img" aria-hidden="true">
                      {step.icon}
                    </span>
                  ) : null}
                </div>

                {/* Step content */}
                <h3 className="text-2xl md:text-3xl font-serif text-text-earthy mb-4">
                  {step.title}
                </h3>
                <p className="text-text-earthy/70 leading-relaxed text-lg">
                  {step.description}
                </p>

                {/* Decorative line */}
                <div
                  className={`mt-8 h-0.5 rounded-full transition-all duration-500 ${
                    index === activeIndex ? "w-16 bg-accent-earthy/60" : "w-8 bg-accent-earthy/20"
                  }`}
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
