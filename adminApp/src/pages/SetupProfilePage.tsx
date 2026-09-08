import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, Sparkles, ArrowRight, ArrowLeft, LogOut,
  UserCircle2, Building2, MapPin, Package, Landmark,
  Receipt, BadgeCheck, Briefcase, FileText, ClipboardCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getDefaultRoute } from '../utils/defaultRoute';
import { Button } from '../components/ui';
import * as setupApi from '../services/setupProfileApi';
import type { PartnerProfileData } from '../types/setupProfile';

import ContactStep from './setup/ContactStep';
import CompanyStep from './setup/CompanyStep';
import AddressStep from './setup/AddressStep';
import ProductsStep from './setup/ProductsStep';
import BankingStep from './setup/BankingStep';
import TaxStep from './setup/TaxStep';
import CertificatesStep from './setup/CertificatesStep';
import BusinessStep from './setup/BusinessStep';
import AdditionalStep from './setup/AdditionalStep';
import ReviewStep from './setup/ReviewStep';

const STEPS = [
  { id: 'contact', label: 'Contact', icon: UserCircle2, title: 'Contact Person Details', description: 'The primary point of contact for your account.' },
  { id: 'company', label: 'Company', icon: Building2, title: 'Company Information', description: 'Basic details, identity, and registration information about your company.' },
  { id: 'address', label: 'Address', icon: MapPin, title: 'Registered & Business Address', description: "Your company's official registered address and other locations." },
  { id: 'products', label: 'Products', icon: Package, title: 'Products & Categories', description: 'The product categories and items your business deals in.' },
  { id: 'banking', label: 'Banking', icon: Landmark, title: 'Bank & Payment Details', description: 'Used for payment processing. Sensitive information is handled securely.' },
  { id: 'tax', label: 'Tax & Govt.', icon: Receipt, title: 'Tax & Government Registration', description: 'PAN, GSTIN, CIN, MSME, IEC, and other registrations — add whichever apply.' },
  { id: 'certificates', label: 'Certificates', icon: BadgeCheck, title: 'Certificates & Compliance Documents', description: 'ISO, CE, BIS, GST, MSME and other industry certifications — add whichever apply.' },
  { id: 'business', label: 'Business', icon: Briefcase, title: 'Business / OEM Details', description: 'Information specific to your role as a manufacturer, distributor, or service provider.' },
  { id: 'additional', label: 'Additional', icon: FileText, title: 'Additional Business Information', description: 'Optional context that helps us tailor your ERP experience.' },
  { id: 'review', label: 'Review', icon: ClipboardCheck, title: 'Review & Submit', description: 'Check everything looks right before submitting your profile.' },
] as const;
type StepId = (typeof STEPS)[number]['id'] | 'welcome';

