import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCustomer } from '../context/CustomerContext';
import { useMedusaCart } from '../context/MedusaCartContext';
import { Eye, EyeOff, Mail, Lock } from '../lib/icons';

export function meta() {
    return [
        { title: 'Login | Grace\'s Towel' },
        { name: 'description', content: 'Sign in to your Grace\'s Towel account' },
    ];
}

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, loginWithGoogle, isLoading: authLoading } = useCustomer();
    const { cartId } = useMedusaCart();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        const result = await login(email, password, cartId);
        
        if (result.success) {
            navigate('/account');
        } else {
            setError(result.error || 'Login failed');
        }
        
        setIsSubmitting(false);
    };

    const handleGoogleLogin = async () => {
        setError(null);
        setIsGoogleLoading(true);

        const result = await loginWithGoogle(cartId);
        
        if (!result.success) {
            setError(result.error || 'Google sign in failed');
            setIsGoogleLoading(false);
        }
        // If successful, user will be redirected to Google OAuth page
        // The callback route will handle the rest
    };

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-serif text-text-earthy mb-2">Welcome Back</h1>
                    <p className="text-text-earthy/70">Sign in to access your account</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
                    {error ? (
                        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    ) : null}

                    {/* Google Sign In Button */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={isGoogleLoading || isSubmitting || authLoading}
                        className="w-full py-3 border-2 border-gray-300 text-text-earthy font-semibold rounded-lg hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                        {isGoogleLoading ? (
                            <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-text-earthy"></div>
                                <span>Signing in...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path
                                        fill="#4285F4"
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    />
                                    <path
                                        fill="#34A853"
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    />
                                    <path
                                        fill="#FBBC05"
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    />
                                    <path
                                        fill="#EA4335"
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    />
                                </svg>
                                <span>Sign in with Google</span>
                            </>
                        )}
                    </button>

                    {/* Divider */}
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-text-earthy/70">Or continue with email</span>
                        </div>
                    </div>

                    {/* Email Field */}
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-text-earthy mb-2">
                            Email Address
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-earthy/40" />
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent transition-all"
                                placeholder="you@example.com"
                            />
                        </div>
                    </div>

                    {/* Password Field */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label htmlFor="password" className="block text-sm font-medium text-text-earthy">
                                Password
                            </label>
                            <Link to="/account/forgot-password" className="text-sm text-accent-earthy hover:underline">
                                Forgot password?
                            </Link>
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-earthy/40" />
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full pl-11 pr-12 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent transition-all"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-earthy/40 hover:text-text-earthy transition-colors"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isSubmitting || authLoading}
                        className="w-full py-3 bg-accent-earthy text-white font-semibold rounded-lg hover:bg-accent-earthy/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isSubmitting ? 'Signing In...' : 'Sign In'}
                    </button>

                    {/* Register Link */}
                    <p className="text-center text-text-earthy/70 text-sm">
                        Don't have an account?{' '}
                        <Link to="/account/register" className="text-accent-earthy font-medium hover:underline">
                            Create one
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
}

