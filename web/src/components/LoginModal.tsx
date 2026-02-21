import React, { useState } from 'react';
import { supabase } from '../supabase';
import { X, Mail, KeyRound, AlertCircle } from 'lucide-react';

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
};

interface LoginModalProps {
    onClose: () => void;
    onLoginSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onClose, onLoginSuccess }) => {
    const [mode, setMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!supabase) {
            setError('Cloud sync is currently unavailable. Please try again later.');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true
            }
        });
        setLoading(false);

        if (error) {
            console.error("Supabase Auth Error:", error);
            if (error.message?.toLowerCase().includes('rate limit') || (error as any).status === 429) {
                setError("Please wait a moment before requesting another login code.");
            } else {
                setError(error.message || 'An unexpected error occurred. Please try again later.');
            }
        } else {
            setStep('OTP');
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!supabase) return;

        setLoading(true);
        const { data, error } = await supabase.auth.verifyOtp({
            email,
            token: otp,
            type: 'email'
        });
        setLoading(false);

        if (error) {
            console.error("Supabase Auth Verify Error:", error);
            if (error.message?.toLowerCase().includes('rate limit') || (error as any).status === 429) {
                setError("Please wait a moment before trying again.");
            } else if (error.message?.toLowerCase().includes('expired') || error.message?.toLowerCase().includes('invalid')) {
                setError("That code is incorrect or expired. Please check your email or request a new one.");
            } else {
                setError(error.message || 'Verification failed. Please try again.');
            }
        } else if (data.session) {
            onLoginSuccess();
        }
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
                <div style={{ padding: '24px 32px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ fontSize: 24, fontWeight: 700, color: COLORS.textMain, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
                            {step === 'EMAIL' ? (mode === 'LOGIN' ? 'Login' : 'Sign Up') : 'Verify Email'}
                        </h2>
                        <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: 0, lineHeight: 1.5 }}>
                            {step === 'EMAIL'
                                ? (mode === 'LOGIN'
                                    ? 'Enter your email to receive a 6-digit secure login code.'
                                    : 'Enter your email to receive a 6-digit code to create your account.')
                                : `Enter the 6-digit code sent to ${email}`}
                        </p>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 8, margin: '-8px -8px 0 0',
                        color: COLORS.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', transition: 'background-color 0.2s'
                    }} onMouseEnter={e => e.currentTarget.style.backgroundColor = COLORS.bg} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: '0 32px 32px' }}>
                    {error && (
                        <div style={{
                            marginBottom: 20, padding: '12px 16px', backgroundColor: COLORS.errorBg, borderRadius: 12,
                            display: 'flex', alignItems: 'flex-start', gap: 12, border: `1px solid ${COLORS.error}20`
                        }}>
                            <AlertCircle size={18} color={COLORS.error} style={{ marginTop: 2, flexShrink: 0 }} />
                            <div style={{ fontSize: 13, color: COLORS.error, lineHeight: 1.5, fontWeight: 500 }}>
                                {error}
                            </div>
                        </div>
                    )}

                    {step === 'EMAIL' ? (
                        <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div style={{ position: 'relative' }}>
                                <Mail size={18} color={COLORS.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@email.com"
                                    style={{
                                        width: '100%', padding: '16px 16px 16px 48px', backgroundColor: '#F9FAFB', border: `1px solid ${COLORS.border}`,
                                        borderRadius: 16, fontSize: 15, color: COLORS.textMain, outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box'
                                    }}
                                    onFocus={e => { e.target.style.borderColor = COLORS.primary; e.target.style.backgroundColor = '#FFFFFF'; e.target.style.boxShadow = `0 0 0 4px ${COLORS.accentLight}`; }}
                                    onBlur={e => { e.target.style.borderColor = COLORS.border; e.target.style.backgroundColor = '#F9FAFB'; e.target.style.boxShadow = 'none'; }}
                                    autoFocus
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading || !email}
                                style={{
                                    width: '100%', backgroundColor: COLORS.primary, color: 'white', padding: '16px', borderRadius: 16,
                                    fontSize: 16, fontWeight: 600, border: 'none', cursor: loading || !email ? 'not-allowed' : 'pointer',
                                    opacity: loading || !email ? 0.7 : 1, transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8
                                }}
                                onMouseEnter={e => { if (!loading && email) e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.backgroundColor = COLORS.primaryDark; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.backgroundColor = COLORS.primary; }}
                            >
                                {loading ? 'Sending Code...' : 'Send Login Code'}
                            </button>

                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: -4 }}>
                                <div style={{ fontSize: 14, color: COLORS.textSecondary }}>
                                    {mode === 'LOGIN' ? "Don't have an account? " : "Already have an account? "}
                                    <button
                                        type="button"
                                        onClick={() => setMode(mode === 'LOGIN' ? 'SIGNUP' : 'LOGIN')}
                                        style={{ background: 'none', border: 'none', color: COLORS.primary, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                    >
                                        {mode === 'LOGIN' ? 'Sign Up' : 'Login'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div style={{ position: 'relative' }}>
                                <KeyRound size={18} color={COLORS.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    required
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000 000"
                                    style={{
                                        width: '100%', padding: '16px 16px 16px 48px', backgroundColor: '#F9FAFB', border: `1px solid ${COLORS.border}`,
                                        borderRadius: 16, fontSize: 18, color: COLORS.textMain, outline: 'none', transition: 'all 0.2s',
                                        textAlign: 'center', letterSpacing: '0.4em', fontWeight: 600, boxSizing: 'border-box'
                                    }}
                                    onFocus={e => { e.target.style.borderColor = COLORS.primary; e.target.style.backgroundColor = '#FFFFFF'; e.target.style.boxShadow = `0 0 0 4px ${COLORS.accentLight}`; }}
                                    onBlur={e => { e.target.style.borderColor = COLORS.border; e.target.style.backgroundColor = '#F9FAFB'; e.target.style.boxShadow = 'none'; }}
                                    autoFocus
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading || otp.length !== 6}
                                style={{
                                    width: '100%', backgroundColor: COLORS.primary, color: 'white', padding: '16px', borderRadius: 16,
                                    fontSize: 16, fontWeight: 600, border: 'none', cursor: loading || otp.length !== 6 ? 'not-allowed' : 'pointer',
                                    opacity: loading || otp.length !== 6 ? 0.7 : 1, transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { if (!loading && otp.length === 6) e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.backgroundColor = COLORS.primaryDark; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.backgroundColor = COLORS.primary; }}
                            >
                                {loading ? 'Verifying...' : 'Login Successfully'}
                            </button>

                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: -8 }}>
                                <button type="button" onClick={() => setStep('EMAIL')} style={{
                                    background: 'none', border: 'none', color: COLORS.textSecondary, fontSize: 13, cursor: 'pointer', textDecoration: 'underline'
                                }}>
                                    Change email address
                                </button>
                            </div>
                        </form>
                    )}
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
