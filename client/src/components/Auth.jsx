import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { FaSpinner } from 'react-icons/fa';
import { validateLoginForm, sanitizeInput } from '../utils/validation';

// --- BRAND COLORS ---
const COLORS = {
 primaryBlue: '#2D3E50', 
 secondaryBlue: '#0A738A',
 lightGray: '#F9FAFB', 
 darkGrayText: '#374151',
};

// --- Reusable Styled Input ---
const FormInput = ({ label, name, error, ...props }) => (
    <div>
        <label 
            htmlFor={name} 
            className="block text-sm font-medium" 
            style={{ color: COLORS.darkGrayText }}
        >
            {label}
        </label>
        <input
            id={name}
            name={name}
            {...props}
            className={`w-full px-4 py-3 mt-1 border rounded-lg shadow-sm focus:outline-none focus:ring-2 ${
                error ? 'border-red-500' : 'border-slate-300'
            }`}
            style={{ '--tw-ring-color': error ? '#EF4444' : COLORS.secondaryBlue }}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
);

export default function AuthPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const navigate = useNavigate();

    // Clear any stale auth state on mount
    useEffect(() => {
        window.__authRedirecting = false;
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setFieldErrors({});

        // Sanitize inputs
        const sanitizedEmail = sanitizeInput(email);
        
        // Validate form
        const validation = validateLoginForm(sanitizedEmail, password);
        if (!validation.isValid) {
            setFieldErrors(validation.errors);
            return;
        }

        setLoading(true);

        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({ 
                email: sanitizedEmail, 
                password 
            });
            
            if (signInError) {
                // Map Supabase errors to user-friendly messages
                const errorMessage = getAuthErrorMessage(signInError);
                throw new Error(errorMessage);
            }
            
            if (!data?.session) {
                throw new Error('Login failed. Please try again.');
            }
            
            // Clear any redirect flags
            window.__authRedirecting = false;
            
            // Navigate to dashboard
            navigate('/dashboard', { replace: true });
            
        } catch (err) {
            setError(err.message || 'An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Map Supabase auth errors to user-friendly messages
    const getAuthErrorMessage = (error) => {
        const message = error.message?.toLowerCase() || '';
        
        if (message.includes('invalid login credentials') || message.includes('invalid password')) {
            return 'Invalid email or password. Please try again.';
        }
        if (message.includes('email not confirmed')) {
            return 'Please verify your email address before logging in.';
        }
        if (message.includes('too many requests') || message.includes('rate limit')) {
            return 'Too many login attempts. Please wait a moment and try again.';
        }
        if (message.includes('network') || message.includes('fetch')) {
            return 'Unable to connect. Please check your internet connection.';
        }
        if (message.includes('user not found')) {
            return 'Invalid email or password. Please try again.'; // Don't reveal if user exists
        }
        
        // Default generic message
        return 'Login failed. Please check your credentials and try again.';
    };

    return (
        <div 
            className="min-h-screen flex items-center justify-center p-4" 
            style={{ backgroundColor: COLORS.lightGray }}
        >
            <div className="max-w-md w-full p-8 bg-white shadow-xl rounded-2xl border border-slate-200">
                
                <h2 
                    className="mt-2 text-center text-3xl font-bold" 
                    style={{color: COLORS.primaryBlue}}
                >
                    Sign in to your account
                </h2>
                
                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                    {error && (
                        <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm text-center" role="alert">
                            {error}
                        </div>
                    )}
                    
                    <FormInput
                        label="Email Address"
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: '' }));
                        }}
                        error={fieldErrors.email}
                        disabled={loading}
                    />

                    <FormInput
                        label="Password"
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: '' }));
                        }}
                        error={fieldErrors.password}
                        disabled={loading}
                    />

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-3 px-4 text-sm font-semibold rounded-lg text-white shadow-md disabled:bg-opacity-70 disabled:cursor-not-allowed transition-colors"
                            style={{ backgroundColor: COLORS.secondaryBlue }}
                            onMouseOver={e => !loading && (e.currentTarget.style.backgroundColor = '#085f73')}
                            onMouseOut={e => !loading && (e.currentTarget.style.backgroundColor = COLORS.secondaryBlue)}
                        >
                            {loading && <FaSpinner className="animate-spin mr-2" />}
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
}