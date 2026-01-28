import { useParams, Link } from "react-router";
import { posts } from "../data/blogPosts";
import { ArrowLeft } from "../lib/icons";

export default function BlogPost() {
    const { id } = useParams();
    const post = posts.find((p) => p.id === Number(id));

    if (!post) {
        return (
            <div className="min-h-screen bg-background-earthy flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-4xl font-serif text-text-earthy mb-4">Post Not Found</h1>
                    <Link to="/blog" className="text-accent-earthy hover:underline">Return to Journal</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-earthy pt-20 pb-16">
            <article className="container mx-auto px-4 max-w-3xl">
                <div className="mb-8">
                    <Link to="/blog" className="inline-flex items-center text-text-earthy/60 hover:text-accent-earthy transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Journal
                    </Link>
                </div>

                <header className="mb-12 text-center">
                    <div className="flex items-center justify-center gap-4 text-sm text-text-earthy/60 mb-6">
                        <span className="text-accent-earthy font-medium">{post.category}</span>
                        <span>•</span>
                        <span>{post.date}</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-serif text-text-earthy mb-8 leading-tight">
                        {post.title}
                    </h1>
                </header>

                <div className="aspect-[2/1] overflow-hidden rounded-2xl mb-12 shadow-sm">
                    <img
                        src={post.image}
                        alt={post.title}
                        className="w-full h-full object-cover"
                    />
                </div>

                <div
                    className="prose prose-stone prose-lg max-w-none prose-headings:font-serif prose-headings:text-text-earthy prose-p:text-text-earthy/80 prose-a:text-accent-earthy"
                    dangerouslySetInnerHTML={{ __html: post.content || "" }}
                />
            </article>
        </div>
    );
}
