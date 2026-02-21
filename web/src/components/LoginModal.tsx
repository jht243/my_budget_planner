import React, { useState } from 'react';
import { supabase } from '../supabase';
import { X, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';

const COLORS = {
    primary: "#1B4332",
    primaryDark: "#0F2B1F",
    primaryLight: "#2D6A4F",
    accent: "#40916C",
    accentLight: "#E8F5E9",
    bg: "#F5F5F0",
    card: "#FFFFFF",
    border: "#E5E7EB",
    borderLight: "#F0F0F0",
    textMain: "#1A1A1A",
    textSecondary: "#6B7280",
    textMuted: "#9CA3AF",
    error: "#DC2626",
    errorBg: "#FEF2F2",
    success: "#059669",
    successBg: "#ECFDF5",
};

interface LoginModalProps {
    onClose: () => void;
    onLoginSuccess: () => void;
}

const inputStyle = (focused: boolean) => ({
    width: '100%', padding: '16px 16px 16px 48px', backgroundColor: focused ? '#FFFFFF' : '#F9FAFB',
    border: `1px solid ${focused ? COLORS.primary : COLORS.border}`,
    borderRadius: 16, fontSize: 15, color: COLORS.textMain, outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' as const,
    boxShadow: focused ? `0 0 0 4px ${COLORS.accentLight}` : 'none',
});

export const LoginModal: React.FC<LoginModalProps> = ({ onClose, onLoginSuccess }) => {
    const [mode, setMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [emailFocused, setEmailFocused] = useState(false);
    const [passwordFocused, setPasswordFocused] = useState(false);
    const [confirmFocused, setConfirmFocused] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!supabase) {
            setError('Cloud sync is currently unavailable. Please try again later.');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);

        if (error) {
            console.error("Login error:", error);
            if (error.message?.toLowerCase().includes('invalid login credentials')) {
                setError('Invalid email or password. Please try again.');
            } else if (error.message?.toLowerCase().includes('email not confirmed')) {
                setError('Please check your inbox and confirm your email before logging in.');
            } else {
                setError(error.message || 'Login failed. Please try again.');
            }
        } else {
            onLoginSuccess();
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!supabase) {
            setError('Cloud sync is currently unavailable. Please try again later.');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        const { data, error } = await supabase.auth.signUp({ email, password });
        setLoading(false);

        if (error) {
            console.error("Sign up error:", error);
            if (error.message?.toLowerCase().includes('already registered')) {
                setError('An account with this email already exists. Try logging in instead.');
            } else {
                setError(error.message || 'Sign up failed. Please try again.');
            }
        } else if (data.session) {
            // Auto-confirmed (email confirmation disabled in Supabase)
            onLoginSuccess();
        } else {
            // Email confirmation required
            setSuccess('Account created! Please check your email to confirm your account, then log in.');
            setMode('LOGIN');
            setPassword('');
            setConfirmPassword('');
        }
    };

    const switchMode = () => {
        setMode(mode === 'LOGIN' ? 'SIGNUP' : 'LOGIN');
        setError('');
        setSuccess('');
        setPassword('');
        setConfirmPassword('');
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
            <div style={{
                backgroundColor: COLORS.card, borderRadius: 24, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                width: '100%', maxWidth: 440, overflow: 'hidden', animation: 'fadeIn 0.2s ease-out'
            }}>
                {/* Header */}
                <div style={{ padding: '24px 32px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ fontSize: 24, fontWeight: 700, color: COLORS.textMain, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
                            {mode === 'LOGIN' ? 'Login' : 'Sign Up'}
                        </h2>
                        <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: 0, lineHeight: 1.5 }}>
                            {mode === 'LOGIN'
                                ? 'Sign in to sync your budget across devices.'
                                : 'Create an account to save and sync your budget.'}
                        </p>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 8, margin: '-8px -8px 0 0',
                        color: COLORS.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', transition: 'background-color 0.2s'
                    }} onMouseEnter={e => e.currentTarget.style.backgroundColor = COLORS.bg} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '0 32px 32px' }}>
                    {/* Error */}
                    {error && (
                        <div style={{
                            marginBottom: 20, padding: '12px 16px', backgroundColor: COLORS.errorBg, borderRadius: 12,
                            display: 'flex', alignItems: 'flex-start', gap: 12, border: `1px solid ${COLORS.error}20`
                        }}>
                            <AlertCircle size={18} color={COLORS.error} style={{ marginTop: 2, flexShrink: 0 }} />
                            <div style={{ fontSize: 13, color: COLORS.error, lineHeight: 1.5, fontWeight: 500 }}>{error}</div>
                        </div>
                    )}

                    {/* Success */}
                    {success && (
                        <div style={{
                            marginBottom: 20, padding: '12px 16px', backgroundColor: COLORS.successBg, borderRadius: 12,
                            display: 'flex', alignItems: 'flex-start', gap: 12, border: `1px solid ${COLORS.success}20`
                        }}>
                            <CheckCircle size={18} color={COLORS.success} style={{ marginTop: 2, flexShrink: 0 }} />
                            <div style={{ fontSize: 13, color: COLORS.success, lineHeight: 1.5, fontWeight: 500 }}>{success}</div>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={mode === 'LOGIN' ? handleLogin : handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Email */}
                        <div style={{ position: 'relative' }}>
                            <Mail size={18} color={COLORS.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@email.com"
                                style={inputStyle(emailFocused)}
                                onFocus={() => setEmailFocused(true)}
                                onBlur={() => setEmailFocused(false)}
                                autoFocus
                            />
                        </div>

                        {/* Password */}
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} color={COLORS.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                                style={inputStyle(passwordFocused)}
                                onFocus={() => setPasswordFocused(true)}
                                onBlur={() => setPasswordFocused(false)}
                            />
                        </div>

                        {/* Confirm Password (Sign Up only) */}
                        {mode === 'SIGNUP' && (
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} color={COLORS.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm Password"
                                    style={inputStyle(confirmFocused)}
                                    onFocus={() => setConfirmFocused(true)}
                                    onBlur={() => setConfirmFocused(false)}
                                />
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading || !email || !password || (mode === 'SIGNUP' && !confirmPassword)}
                            style={{
                                width: '100%', backgroundColor: COLORS.primary, color: 'white', padding: '16px', borderRadius: 16,
                                fontSize: 16, fontWeight: 600, border: 'none',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading || !email || !password ? 0.7 : 1,
                                transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4
                            }}
                            onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.backgroundColor = COLORS.primaryDark; } }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.backgroundColor = COLORS.primary; }}
                        >
                            {loading
                                ? (mode === 'LOGIN' ? 'Logging in...' : 'Creating account...')
                                : (mode === 'LOGIN' ? 'Login' : 'Create Account')}
                        </button>

                        {/* Toggle */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -4 }}>
                            <div style={{ fontSize: 14, color: COLORS.textSecondary }}>
                                {mode === 'LOGIN' ? "Don't have an account? " : "Already have an account? "}
                                <button
                                    type="button"
                                    onClick={switchMode}
                                    style={{ background: 'none', border: 'none', color: COLORS.primary, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                >
                                    {mode === 'LOGIN' ? 'Sign Up' : 'Login'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: scale(0.95) translateY(10px); }
                        to { opacity: 1; transform: scale(1) translateY(0); }
                    }
                `}
            </style>
        </div>
    );
};