// Every OEM/Reseller's first stop after login (see defaultRoute.ts — routes
// here whenever User.profileSubmitted is false). Nothing in it is mandatory
// (explicit testing instruction), so "Next" never blocks on validation —
// this is a save-and-continue wizard, not a gated form. Fixed-height app
// shell (left icon rail + header + footer never move); only the middle
// content pane scrolls internally when a step's fields overflow the
// viewport, so the page itself never feels like a long scrolling form.
// See SETUP_PROFILE.txt for the full spec this implements.
const SetupProfilePage = () => {
  const { user, logout, refreshUser } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<PartnerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<StepId>('welcome');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const fetchProfile = () => setupApi.getProfile().then((p: PartnerProfileData) => {
    setProfile(p);
    if (p.submitted) { setDone(true); return; }
    const savedStep = STEPS.find((s) => s.id === p.currentStep);
    if (savedStep) setStep(savedStep.id);
  });

  useEffect(() => { fetchProfile().finally(() => setLoading(false)); }, []);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const goTo = (target: StepId) => {
    setStep(target);
    setupApi.saveSection('currentStep', target).catch(() => {});
  };
  const goNext = () => { if (stepIndex < STEPS.length - 1) goTo(STEPS[stepIndex + 1].id); };
  const goBack = () => { if (stepIndex > 0) goTo(STEPS[stepIndex - 1].id); else goTo('welcome'); };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await setupApi.submitProfile(confirmChecked);
      await refreshUser();
      show('Profile submitted — welcome aboard!', 'success');
      setDone(true);
    } catch (err: any) {
      show(err?.response?.data?.message ?? 'Failed to submit profile.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white text-sm text-gray-400">
        <div className="w-8 h-8 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin mr-3" />
        Loading your setup…
      </div>
    );
  }

  if (done) {
    return (
      <div className="h-screen flex items-center justify-center bg-primary-950 px-6 relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary-400/10 blur-3xl" />
        <div className="relative max-w-lg w-full text-center bg-white rounded-2xl shadow-2xl shadow-black/40 p-12">
          <div className="w-16 h-16 rounded-2xl text-white flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary-600/30" style={{ backgroundColor: 'var(--color-primary-700)' }}>
            <Check size={30} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Your {user?.partnerType?.toUpperCase()} Profile is Ready</h1>
          <p className="text-gray-500 mb-8">Your company profile and business configuration have been successfully completed.</p>
          <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-left mb-9 bg-primary-50 rounded-xl p-5 border border-primary-100">
            {profile && Object.entries(profile.completion.sections).map(([key, ok]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${ok ? 'bg-primary-600' : 'bg-gray-200'}`}>
                  {ok && <Check size={10} className="text-white" strokeWidth={3} />}
                </span>
                <span className={ok ? 'text-gray-700 capitalize' : 'text-gray-400 capitalize'}>{key}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="solid" className="!px-6" onClick={() => navigate(getDefaultRoute(user))}>Explore ERP <ArrowRight size={15} /></Button>
            <Button variant="secondary" onClick={() => { setDone(false); goTo('review'); }}>View My Profile</Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'welcome') {
    return (
      <div className="h-screen flex items-center justify-center bg-primary-950 px-6 relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary-400/10 blur-3xl" />
        <div className="relative max-w-lg w-full text-center bg-white rounded-2xl shadow-2xl shadow-black/40 p-12">
          <div className="w-14 h-14 rounded-2xl text-white flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary-600/30" style={{ backgroundColor: 'var(--color-primary-700)' }}>
            <Sparkles size={24} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Meril One</h1>
          <p className="text-gray-500 mb-8 leading-relaxed">
            Let's complete your {user?.partnerType?.toUpperCase()} profile. This information will help us configure your ERP
            environment based on your business, products, and operational requirements.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-primary-600 uppercase tracking-wide mb-9">
            <span>~10 minutes</span>
            <span className="w-1 h-1 rounded-full bg-primary-200" />
            <span>{STEPS.length} steps</span>
            <span className="w-1 h-1 rounded-full bg-primary-200" />
            <span>Everything optional</span>
          </div>
          <div className="flex justify-center">
            <Button variant="solid" className="!px-6" onClick={() => goTo(STEPS[0].id)}>Start Setup <ArrowRight size={15} /></Button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const percent = profile.completion.overallPercent;
  const ActiveIcon = STEPS[stepIndex].icon;

  return (
    <div className="h-screen flex bg-white overflow-hidden">
      {/* Left process rail — icons + flow, fixed for the whole wizard */}
      <aside className="w-52 flex-shrink-0 h-screen flex flex-col text-white relative" style={{ backgroundColor: 'var(--color-primary-950)' }}>
        <div className="px-4 pt-5 pb-4 border-b border-white/10 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white flex-shrink-0 bg-white/15">M</div>
          <div className="leading-tight min-w-0">
            <p className="font-bold text-white text-sm truncate">Meril One</p>
            <p className="text-[9px] font-semibold text-primary-200 tracking-widest uppercase truncate">{user?.partnerType} Setup</p>
          </div>
        </div>

        <nav className="flex-1 px-2.5 py-4 flex flex-col justify-center overflow-hidden">
          <ol className="relative">
            {STEPS.map((s, i) => {
              const isActive = s.id === step;
              const isDone = i < stepIndex;
              const isLast = i === STEPS.length - 1;
              const Icon = s.icon;
              return (
                <li key={s.id} className="relative">
                  {!isLast && (
                    <span className={`absolute left-[15px] top-8 w-px h-[calc(100%-6px)] ${isDone ? 'bg-primary-300/60' : 'bg-white/10'}`} />
                  )}
                  <button
                    onClick={() => goTo(s.id)}
                    className={`w-full flex items-center gap-2.5 px-1.5 py-2.5 rounded-lg text-left transition-colors relative z-10 ${
                      isActive ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                        isDone
                          ? 'bg-primary-400 text-primary-950'
                          : isActive
                          ? 'bg-white text-primary-700 ring-2 ring-white/20'
                          : 'bg-white/10 text-white/50'
                      }`}
                    >
                      {isDone ? <Check size={13} strokeWidth={2.5} /> : <Icon size={13} strokeWidth={2.25} />}
                    </span>
                    <span className={`text-[12px] leading-tight truncate ${isActive ? 'font-bold text-white' : isDone ? 'font-semibold text-primary-100' : 'font-medium text-white/50'}`}>
                      {s.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="px-2.5 pb-4 pt-3 border-t border-white/10">
          <div className="px-1.5 mb-2.5">
            <div className="flex items-center justify-between text-[10px] font-semibold text-primary-200 mb-1.5">
              <span>Progress</span>
              <span>{percent}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg text-[12px] font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      {/* Right pane — fixed header/footer, only the content between them scrolls */}
      <div className="flex-1 h-screen flex flex-col min-w-0 bg-white">
        <header className="flex-shrink-0 border-b border-gray-100 px-10 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
              <ActiveIcon size={19} strokeWidth={2.25} />
            </span>
            <h1 className="leading-snug truncate">
              <span className="text-lg font-bold text-gray-900">{STEPS[stepIndex].title}</span>
              <span className="text-sm text-gray-400 mx-1.5">—</span>
              <span className="text-sm text-gray-500 font-normal">{STEPS[stepIndex].description}</span>
            </h1>
          </div>
          <span className="hidden sm:inline text-xs font-semibold text-gray-400 flex-shrink-0">{percent}% complete</span>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-hide px-10 py-5">
          <div className="max-w-[1600px]">
            {step === 'contact' && <ContactStep profile={profile} onRefetch={fetchProfile} />}
            {step === 'company' && <CompanyStep profile={profile} onSaved={setProfile} />}
            {step === 'address' && <AddressStep profile={profile} onSaved={setProfile} onRefetch={fetchProfile} />}
            {step === 'products' && <ProductsStep profile={profile} onRefetch={fetchProfile} />}
            {step === 'banking' && <BankingStep profile={profile} onSaved={setProfile} />}
            {step === 'tax' && <TaxStep profile={profile} onRefetch={fetchProfile} />}
            {step === 'certificates' && <CertificatesStep profile={profile} onRefetch={fetchProfile} />}
            {step === 'business' && <BusinessStep profile={profile} onSaved={setProfile} />}
            {step === 'additional' && <AdditionalStep profile={profile} onSaved={setProfile} />}
            {step === 'review' && (
              <ReviewStep
                profile={profile}
                confirmChecked={confirmChecked}
                onConfirmChange={setConfirmChecked}
                termsChecked={termsChecked}
                onTermsChange={setTermsChecked}
                onEditSection={(id) => goTo(id as StepId)}
              />
            )}
          </div>
        </main>

        <footer className="flex-shrink-0 border-t border-gray-100 px-10 py-3 flex items-center justify-between bg-white">
          <Button variant="secondary" icon={ArrowLeft} onClick={goBack}>Back</Button>
          {step === 'review' ? (
            <Button variant="solid" className="!px-6" loading={submitting} disabled={!confirmChecked || !termsChecked} onClick={handleSubmit}>Submit {user?.partnerType?.toUpperCase()} Profile</Button>
          ) : (
            <Button variant="solid" className="!px-6" onClick={goNext}>Next <ArrowRight size={15} /></Button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default SetupProfilePage;
