import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Button, Input } from '../components/ui';
import { AuthCarousel } from '../components/AuthCarousel';
import { getDefaultRoute } from '../utils/defaultRoute';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  // Carries the pricing section's OEM/Reseller choice through to Register
  // (see components/blocks/pricing-section.tsx's ctaHref: '/login?type=oem').
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(email, password);
      navigate(getDefaultRoute(loggedInUser));
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <div className="h-1 w-full flex-shrink-0" style={{ backgroundImage: 'var(--gradient-brand)' }} />
      <div className="flex-1 min-h-0 flex">
        <AuthCarousel
          badge="Meril One — Live System"
          title="Innovation for better healthcare"
          subtitle="One ERP for quotations, orders, dispatch, inventory, finance and HR — across every Meril team."
        />

        {/* Right — form panel. Logo lives inside the card's own header (not
            a separate block above it) so the whole assembly comfortably
            fits one viewport with no scrollbar. */}
        <div className="flex-1 min-h-0 flex items-center justify-center px-6 py-10 bg-gray-50 lg:bg-white">
          <div className="w-full max-w-[27rem]">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg shadow-gray-200/60 p-12">
              <div className="flex items-center justify-center gap-3 mb-8">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg text-white flex-shrink-0 shadow-md" style={{ backgroundImage: 'var(--gradient-brand)' }}>
                  M
                </div>
                <div className="text-left leading-tight">
                  <p className="text-lg font-bold text-primary-800">Meril One</p>
                  <p className="text-[10px] font-semibold text-gray-400 tracking-widest uppercase">Enterprise Resource Planning</p>
                </div>
              </div>

              <div className="text-center mb-9">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back!</h2>
                <p className="text-gray-500 text-base">Sign in to your Meril One account</p>
              </div>

              {error && (
                <div className="bg-danger-50 border border-red-200 text-danger-700 text-sm rounded-lg px-4 py-3 mb-7">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-7">
                <div>
                  <label className="block text-xs font-bold text-gray-500 tracking-wide uppercase mb-1.5" htmlFor="login-email">Email</label>
                  <Input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    icon={Mail}
                    placeholder="you@meril.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 tracking-wide uppercase mb-1.5" htmlFor="login-password">Password</label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      icon={Lock}
                      className="pr-12"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    Remember Me
                  </label>
                  <a href="#" className="text-xs font-semibold text-primary-600 hover:text-primary-700">
                    Forgot Password?
                  </a>
                </div>

                <Button type="submit" variant="primary" loading={loading} className="w-full !py-4 !text-base">
                  Login
                </Button>
              </form>

              <p className="text-center text-gray-500 text-sm mt-8">
                Don't have an account?{' '}
                <Link to={type ? `/register?type=${type}` : '/register'} className="font-semibold text-primary-600 hover:text-primary-700">
                  Register
                </Link>
              </p>
            </div>

            <p className="text-center text-gray-400 text-xs mt-5">
              © {new Date().getFullYear()} Meril Diagnostics Pvt. Ltd.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
