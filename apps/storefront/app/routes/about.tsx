import { Towel } from "../lib/icons";
import { Image as OptimizedImage } from "../components/ui/Image";

export default function About() {
    return (
        <div className="min-h-screen bg-background-earthy">
            <div className="container mx-auto px-4 py-16 max-w-4xl">
                <div className="text-center mb-16">
                    <div className="flex justify-center mb-6">
                        <div className="p-4 bg-accent-earthy/10 rounded-full">
                            <Towel size={48} weight="regular" className="text-accent-earthy" />
                        </div>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-serif text-text-earthy mb-6">Our Story</h1>
                    <p className="text-xl text-text-earthy/60 max-w-2xl mx-auto leading-relaxed">
                        We believe that the simple act of drying off should be a moment of pure comfort and luxury.
                    </p>
                </div>

                <div className="space-y-16">
                    <section className="grid md:grid-cols-2 gap-12 items-center">
                        <div className="aspect-square bg-card-earthy/20 rounded-2xl overflow-hidden">
                            <OptimizedImage
                                src="/hero-towels-new.jpg"
                                alt="Grace's Towel Collection"
                                className="w-full h-full object-cover"
                                width={800}
                                height={800}
                            />
                        </div>
                        <div className="space-y-6">
                            <h2 className="text-3xl font-serif text-text-earthy">Crafted with Care</h2>
                            <p className="text-text-earthy/80 leading-relaxed">
                                Founded in 2023, Grace's Towel began with a simple mission: to create the perfect towel. We spent months testing fabrics, weights, and weaves to find the ideal balance of softness, absorbency, and durability.
                            </p>
                            <p className="text-text-earthy/80 leading-relaxed">
                                Our towels are made from 100% long-staple cotton, sourced from sustainable farms and woven by master artisans in Portugal. Every thread tells a story of quality and dedication.
                            </p>
                        </div>
                    </section>

                    <section className="grid md:grid-cols-2 gap-12 items-center md:grid-flow-col-dense">
                        <div className="space-y-6 md:col-start-2">
                            <div className="aspect-square bg-card-earthy/20 rounded-2xl overflow-hidden">
                                <OptimizedImage
                                    src="/cradle-cloud-white-01.jpg"
                                    alt="Sustainability"
                                    className="w-full h-full object-cover"
                                    width={800}
                                    height={800}
                                />
                            </div>
                        </div>
                        <div className="space-y-6 md:col-start-1">
                            <h2 className="text-3xl font-serif text-text-earthy">Sustainable Luxury</h2>
                            <p className="text-text-earthy/80 leading-relaxed">
                                We believe that luxury shouldn't come at the cost of our planet. That's why we use eco-friendly production methods and plastic-free packaging. Our commitment to sustainability is woven into everything we do.
                            </p>
                            <p className="text-text-earthy/80 leading-relaxed">
                                From our Oeko-Tex certified fabrics to our carbon-neutral shipping, we're dedicated to minimizing our environmental footprint while maximizing your comfort.
                            </p>
                        </div>
                    </section>

                    <section className="bg-white p-12 rounded-3xl shadow-sm text-center space-y-8">
                        <h2 className="text-3xl font-serif text-text-earthy">The Grace Guarantee</h2>
                        <p className="text-text-earthy/80 max-w-2xl mx-auto leading-relaxed">
                            We stand behind the quality of our products. If you don't absolutely love your Grace's Towel, simply return it within 30 days for a full refund. No questions asked.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
