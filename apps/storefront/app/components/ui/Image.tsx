import { Image as UnpicImage, type ImageProps as UnpicImageProps } from "@unpic/react";
import { getBackendUrl } from "../../lib/medusa";

// Your R2 domain
const R2_DOMAIN = "https://r2.gracestowel.com";

export type ImageProps = UnpicImageProps & {
  alt: string; // Enforce alt text for accessibility
  // Override className to be optional but compatible
  className?: string;
};

/**
 * Smart Image component that optimizes R2 images using a free image proxy (wsrv.nl).
 * 
 * Features:
 * - Automatically detects R2 URLs and routes them through wsrv.nl
 * - Generates responsive srcsets for performance (via unpic)
 * - Enforces aspect ratios to prevent CLS (cumulative layout shift)
 * - Uses native lazy loading by default
 */
export function Image({ src, ...props }: ImageProps) {
  // If it's a local R2 image, we want to optimize it via a proxy
  // We use the 'weserv' transformer (wsrv.nl) which is free and reliable
  // unpic detects 'wsrv.nl' URLs and auto-generates srcset
  let finalSrc = src;

  // Handle Medusa backend uploads
  if (typeof src === 'string' && src.startsWith("/uploads/")) {
    const backendUrl = getBackendUrl().replace(/\/$/, "");
    finalSrc = `${backendUrl}${src}`;
  }

  // Check if src is a string and comes from our R2 bucket or backend
  if (
    typeof finalSrc === 'string' &&
    (finalSrc.startsWith(R2_DOMAIN) || finalSrc.includes("/uploads/")) &&
    !finalSrc.includes('wsrv.nl') &&
    !finalSrc.includes('localhost') // wsrv.nl cannot reach localhost
  ) {
    finalSrc = `https://wsrv.nl/?url=${encodeURIComponent(finalSrc)}`;
  }

  return (
    <UnpicImage
      src={finalSrc}
      layout="constrained" // Keeps aspect ratio, responsive width
      loading="lazy"
      // @ts-expect-error - 'weserv' is valid but types might be outdated or strict
      cdn="weserv" 
      {...props}
    />
  );
}
