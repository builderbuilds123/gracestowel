import { Link } from "react-router";

import { posts } from "../data/blogPosts";

export default function Blog() {

    return (
        <div className="min-h-screen bg-background-earthy">
            <div className="container mx-auto px-4 py-16 max-w-6xl">
                <div className="text-center mb-16">
                    <h1 className="text-4xl md:text-5xl font-serif text-text-earthy mb-6">The Journal</h1>
                    <p className="text-xl text-text-earthy/60 max-w-2xl mx-auto leading-relaxed">
                        Stories about comfort, design, and the pursuit of the perfect home.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {posts.map((post) => (
                        <article key={post.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                            <div className="aspect-[3/2] overflow-hidden">
                                <img
                                    src={post.image}
                                    alt={post.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                            </div>
                            <div className="p-8 space-y-4">
                                <div className="flex items-center gap-4 text-sm text-text-earthy/60">
                                    <span className="text-accent-earthy font-medium">{post.category}</span>
                                    <span>•</span>
                                    <span>{post.date}</span>
                                </div>
                                <h2 className="text-2xl font-serif text-text-earthy group-hover:text-accent-earthy transition-colors">
                                    {post.title}
                                </h2>
                                <p className="text-text-earthy/80 leading-relaxed">
                                    {post.excerpt}
                                </p>
                                <Link
                                    to={`/blog/${post.id}`}
                                    className="inline-block text-accent-earthy font-medium hover:underline pt-2"
                                >
                                    Read Article &rarr;
                                </Link>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </div>
    );
}
