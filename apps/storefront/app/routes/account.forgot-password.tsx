import { useState } from 'react';
import { Link } from 'react-router';
import { useCustomer } from '../context/CustomerContext';
import { Mail, ArrowLeft, CheckCircle2 } from '../lib/icons';

export function meta() {
    return [
        { title: 'Forgot Password | Grace\'s Towel' },
        { name: 'description', content: 'Request a password reset for your Grace\'s Towel account' },
    ];
}

export default function ForgotPasswordPage() {
    const { requestPasswordReset } = useCustomer();
    
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        const result = await requestPasswordReset(email);
        
        if (result.success) {
            setIsSuccess(true);
        } else {
            setError(result.error || 'Failed to request password reset. Please try again.');
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
                    <h1 className="text-2xl font-serif text-text-earthy">Check your email</h1>
                    <p className="text-text-earthy/70">
                        We've sent password reset instructions to <span className="font-semibold">{email}</span>.
                    </p>
                    <div className="pt-4">
                        <Link 
                            to="/account/login" 
                            className="text-accent-earthy font-medium hover:underline flex items-center justify-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
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
                    <h1 className="text-3xl font-serif text-text-earthy mb-2">Forgot Password?</h1>
                    <p className="text-text-earthy/70">Enter your email and we'll send you a link to reset your password.</p>
                </div>

                {/* Forgot Password Form */}
                <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
                    {error ? (
                        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    ) : null}

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

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3 bg-accent-earthy text-white font-semibold rounded-lg hover:bg-accent-earthy/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isSubmitting ? 'Sending Link...' : 'Send Reset Link'}
                    </button>

                    {/* Back to Login */}
                    <div className="text-center">
                        <Link 
                            to="/account/login" 
                            className="text-text-earthy/70 text-sm hover:text-accent-earthy transition-colors flex items-center justify-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to login
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
