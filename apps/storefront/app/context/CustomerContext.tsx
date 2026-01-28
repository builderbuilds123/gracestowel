import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { medusaFetch } from '../lib/medusa-fetch';
import { monitoredFetch } from '../utils/monitored-fetch';
import { createLogger } from '../lib/logger';
import { getCachedStorage, setCachedStorage, removeCachedStorage } from '../lib/storage-cache';

const logger = createLogger({ context: "CustomerContext" });

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
    login: (email: string, password: string, cartId?: string) => Promise<{ success: boolean; error?: string }>;
    loginWithGoogle: (cartId?: string) => Promise<{ success: boolean; error?: string }>;
    register: (email: string, password: string, firstName?: string, lastName?: string, cartId?: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<void>;
    refreshCustomer: () => Promise<void>;
    requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
    updatePassword: (password: string, token: string) => Promise<{ success: boolean; error?: string }>;
}

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);



const TOKEN_KEY = 'medusa_customer_token';

export function CustomerProvider({ children }: { children: React.ReactNode }) {
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [token, setToken] = useState<string | null>(null);

    // Load token from localStorage on mount (Issue #25: Use cached storage)
    useEffect(() => {
        const savedToken = getCachedStorage(TOKEN_KEY); // Cached read
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
            const response = await medusaFetch(`/store/customers/me`, {
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
                        logger.info('[PostHog] User identified', { customerId: data.customer.id });
                    });
                }
            } else {
                // Token is invalid, clear it (Issue #25: Use cached storage)
                removeCachedStorage(TOKEN_KEY);
                setToken(null);
                setCustomer(null);
            }
        } catch (error) {
            logger.error('Failed to fetch customer', error as Error);
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (email: string, password: string, cartId?: string): Promise<{ success: boolean; error?: string }> => {
        try {
            // Step 1: Authenticate with email/password
            const authResponse = await medusaFetch(`/auth/customer/emailpass`, {
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
            
            // Store token and update state (Issue #25: Use cached storage)
            setCachedStorage(TOKEN_KEY, newToken);
            setToken(newToken);

            // Step 2: Transfer cart if guest cart exists
            if (cartId) {
                try {
                    await monitoredFetch(`/api/carts/${cartId}/transfer`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${newToken}`,
                        },
                        label: 'cart-transfer-on-login',
                    });
                    logger.info('Cart transferred successfully', { cartId });
                } catch (err) {
                    logger.error('Failed to transfer cart during login', err as Error);
                    // Continue anyway, as login was successful
                }
            }

            return { success: true };
        } catch (error) {
            logger.error('Login error', error as Error);
            return { success: false, error: 'An error occurred during login' };
        }
    };

    const loginWithGoogle = async (cartId?: string): Promise<{ success: boolean; error?: string }> => {
        try {
            // Step 1: Initiate Google OAuth flow
            const authResponse = await medusaFetch(`/auth/customer/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                label: 'google-oauth-initiate',
            });

            if (!authResponse.ok) {
                const error = (await authResponse.json()) as { message?: string };
                return { success: false, error: error.message || 'Failed to initiate Google sign in' };
            }

            const result = await authResponse.json();

            // Step 2: Check if we got a redirect URL (new OAuth flow)
            if (typeof result === 'object' && result.location) {
                // Store cartId in sessionStorage so callback can transfer cart
                if (cartId) {
                    sessionStorage.setItem('google_auth_cart_id', cartId);
                }
                // Redirect to Google OAuth
                window.location.href = result.location;
                // Return success immediately - actual auth happens in callback
                return { success: true };
            }

            // Step 3: Check if we got a token (user already authenticated)
            if (typeof result === 'string' || (typeof result === 'object' && result.token)) {
                const token = typeof result === 'string' ? result : result.token;
                
                // Store token and update state
                setCachedStorage(TOKEN_KEY, token);
                setToken(token);

                // Transfer cart if guest cart exists
                if (cartId) {
                    try {
                        await monitoredFetch(`/api/carts/${cartId}/transfer`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`,
                            },
                            label: 'cart-transfer-google-auth',
                        });
                        logger.info('Cart transferred successfully', { cartId });
                    } catch (err) {
                        logger.error('Failed to transfer cart during Google login', err as Error);
                        // Continue anyway, as login was successful
                    }
                }

                return { success: true };
            }

            // Step 4: Unexpected response format
            logger.error('Unexpected Google auth response format', new Error('Invalid response'), { result });
            return { success: false, error: 'Unexpected authentication response. Please try again.' };
        } catch (error) {
            logger.error('Google login error', error as Error);
            return { success: false, error: 'An error occurred during Google sign in' };
        }
    };

    const register = async (
        email: string, 
        password: string, 
        firstName?: string, 
        lastName?: string,
        cartId?: string
    ): Promise<{ success: boolean; error?: string }> => {
        try {
            // Step 1: Register auth identity
            const authResponse = await medusaFetch(`/auth/customer/emailpass/register`, {
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
            const customerResponse = await medusaFetch(`/store/customers`, {
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

            // Store token and update state (Issue #25: Use cached storage)
            setCachedStorage(TOKEN_KEY, regToken);
            setToken(regToken);

            // Step 3: Transfer cart if guest cart exists
            if (cartId) {
                try {
                    await monitoredFetch(`/api/carts/${cartId}/transfer`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${regToken}`,
                        },
                        label: 'cart-transfer-on-register',
                    });
                    logger.info('Cart transferred successfully', { cartId });
                } catch (err) {
                    logger.error('Failed to transfer cart during registration', err as Error);
                }
            }

            return { success: true };
        } catch (error) {
            logger.error('Registration error', error as Error);
            return { success: false, error: 'An error occurred during registration' };
        }
    };

    const logout = async () => {
        removeCachedStorage(TOKEN_KEY); // Issue #25: Use cached storage
        setToken(null);
        setCustomer(null);
        
        // Reset PostHog identification
        if (typeof window !== 'undefined') {
            import('../utils/posthog').then(({ default: posthog }) => {
                posthog.reset();
                logger.info('[PostHog] User identification reset');
            });
        }
    };

    const requestPasswordReset = async (email: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const response = await medusaFetch(`/auth/customer/emailpass/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: email }),
                label: 'customer-reset-password-request',
            });

            if (!response.ok) {
                const error = (await response.json()) as { message?: string };
                return { success: false, error: error.message || 'Failed to request password reset' };
            }

            return { success: true };
        } catch (error) {
            logger.error('Password reset request error', error as Error);
            return { success: false, error: 'An error occurred while requesting password reset' };
        }
    };

    const updatePassword = async (password: string, token: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const response = await medusaFetch(`/auth/customer/emailpass/update-provider`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ password }),
                label: 'customer-update-password',
            });

            if (!response.ok) {
                const error = (await response.json()) as { message?: string };
                return { success: false, error: error.message || 'Failed to update password' };
            }

            return { success: true };
        } catch (error) {
            logger.error('Password update error', error as Error);
            return { success: false, error: 'An error occurred while updating password' };
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
                loginWithGoogle,
                register,
                logout,
                refreshCustomer,
                requestPasswordReset,
                updatePassword,
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
    // Issue #25: Use cached storage
    return getCachedStorage(TOKEN_KEY);
}

