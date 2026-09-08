import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User as UserIcon, Check, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button, Input } from '../../components/ui';
import { AuthCarousel } from '../../components/AuthCarousel';
import api from '../../services/api';

const TABS = [
  { id: 'account', label: 'Account' },
  { id: 'company', label: 'Company' },
  { id: 'security', label: 'Security' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Mirrors backend/authController.js's PASSWORD_RULE exactly — shown as a
// live checklist so the requirement isn't just a rejection message after
// the fact. The backend re-validates the same rule regardless: this is a
// UX aid, not the actual enforcement.
const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'digit', label: 'One number', test: (p: string) => /\d/.test(p) },
  { key: 'special', label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

// Kept out of the searchable/checkbox list — a free-text field covers it
// instead (see the 'Other' input below), letting a company specify a
// vertical that isn't in the fixed list at all rather than just ticking a
// generic "Other" box.
const OTHER_LABEL = 'Other';

const PartnerRegisterPage = () => {
  const { registerPartner, login } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  // Which pricing card they clicked (see pricing-section.tsx's
  // ctaHref: '/login?type=oem', carried through by LoginPage's Register
  // link) — pre-fills this, but it's still changeable here since someone
  // could land on /register directly without going through pricing first.
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type');

  const [tab, setTab] = useState<TabId>('account');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [partnerType, setPartnerType] = useState<'oem' | 'reseller'>(initialType === 'reseller' ? 'reseller' : 'oem');
  const [companyTypes, setCompanyTypes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [typeSearch, setTypeSearch] = useState('');
  const [customType, setCustomType] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const tabIndex = TABS.findIndex((t) => t.id === tab);

  const fetchCaptcha = () => {
    setCaptchaAnswer('');
    api.get('/auth/captcha').then((r) => { setCaptchaToken(r.data.captchaToken); setCaptchaQuestion(r.data.question); }).catch(() => {});
  };

  useEffect(() => {
    api.get('/auth/company-types').then((r) => setCompanyTypes(r.data)).catch(() => {});
    fetchCaptcha();
  }, []);

  const toggleType = (t: string) => setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const visibleTypes = companyTypes.filter((t) => t !== OTHER_LABEL && t.toLowerCase().includes(typeSearch.trim().toLowerCase()));
  const finalCompanyTypes = [...selectedTypes, ...(customType.trim() ? [customType.trim()] : [])];

  const goNext = () => {
    setError('');
    if (tab === 'account' && (!form.name.trim() || !form.email.trim())) { setError('Name and email are required'); return; }
    if (tab === 'company' && finalCompanyTypes.length === 0) { setError('Select at least one company type, or type your own'); return; }
    if (tabIndex < TABS.length - 1) setTab(TABS[tabIndex + 1].id);
  };
  const goBack = () => { setError(''); if (tabIndex > 0) setTab(TABS[tabIndex - 1].id); };

  const passwordOk = PASSWORD_RULES.every((r) => r.test(form.password));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!passwordOk) { setError('Password does not meet all the requirements below'); return; }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    if (!captchaAnswer.trim()) { setError('Please answer the captcha'); return; }

    setLoading(true);
    try {
      await registerPartner({
        name: form.name,
        email: form.email,
        partnerType,
        companyTypes: finalCompanyTypes,
        password: form.password,
        confirmPassword: form.confirmPassword,
        captchaToken,
        captchaAnswer,
      });
      // Straight into Setup Profile — no reason to make someone who just
      // typed their password re-type it a moment later on /login.
      await login(form.email, form.password);
      show('Account created!', 'success');
      navigate('/setup-profile');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message ?? 'Registration failed');
      fetchCaptcha(); // a stale/expired captcha token would fail forever otherwise
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <div className="h-1 w-full flex-shrink-0" style={{ backgroundImage: 'var(--gradient-brand)' }} />
      <div className="flex-1 min-h-0 flex">
        <AuthCarousel
          badge="Meril One — Partner Network"
          title="Join the Meril partner network"
          subtitle="Register as an OEM or reseller partner and get access to your own partner portal."
        />

        <div className="flex-1 min-h-0 flex items-center justify-center px-6 py-6 bg-gray-50 lg:bg-white overflow-y-auto">
          <div className="w-full max-w-[25rem] my-auto">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg shadow-gray-200/60 p-8">
              <div className="flex items-center justify-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base text-white flex-shrink-0 shadow-md" style={{ backgroundImage: 'var(--gradient-brand)' }}>
                  M
                </div>
                <div className="text-left leading-tight">
                  <p className="text-base font-bold text-primary-800">Meril One</p>
                  <p className="text-[10px] font-semibold text-gray-400 tracking-widest uppercase">Partner Registration</p>
                </div>
              </div>

              <div className="text-center mb-5">
                <h2 className="text-2xl font-bold text-gray-900 mb-1.5">Create your partner account</h2>
                <p className="text-gray-500 text-sm">Takes about a minute</p>
              </div>

              <div className="flex mb-6">
                {TABS.map((t, i) => (
                  <div key={t.id} className={`flex items-center ${i < TABS.length - 1 ? 'flex-1' : 'flex-shrink-0'}`}>
                    <button type="button" onClick={() => setTab(t.id)} className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                          i < tabIndex ? 'bg-primary-600 text-white' : i === tabIndex ? 'bg-primary-600 text-white ring-4 ring-primary-100' : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {i < tabIndex ? <Check size={13} /> : i + 1}
                      </div>
                      <span className={`text-[10px] font-semibold text-center leading-tight max-w-[4.5rem] ${i === tabIndex ? 'text-primary-700' : i < tabIndex ? 'text-gray-600' : 'text-gray-400'}`}>
                        {t.label}
                      </span>
                    </button>
                    {i < TABS.length - 1 && <div className={`flex-1 h-0.5 mx-2 mt-3.5 rounded-full transition-colors ${i < tabIndex ? 'bg-primary-600' : 'bg-gray-200'}`} />}
                  </div>
                ))}
              </div>

              {error && <div className="bg-danger-50 border border-red-200 text-danger-700 text-sm rounded-lg px-4 py-2 mb-4">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="space-y-4 min-h-[16rem] flex flex-col justify-center">
                  {tab === 'account' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 tracking-wide uppercase mb-2">Registering As</label>
                        <div className="grid grid-cols-2 gap-3">
                          {(['oem', 'reseller'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setPartnerType(t)}
                              className={`rounded-xl border p-3 text-left transition-colors ${partnerType === t ? 'border-primary-500 bg-primary-50/40' : 'border-gray-200'}`}
                            >
                              <p className="font-semibold text-sm text-gray-900 uppercase">{t}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 tracking-wide uppercase mb-1.5">User Name</label>
                        <Input value={form.name} onChange={(e) => set('name', e.target.value)} icon={UserIcon} placeholder="Jane Doe" autoComplete="name" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 tracking-wide uppercase mb-1.5">Email</label>
                        <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} icon={Mail} placeholder="you@company.com" autoComplete="email" required />
                      </div>
                    </>
                  )}

                  {tab === 'company' && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 tracking-wide uppercase mb-2">Company Type — select one or more</label>
                      <div className="relative mb-2">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={typeSearch}
                          onChange={(e) => setTypeSearch(e.target.value)}
                          placeholder="Search company types…"
                          className="input w-full !pl-9 !text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto pr-1 scrollbar-hide">
                        {visibleTypes.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-3">No match — try the "Other" field below.</p>
                        ) : (
                          visibleTypes.map((t) => (
                            <label key={t} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors ${selectedTypes.includes(t) ? 'border-primary-500 bg-primary-50/50 text-primary-800 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                              <input type="checkbox" className="accent-primary-600" checked={selectedTypes.includes(t)} onChange={() => toggleType(t)} />
                              {t}
                            </label>
                          ))
                        )}
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">Don't see your type? Type your own</label>
                        <Input value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="e.g. Veterinary Diagnostics" />
                      </div>
                    </div>
                  )}

                  {tab === 'security' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 tracking-wide uppercase mb-1.5">Password</label>
                        <div className="relative">
                          <Input type={showPw ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} icon={Lock} className="pr-11" placeholder="••••••••" autoComplete="new-password" required />
                          <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
                            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-none whitespace-nowrap overflow-x-auto scrollbar-hide -mx-1 px-1">
                        {PASSWORD_RULES.map((r) => {
                          const ok = r.test(form.password);
                          return (
                            <li key={r.key} className={`flex items-center gap-1 flex-shrink-0 ${ok ? 'text-success-600' : 'text-gray-400'}`}>
                              <Check size={11} className={ok ? 'opacity-100' : 'opacity-30'} /> {r.label}
                            </li>
                          );
                        })}
                      </ul>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 tracking-wide uppercase mb-1.5">Confirm Password</label>
                        <Input type={showPw ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} icon={Lock} placeholder="••••••••" autoComplete="new-password" required />
                      </div>

                      <div className="pt-1">
                        <label className="block text-xs font-bold text-gray-500 tracking-wide uppercase mb-1.5">Verify you're human</label>
                        <div className="flex items-center gap-2">
                          <span className="flex-1 flex items-center justify-center px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700 select-none">
                            {captchaQuestion || 'Loading…'}
                          </span>
                          <button type="button" onClick={fetchCaptcha} className="p-2.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0" title="New question">
                            <RefreshCw size={15} />
                          </button>
                        </div>
                        <Input className="mt-2" type="text" inputMode="numeric" value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} placeholder="Your answer" required />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 mt-6 pt-5 border-t border-gray-100">
                  <Button type="button" variant="secondary" onClick={goBack} disabled={tabIndex === 0}>Back</Button>
                  {tab === 'security' ? (
                    <Button type="submit" variant="primary" loading={loading}>Create Account</Button>
                  ) : (
                    <Button type="button" variant="primary" onClick={goNext}>Next</Button>
                  )}
                </div>
              </form>

              <p className="text-center text-gray-500 text-sm mt-6">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">Sign In</Link>
              </p>
            </div>

            <p className="text-center text-gray-400 text-[11px] mt-4">© {new Date().getFullYear()} Meril Diagnostics Pvt. Ltd.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerRegisterPage;
