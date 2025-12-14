import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { monitoredFetch } from '../utils/monitored-fetch';

export interface CustomerAddress {
    id: string;
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    province?: string;
    postal_code: string;
    country_code: string;
    phone?: string;
    is_default_shipping?: boolean;
    is_default_billing?: boolean;
}

export interface Customer {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    addresses?: CustomerAddress[];
    created_at: string;
}

interface CustomerContextType {
    customer: Customer | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<void>;
    refreshCustomer: () => Promise<void>;
}

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

const MEDUSA_BACKEND_URL = typeof window !== 'undefined' 
    ? (window as unknown as { ENV?: { MEDUSA_BACKEND_URL?: string } }).ENV?.MEDUSA_BACKEND_URL || 'http://localhost:9000'
    : 'http://localhost:9000';

const TOKEN_KEY = 'medusa_customer_token';

export function CustomerProvider({ children }: { children: React.ReactNode }) {
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [token, setToken] = useState<string | null>(null);

    // Load token from localStorage on mount
    useEffect(() => {
        const savedToken = localStorage.getItem(TOKEN_KEY);
        if (savedToken) {
            setToken(savedToken);
        } else {
            setIsLoading(false);
        }
    }, []);

    // Fetch customer when token changes
    useEffect(() => {
        if (token) {
            fetchCustomer();
        }
    }, [token]);

    const fetchCustomer = async () => {
        if (!token) {
            setIsLoading(false);
            return;
        }

        try {
            const response = await monitoredFetch(`${MEDUSA_BACKEND_URL}/store/customers/me`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                label: 'customer-me',
            });

            if (response.ok) {
                const data = (await response.json()) as { customer: Customer };
                setCustomer(data.customer);
                
                // Identify user in PostHog
                if (typeof window !== 'undefined' && data.customer) {
                    import('../utils/posthog').then(({ default: posthog }) => {
                        posthog.identify(data.customer.id, {
                            email: data.customer.email,
                            first_name: data.customer.first_name,
                            last_name: data.customer.last_name,
                            created_at: data.customer.created_at,
                        });
                        console.log('[PostHog] User identified:', data.customer.id);
                    });
                }
            } else {
                // Token is invalid, clear it
                localStorage.removeItem(TOKEN_KEY);
                setToken(null);
                setCustomer(null);
            }
        } catch (error) {
            console.error('Failed to fetch customer:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            // Step 1: Authenticate with email/password
            const authResponse = await monitoredFetch(`${MEDUSA_BACKEND_URL}/auth/customer/emailpass`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                label: 'customer-login',
            });

            if (!authResponse.ok) {
                const error = (await authResponse.json()) as { message?: string };
                return { success: false, error: error.message || 'Invalid email or password' };
            }

            const { token: newToken } = (await authResponse.json()) as { token: string };
            
            // Store token and update state
            localStorage.setItem(TOKEN_KEY, newToken);
            setToken(newToken);

            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'An error occurred during login' };
        }
    };

    const register = async (
        email: string, 
        password: string, 
        firstName?: string, 
        lastName?: string
    ): Promise<{ success: boolean; error?: string }> => {
        try {
            // Step 1: Register auth identity
            const authResponse = await monitoredFetch(`${MEDUSA_BACKEND_URL}/auth/customer/emailpass/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                label: 'customer-register-auth',
            });

            if (!authResponse.ok) {
                const error = (await authResponse.json()) as { message?: string };
                return { success: false, error: error.message || 'Registration failed' };
            }

            const { token: regToken } = (await authResponse.json()) as { token: string };

            // Step 2: Create customer profile
            const customerResponse = await monitoredFetch(`${MEDUSA_BACKEND_URL}/store/customers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${regToken}`,
                },
                body: JSON.stringify({
                    email,
                    first_name: firstName,
                    last_name: lastName,
                }),
                label: 'customer-register-profile',
            });

            if (!customerResponse.ok) {
                const error = (await customerResponse.json()) as { message?: string };
                return { success: false, error: error.message || 'Failed to create customer profile' };
            }

            // Store token and update state
            localStorage.setItem(TOKEN_KEY, regToken);
            setToken(regToken);

            return { success: true };
        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: 'An error occurred during registration' };
        }
    };

    const logout = async () => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setCustomer(null);
        
        // Reset PostHog identification
        if (typeof window !== 'undefined') {
            import('../utils/posthog').then(({ default: posthog }) => {
                posthog.reset();
                console.log('[PostHog] User identification reset');
            });
        }
    };

    const refreshCustomer = useCallback(async () => {
        await fetchCustomer();
    }, [token]);

    return (
        <CustomerContext.Provider
            value={{
                customer,
                isAuthenticated: !!customer,
                isLoading,
                login,
                register,
                logout,
                refreshCustomer,
            }}
        >
            {children}
        </CustomerContext.Provider>
    );
}

export function useCustomer() {
    const context = useContext(CustomerContext);
    if (context === undefined) {
        throw new Error('useCustomer must be used within a CustomerProvider');
    }
    return context;
}

/**
 * Get the stored auth token (for use in API calls)
 */
export function getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
}

