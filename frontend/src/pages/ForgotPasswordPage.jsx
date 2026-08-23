import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { sendPasswordReset } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await sendPasswordReset(email);
      // Always show the neutral message — never reveal whether the address is registered
      setSuccess(true);
    } catch (err) {
      // Only surface genuine network / configuration errors
      // Firebase resolves for unknown emails so this branch rarely fires
      if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your connection and try again.');
      } else {
        // Treat all other errors the same as success to avoid account enumeration
        setSuccess(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#080D18] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-8 shadow-xl">
        {/* Logo & Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/25 mb-3">
            <Shield className="w-7 h-7 stroke-[2.5]" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Reset your password
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 rounded-xl text-xs border border-rose-200 dark:border-rose-800/50 mb-6">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-xl text-sm border border-emerald-200 dark:border-emerald-800/50 w-full">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>
                If that address is registered, a reset link has been sent.
              </span>
            </div>
            <Link
              to="/login"
              className="text-xs text-brand-500 font-semibold hover:underline mt-2"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="alice@vaultkey.app"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-gray-50/50 dark:bg-surface-darkSecondary border border-[#E6EAF0] dark:border-[#253044] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <Button type="submit" variant="primary" className="w-full mt-2" loading={loading}>
                SEND RESET LINK
              </Button>
            </form>

            <div className="mt-6 text-center text-xs">
              <Link to="/login" className="text-brand-500 font-semibold hover:underline">
                Back to login
              </Link>
            </div>
          </>
        )}

        {/* Security Message */}
        <div className="mt-8 pt-4 border-t border-[#E6EAF0] dark:border-[#253044] text-center">
          <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-brand-500" />
            <span>Your files are protected by client-side encryption.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
