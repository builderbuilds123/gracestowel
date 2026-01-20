import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router';
import { useCustomer } from '../context/CustomerContext';
import { Eye, EyeOff, Lock, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

export function meta() {
    return [
        { title: 'Reset Password | Grace\'s Towel' },
        { name: 'description', content: 'Set a new password for your Grace\'s Towel account' },
    ];
}

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { updatePassword } = useCustomer();
    
    const token = searchParams.get('token');
    
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            setError('Invalid or expired password reset link. Please request a new one.');
        }
    }, [token]);

    useEffect(() => {
        if (isSuccess) {
            const timer = setTimeout(() => {
                navigate('/account/login');
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [isSuccess, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters long');
            return;
        }

        if (!token) {
            setError('Missing reset token');
            return;
        }

        setIsSubmitting(true);

        const result = await updatePassword(password, token);
        
        if (result.success) {
            setIsSuccess(true);

        } else {
            setError(result.error || 'Failed to reset password. The link may have expired.');
        }
        
        setIsSubmitting(false);
    };

    if (isSuccess) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
                <div className="w-full max-w-md text-center bg-white rounded-2xl shadow-lg p-8 space-y-6">
                    <div className="flex justify-center">
                        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-10 h-10 text-green-500" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-serif text-text-earthy">Password Reset Successful</h1>
                    <p className="text-text-earthy/70">
                        Your password has been updated. You can now sign in with your new password.
                    </p>
                    <p className="text-sm text-text-earthy/50 italic">
                        Redirecting you to login in a moment...
                    </p>
                    <div className="pt-4">
                        <Link 
                            to="/account/login" 
                            className="w-full inline-block py-3 bg-accent-earthy text-white font-semibold rounded-lg hover:bg-accent-earthy/90 transition-all"
                        >
                            Sign In Now
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (!token && error) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
                <div className="w-full max-w-md text-center bg-white rounded-2xl shadow-lg p-8 space-y-6">
                    <div className="flex justify-center">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-10 h-10 text-red-500" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-serif text-text-earthy">Invalid Reset Link</h1>
                    <p className="text-text-earthy/70">
                        {error}
                    </p>
                    <div className="pt-4 flex flex-col gap-3">
                        <Link 
                            to="/account/forgot-password" 
                            className="w-full py-3 bg-accent-earthy text-white font-semibold rounded-lg hover:bg-accent-earthy/90 transition-all"
                        >
                            Request New Link
                        </Link>
                        <Link 
                            to="/account/login" 
                            className="text-text-earthy/70 text-sm hover:text-accent-earthy transition-colors"
                        >
                            Back to login
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-serif text-text-earthy mb-2">Create New Password</h1>
                    <p className="text-text-earthy/70">Please enter your new password below.</p>
                </div>

                {/* Reset Password Form */}
                <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
                    {error && (
                        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Password Field */}
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-text-earthy mb-2">
                            New Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-earthy/40" />
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
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
                        <p className="mt-1 text-xs text-text-earthy/50">At least 8 characters long</p>
                    </div>

                    {/* Confirm Password Field */}
                    <div>
                        <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-earthy mb-2">
                            Confirm New Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-earthy/40" />
                            <input
                                id="confirmPassword"
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="w-full pl-11 pr-12 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3 bg-accent-earthy text-white font-semibold rounded-lg hover:bg-accent-earthy/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isSubmitting ? 'Updating Password...' : 'Reset Password'}
                    </button>

                    {/* Back to Login */}
                    <div className="text-center">
                        <Link 
                            to="/account/login" 
                            className="text-text-earthy/70 text-sm hover:text-accent-earthy transition-colors flex items-center justify-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Cancel and go back
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
