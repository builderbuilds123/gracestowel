import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCustomer, getAuthToken } from '../context/CustomerContext';
import { medusaFetch } from '../lib/medusa-fetch';
import { Package, MapPin, User, LogOut, ChevronRight } from 'lucide-react';
import { createLogger } from '../lib/logger';

export function meta() {
    return [
        { title: 'My Account | Grace\'s Towel' },
        { name: 'description', content: 'Manage your Grace\'s Towel account, view orders, and update your profile' },
    ];
}

interface Order {
    id: string;
    display_id: number;
    status: string;
    created_at: string;
    total: number;
    currency_code: string;
    items: Array<{
        id: string;
        title: string;
        quantity: number;
        unit_price: number;
    }>;
}



export default function AccountPage() {
    const navigate = useNavigate();
    const { customer, isAuthenticated, isLoading, logout } = useCustomer();
    const [orders, setOrders] = useState<Order[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'orders' | 'addresses' | 'profile'>('orders');

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            navigate('/account/login');
        }
    }, [isLoading, isAuthenticated, navigate]);

    // Fetch orders
    useEffect(() => {
        async function fetchOrders() {
            const token = getAuthToken();
            if (!token) return;

            try {
                const response = await medusaFetch(`/store/orders`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    label: 'account-orders',
                });

                if (response.ok) {
                    const data = (await response.json()) as { orders: Order[] };
                    setOrders(data.orders || []);
                }
            } catch (error) {
                const logger = createLogger({ context: "account-orders" });
                logger.error("Failed to fetch orders", error instanceof Error ? error : new Error(String(error)));
            } finally {
                setOrdersLoading(false);
            }
        }

        if (isAuthenticated) {
            fetchOrders();
        }
    }, [isAuthenticated]);

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-earthy"></div>
            </div>
        );
    }

    if (!customer) return null;

    const formatPrice = (amount: number, currency: string = 'usd') => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            pending: 'bg-yellow-100 text-yellow-800',
            completed: 'bg-green-100 text-green-800',
            canceled: 'bg-red-100 text-red-800',
            archived: 'bg-gray-100 text-gray-800',
        };
        return styles[status] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-12">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-serif text-text-earthy">
                        Welcome, {customer.first_name || 'Friend'}!
                    </h1>
                    <p className="text-text-earthy/70">{customer.email}</p>
                </div>
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2 text-text-earthy/70 hover:text-text-earthy transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-gray-200 mb-8">
                {[
                    { id: 'orders', label: 'Order History', icon: Package },
                    { id: 'addresses', label: 'Addresses', icon: MapPin },
                    { id: 'profile', label: 'Profile', icon: User },
                ].map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id as typeof activeTab)}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                            activeTab === id
                                ? 'border-accent-earthy text-accent-earthy'
                                : 'border-transparent text-text-earthy/70 hover:text-text-earthy'
                        }`}
                    >
                        <Icon className="w-5 h-5" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Orders Tab */}
            {activeTab === 'orders' ? (
                <div className="space-y-4">
                    {ordersLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-earthy mx-auto"></div>
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
                            <Package className="w-12 h-12 text-text-earthy/30 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-text-earthy mb-2">No orders yet</h3>
                            <p className="text-text-earthy/70 mb-4">Start shopping to see your orders here</p>
                            <Link
                                to="/towels"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors"
                            >
                                Browse Towels
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        </div>
                    ) : (
                        orders.map((order) => (
                            <div key={order.id} className="bg-white rounded-2xl shadow-sm p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <span className="text-sm text-text-earthy/70">Order #{order.display_id}</span>
                                        <p className="font-medium text-text-earthy">{formatDate(order.created_at)}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(order.status)}`}>
                                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                        </span>
                                        <p className="font-medium text-text-earthy mt-1">
                                            {formatPrice(order.total, order.currency_code)}
                                        </p>
                                    </div>
                                </div>
                                <div className="border-t pt-4">
                                    <p className="text-sm text-text-earthy/70">
                                        {order.items.map(item => `${item.quantity}x ${item.title}`).join(', ')}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : null}

            {/* Addresses Tab */}
            {activeTab === 'addresses' ? (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                    {customer.addresses && customer.addresses.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-2">
                            {customer.addresses.map((address) => (
                                <div key={address.id} className="border rounded-lg p-4">
                                    <p className="font-medium text-text-earthy">
                                        {address.first_name} {address.last_name}
                                    </p>
                                    <p className="text-text-earthy/70 text-sm mt-1">
                                        {address.address_1}
                                        {address.address_2 && <>, {address.address_2}</>}
                                    </p>
                                    <p className="text-text-earthy/70 text-sm">
                                        {address.city}, {address.province} {address.postal_code}
                                    </p>
                                    <p className="text-text-earthy/70 text-sm">{address.country_code?.toUpperCase()}</p>
                                    {address.is_default_shipping ? (
                                        <span className="inline-block mt-2 px-2 py-1 bg-accent-earthy/10 text-accent-earthy text-xs rounded">
                                            Default Shipping
                                        </span>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <MapPin className="w-12 h-12 text-text-earthy/30 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-text-earthy mb-2">No saved addresses</h3>
                            <p className="text-text-earthy/70">Addresses will be saved when you complete a checkout</p>
                        </div>
                    )}
                </div>
            ) : null}

            {/* Profile Tab */}
            {activeTab === 'profile' ? (
                <div className="bg-white rounded-2xl shadow-sm p-6 max-w-lg">
                    <h3 className="text-lg font-medium text-text-earthy mb-4">Profile Information</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-text-earthy/70 mb-1">Email</label>
                            <p className="text-text-earthy">{customer.email}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-text-earthy/70 mb-1">First Name</label>
                                <p className="text-text-earthy">{customer.first_name || '—'}</p>
                            </div>
                            <div>
                                <label className="block text-sm text-text-earthy/70 mb-1">Last Name</label>
                                <p className="text-text-earthy">{customer.last_name || '—'}</p>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-text-earthy/70 mb-1">Phone</label>
                            <p className="text-text-earthy">{customer.phone || '—'}</p>
                        </div>
                        <div>
                            <label className="block text-sm text-text-earthy/70 mb-1">Member Since</label>
                            <p className="text-text-earthy">{formatDate(customer.created_at)}</p>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

