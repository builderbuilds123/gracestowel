import { Link } from "react-router";
import { Instagram, Facebook, Twitter } from "../lib/icons";

export function Footer() {
    return (
        <footer className="bg-card-earthy/30 pt-16 pb-8 mt-auto">
            <div className="container mx-auto px-4 md:px-8">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-12">
                    {/* Brand */}
                    <div className="col-span-1 md:col-span-1">
                        <h3 className="text-2xl font-sigmar text-text-earthy mb-4">Grace's Towel</h3>
                        <p className="text-text-earthy/70 text-sm leading-relaxed mb-6">
                            Luxury comfort, naturally. Sustainably sourced cotton towels designed for your daily rituals.
                        </p>
                        <div className="flex gap-4">
                            <a href="#" className="text-text-earthy/60 hover:text-accent-earthy transition-colors">
                                <Instagram className="w-5 h-5" />
                            </a>
                            <a href="#" className="text-text-earthy/60 hover:text-accent-earthy transition-colors">
                                <Facebook className="w-5 h-5" />
                            </a>
                            <a href="#" className="text-text-earthy/60 hover:text-accent-earthy transition-colors">
                                <Twitter className="w-5 h-5" />
                            </a>
                        </div>
                    </div>

                    {/* About */}
                    <div>
                        <h4 className="font-serif font-bold text-text-earthy mb-6">About</h4>
                        <ul className="space-y-3 text-sm text-text-earthy/70">
                            <li><Link to="/about" className="hover:text-accent-earthy transition-colors">About Us</Link></li>
                            <li><Link to="/blog" className="hover:text-accent-earthy transition-colors">Blog</Link></li>
                        </ul>
                    </div>

                    {/* Need Help? */}
                    <div>
                        <h4 className="font-serif font-bold text-text-earthy mb-6">Need Help?</h4>
                        <ul className="space-y-3 text-sm text-text-earthy/70">
                            <li><Link to="/faq" className="hover:text-accent-earthy transition-colors">FAQ</Link></li>
                            <li><Link to="/returns" className="hover:text-accent-earthy transition-colors">Returns & Exchanges</Link></li>
                            <li><Link to="/care-guide" className="hover:text-accent-earthy transition-colors">Care Guide</Link></li>
                        </ul>
                    </div>

                    {/* Get in Touch */}
                    <div>
                        <h4 className="font-serif font-bold text-text-earthy mb-6">Get in Touch</h4>
                        <ul className="space-y-3 text-sm text-text-earthy/70">
                            <li><Link to="/contact" className="hover:text-accent-earthy transition-colors">Contact Us</Link></li>
                        </ul>
                    </div>

                    {/* Newsletter */}
                    <div>
                        <h4 className="font-serif font-bold text-text-earthy mb-6">Stay in Touch</h4>
                        <p className="text-text-earthy/70 text-sm mb-4">
                            Subscribe to receive updates, access to exclusive deals, and more.
                        </p>
                        <form className="flex gap-2">
                            <input
                                type="email"
                                placeholder="Enter your email"
                                className="flex-1 px-3 py-2 bg-white border border-card-earthy rounded text-sm focus:outline-none focus:border-accent-earthy"
                            />
                            <button className="px-4 py-2 bg-accent-earthy text-white text-sm font-semibold rounded hover:bg-accent-earthy/90 transition-colors">
                                Join
                            </button>
                        </form>
                    </div>
                </div>

                <div className="border-t border-card-earthy pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-text-earthy/50">
                    <p>&copy; 2025 Grace's Towel. All rights reserved.</p>
                    <div className="flex gap-6">
                        <Link to="/privacy" className="hover:text-text-earthy">Privacy Policy</Link>
                        <Link to="/terms" className="hover:text-text-earthy">Terms of Service</Link>
                    </div>
                </div>
            </div>
        </footer >
    );
}
