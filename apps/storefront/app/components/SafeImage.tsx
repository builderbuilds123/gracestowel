/**
 * SafeImage Component
 *
 * A secure image component that prevents XSS attacks via malicious URLs.
 * Only renders images from allowed URL schemes (data:image/ and https://).
 *
 * This addresses CodeQL js/xss-through-dom warnings by ensuring only
 * validated, safe URLs are ever used in the src attribute.
 */

import type { ImgHTMLAttributes } from "react";

/**
 * Allowed URL schemes for images
 */
const SAFE_URL_PREFIXES = [
    'data:image/',  // Base64 encoded images (e.g., from canvas)
    'https://',     // Secure HTTPS URLs only
] as const;

interface SafeImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
    /** The image source URL to validate and display */
    src: string | undefined | null;
    /** Fallback content to display when URL is unsafe or missing */
    fallback?: React.ReactNode;
}

/**
 * Renders an image only if the source URL is safe.
 * Prevents XSS attacks via javascript:, data:text/html, or other malicious URLs.
 *
 * @example
 * ```tsx
 * <SafeImage
 *   src={userProvidedUrl}
 *   alt="User upload"
 *   fallback={<span>Image unavailable</span>}
 * />
 * ```
 */
export function SafeImage({ src, fallback = null, alt = "", ...props }: SafeImageProps) {
    // Validate the URL before rendering
    // This check must be inline for CodeQL to recognize the sanitization
    if (!src) {
        return <>{fallback}</>;
    }

    // Check against allowed prefixes
    const isSafe = SAFE_URL_PREFIXES.some(prefix => src.startsWith(prefix));

    if (!isSafe) {
        return <>{fallback}</>;
    }

    // At this point, src has been validated to start with a safe prefix
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />;
}

export default SafeImage;
