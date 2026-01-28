import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { medusaFetch } from '../lib/medusa-fetch';
import { monitoredFetch } from '../utils/monitored-fetch';
import { createLogger } from '../lib/logger';
import { getCachedStorage, setCachedStorage } from '../lib/storage-cache';
import { useMedusaCart } from '../context/MedusaCartContext';

const logger = createLogger({ context: 'google-oauth-callback' });
const TOKEN_KEY = 'medusa_customer_token';

/**
 * Decode JWT payload without verification (for reading actor_id claim).
 * JWTs are base64url encoded: header.payload.signature
 */
function decodeJwtPayload(token: string): { actor_id?: string; user_metadata?: { email?: string } } | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        // Decode payload (second part)
        const payload = parts[1];
        // Convert base64url to base64
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        // Decode
        const jsonString = atob(base64);
        return JSON.parse(jsonString);
    } catch {
        return null;
    }
}

export function meta() {
    return [
        { title: 'Google Sign In | Grace\'s Towel' },
        { name: 'description', content: 'Completing Google authentication' },
    ];
}

export default function GoogleCallbackPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { cartId: cartIdFromContext } = useMedusaCart();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Get cartId from context or sessionStorage (stored during OAuth initiation)
    const cartId = cartIdFromContext || (typeof window !== 'undefined' ? sessionStorage.getItem('google_auth_cart_id') : null);

    // Get all query parameters from Google OAuth redirect
    const queryParams = useMemo(() => {
        const params: Record<string, string> = {};
        searchParams.forEach((value, key) => {
            params[key] = value;
        });
        return params;
    }, [searchParams]);

    useEffect(() => {
        const handleCallback = async () => {
            try {
                // Check for error from Google
                if (queryParams.error) {
                    logger.error('Google OAuth error', new Error(queryParams.error), { error_description: queryParams.error_description });
                    setStatus('error');
                    setErrorMessage(queryParams.error_description || 'Authentication failed. Please try again.');
                    return;
                }

                // Validate callback has required parameters
                if (!queryParams.code) {
                    logger.error('Missing authorization code in callback');
                    setStatus('error');
                    setErrorMessage('Invalid authentication response. Please try again.');
                    return;
                }

                // Step 1: Validate callback with Medusa
                logger.info('Validating OAuth callback', { hasCode: !!queryParams.code, hasState: !!queryParams.state });
                
                const callbackResponse = await medusaFetch(`/auth/customer/google/callback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(queryParams),
                    label: 'google-oauth-callback',
                });

                if (!callbackResponse.ok) {
                    const error = (await callbackResponse.json()) as { message?: string };
                    logger.error('Callback validation failed', new Error(error.message || 'Unknown error'));
                    setStatus('error');
                    setErrorMessage(error.message || 'Authentication failed. Please try again.');
                    return;
                }

                const { token } = (await callbackResponse.json()) as { token: string };
                
                if (!token) {
                    logger.error('No token received from callback');
                    setStatus('error');
                    setErrorMessage('Authentication failed. Please try again.');
                    return;
                }

                // Step 2: Decode token to check if customer exists
                const decoded = decodeJwtPayload(token);
                const hasActorId = !!decoded?.actor_id;
                const email = decoded?.user_metadata?.email;

                logger.info('Token decoded', { hasActorId, email: email ? '***' : undefined });

                // Step 3: If customer doesn't exist, create it
                if (!hasActorId && email) {
                    logger.info('Creating new customer', { email: '***' });
                    
                    const createResponse = await medusaFetch(`/store/customers`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({ email }),
                        label: 'create-customer-google',
                    });

                    if (!createResponse.ok) {
                        const error = (await createResponse.json()) as { message?: string };
                        logger.error('Failed to create customer', new Error(error.message || 'Unknown error'));
                        setStatus('error');
                        setErrorMessage(error.message || 'Failed to create account. Please try again.');
                        return;
                    }

                    // Step 4: Refresh token after creating customer
                    logger.info('Refreshing token after customer creation');
                    const refreshResponse = await medusaFetch(`/auth/customer/token/refresh`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        label: 'refresh-token-google',
                    });

                    if (!refreshResponse.ok) {
                        logger.warn('Token refresh failed, using original token', { status: refreshResponse.status });
                        // Continue with original token - it should still work
                    } else {
                        const { token: newToken } = (await refreshResponse.json()) as { token: string };
                        if (newToken) {
                            // Use the refreshed token
                            setCachedStorage(TOKEN_KEY, newToken);
                            // Clean up and redirect - CustomerContext will pick up token from localStorage
                            if (typeof window !== 'undefined') {
                                sessionStorage.removeItem('google_auth_cart_id');
                            }
                            setStatus('success');
                            setTimeout(() => {
                                navigate('/account');
                            }, 500);
                            return;
                        }
                    }
                }

                // Step 5: Store token and transfer cart
                setCachedStorage(TOKEN_KEY, token);

                // Transfer guest cart if exists
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
                        logger.error('Failed to transfer cart during Google auth', err as Error);
                        // Continue anyway, as auth was successful
                    }
                }

                // Step 6: Clean up sessionStorage and redirect to account page
                if (typeof window !== 'undefined') {
                    sessionStorage.removeItem('google_auth_cart_id');
                }
                setStatus('success');
                setTimeout(() => {
                    navigate('/account');
                }, 500);
            } catch (error) {
                logger.error('Google OAuth callback error', error as Error);
                setStatus('error');
                setErrorMessage('An unexpected error occurred. Please try again.');
            }
        };

        handleCallback();
    }, [queryParams, navigate, cartId]);

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md text-center">
                {status === 'loading' && (
                    <div className="space-y-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-earthy mx-auto"></div>
                        <h1 className="text-2xl font-serif text-text-earthy">Completing Sign In</h1>
                        <p className="text-text-earthy/70">Please wait while we complete your Google sign in...</p>
                    </div>
                )}

                {status === 'success' && (
                    <div className="space-y-4">
                        <div className="text-green-600 text-4xl mb-4">✓</div>
                        <h1 className="text-2xl font-serif text-text-earthy">Sign In Successful</h1>
                        <p className="text-text-earthy/70">Redirecting to your account...</p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="space-y-4">
                        <div className="text-red-600 text-4xl mb-4">✗</div>
                        <h1 className="text-2xl font-serif text-text-earthy">Sign In Failed</h1>
                        <p className="text-text-earthy/70 mb-6">{errorMessage}</p>
                        <div className="space-y-2">
                            <button
                                onClick={() => navigate('/account/login')}
                                className="w-full py-3 bg-accent-earthy text-white font-semibold rounded-lg hover:bg-accent-earthy/90 transition-all"
                            >
                                Back to Login
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full py-3 border border-gray-300 text-text-earthy font-semibold rounded-lg hover:bg-gray-50 transition-all"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
