import { useMemo } from "react";

interface FloatingFibersProps {
  count?: number;
  className?: string;
}

/**
 * CSS-only floating cotton fiber particles
 * Creates an ethereal, sensory atmosphere
 */
export function FloatingFibers({ count = 15, className = "" }: FloatingFibersProps) {
  // Generate random fiber positions and animation delays
  const fibers = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: 4 + Math.random() * 8,
      delay: Math.random() * 8,
      duration: 6 + Math.random() * 6,
      opacity: 0.3 + Math.random() * 0.4,
    }));
  }, [count]);

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {fibers.map((fiber) => (
        <div
          key={fiber.id}
          className="absolute rounded-full bg-white/80 animate-float-fiber"
          style={{
            left: fiber.left,
            top: fiber.top,
            width: fiber.size,
            height: fiber.size,
            animationDelay: `${fiber.delay}s`,
            animationDuration: `${fiber.duration}s`,
            opacity: fiber.opacity,
            filter: "blur(1px)",
          }}
        />
      ))}
      {/* Add some elongated fibers for variety */}
      {fibers.slice(0, Math.floor(count / 3)).map((fiber) => (
        <div
          key={`elongated-${fiber.id}`}
          className="absolute bg-white/60 animate-float-fiber"
          style={{
            left: `${parseFloat(fiber.left) + 10}%`,
            top: `${parseFloat(fiber.top) + 20}%`,
            width: fiber.size * 0.4,
            height: fiber.size * 2,
            borderRadius: "50%",
            animationDelay: `${fiber.delay + 2}s`,
            animationDuration: `${fiber.duration + 2}s`,
            opacity: fiber.opacity * 0.7,
            filter: "blur(0.5px)",
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}
