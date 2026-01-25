/**
 * Order Return Route (Placeholder)
 *
 * Future implementation for requesting returns on delivered orders.
 * Currently displays a placeholder message.
 *
 * @see docs/product/epics/order-modification-v2.md
 */
import { Link, useParams } from "react-router";
import { ArrowLeft, Package } from "../lib/icons";

export default function OrderReturnPage() {
    const { id } = useParams();

    return (
        <div className="min-h-screen bg-background-earthy py-12 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Back Link */}
                <Link
                    to={`/order/status/${id}`}
                    className="inline-flex items-center gap-2 text-accent-earthy hover:underline mb-8"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Order
                </Link>

                {/* Main Content */}
                <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="w-20 h-20 bg-accent-earthy/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Package className="w-10 h-10 text-accent-earthy" />
                    </div>

                    <h1 className="text-3xl font-serif text-text-earthy mb-4">
                        Request a Return
                    </h1>

                    <p className="text-text-earthy/70 mb-6 max-w-md mx-auto">
                        Our return process is coming soon. In the meantime, please contact our support team
                        to initiate a return for your order.
                    </p>

                    <div className="bg-card-earthy/30 rounded-lg p-6 mb-6">
                        <h2 className="font-medium text-text-earthy mb-2">Return Policy</h2>
                        <ul className="text-sm text-text-earthy/70 text-left space-y-2">
                            <li>• Returns accepted within 30 days of delivery</li>
                            <li>• Items must be unused and in original packaging</li>
                            <li>• Free return shipping on defective items</li>
                            <li>• Refunds processed within 5-7 business days</li>
                        </ul>
                    </div>

                    <a
                        href="mailto:support@gracestowel.com?subject=Return Request"
                        className="inline-block px-8 py-3 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors font-medium"
                    >
                        Contact Support
                    </a>

                    <p className="text-sm text-text-earthy/50 mt-4">
                        Or email us at support@gracestowel.com
                    </p>
                </div>
            </div>
        </div>
    );
}
