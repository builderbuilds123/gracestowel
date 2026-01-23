/**
 * ProductImageGallery Component
 * 
 * Displays the main product image with thumbnail gallery.
 * Extracted from products.$handle.tsx for better component organization.
 */

interface ProductImageGalleryProps {
    images: string[];
    title: string;
}

export function ProductImageGallery({ images, title }: ProductImageGalleryProps) {
    return (
        <div className="space-y-4">
            {/* Main Image */}
            <div className="aspect-square bg-card-earthy/20 rounded-lg overflow-hidden">
                <img
                    src={images[0]}
                    alt={title}
                    className="w-full h-full object-cover"
                    fetchPriority="high"
                    width="600"
                    height="600"
                />
            </div>
            
            {/* Thumbnail Grid */}
            {images.length > 1 ? (
                <div className="grid grid-cols-2 gap-4">
                    {images.slice(1).map((img, idx) => (
                        <div
                            key={idx}
                            className="aspect-square bg-card-earthy/20 rounded-lg overflow-hidden"
                        >
                            <img
                                src={img}
                                alt={`${title} - Image ${idx + 2}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                width="300"
                                height="300"
                            />
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

