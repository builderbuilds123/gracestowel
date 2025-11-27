import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCustomer } from '../context/CustomerContext';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';

export function meta() {
    return [
        { title: 'Login | Grace\'s Towel' },
        { name: 'description', content: 'Sign in to your Grace\'s Towel account' },
    ];
}

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, isLoading: authLoading } = useCustomer();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        const result = await login(email, password);
        
        if (result.success) {
            navigate('/account');
        } else {
            setError(result.error || 'Login failed');
        }
        
        setIsSubmitting(false);
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
                    {error && (
                        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

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
                        <label htmlFor="password" className="block text-sm font-medium text-text-earthy mb-2">
                            Password
                        </label>
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

