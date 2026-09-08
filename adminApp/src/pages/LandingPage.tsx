import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Menu, X, Globe2, Building2, Users2, CalendarDays, ChevronDown,
  FileText, ClipboardList, Boxes, TrendingUp, Wallet, UserCog,
  Factory, Wrench, BarChart3, ShieldCheck, Zap, Layers, Headphones, CheckCircle2,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { HeroGlobe } from '../components/HeroGlobe';
import { PricingSection } from '../components/blocks/pricing-section';
import type { PricingPlan } from '../components/blocks/pricing-section';
import { getDefaultRoute } from '../utils/defaultRoute';

const PRICING_PLANS: PricingPlan[] = [
  {
    key: 'oem',
    ctaHref: '/login?type=oem',
    name: 'OEM',
    staticPriceLabel: 'Custom',
    period: 'negotiated',
    description: 'For original equipment manufacturers integrating with the Meril supply chain',
    buttonText: 'Get Started',
    isPopular: false,
    features: [
      'Bulk order & production integration',
      'API / ERP-to-ERP connection',
      'Dedicated manufacturing liaison',
      'Priority production scheduling',
    ],
  },
  {
    key: 'reseller',
    ctaHref: '/login?type=reseller',
    name: 'Reseller',
    staticPriceLabel: '₹499',
    period: '6 months',
    priceNote: 'First 6 months free trial',
    description: 'For distributors and resellers managing orders, inventory, and service',
    buttonText: 'Get Started',
    isPopular: true,
    features: [
      'Order & inventory management',
      'Multi-warehouse network',
      '24/7 priority support',
      'Dedicated account manager',
    ],
  },
  {
    key: 'customer',
    // No self-serve customer portal/signup exists yet — this routes to a
    // sales inquiry instead of a broken /login flow (backend registration
    // only accepts partnerType 'oem' | 'reseller' today).
    ctaHref: 'mailto:sales@merilone.com?subject=Meril%20One%20-%20Customer%20Plan%20Inquiry',
    name: 'Customer',
    staticPriceLabel: 'Custom',
    period: 'negotiated',
    description: 'For hospitals and healthcare providers sourcing directly through Meril One',
    buttonText: 'Contact Sales',
    isPopular: false,
    features: [
      'Direct procurement & order tracking',
      'Real-time delivery visibility',
      'Dedicated account support',
      'Consolidated invoicing',
    ],
  },
];

const STATS = [
  { icon: Globe2, value: '150+', label: 'Countries served' },
  { icon: Users2, value: '12,000+', label: 'Employees worldwide' },
  { icon: Building2, value: '35+', label: 'Global subsidiaries' },
  { icon: CalendarDays, value: '2006', label: 'Innovating since' },
];

const MODULES = [
  { icon: FileText, title: 'Quotes & Orders', desc: 'Raise quotations and convert them into orders with full pipeline visibility.' },
  { icon: ClipboardList, title: 'Purchase Orders', desc: 'Manage vendor POs from request through delivery and reconciliation.' },
  { icon: Boxes, title: 'Inventory & Warehouse', desc: 'Real-time stock across every warehouse — transfers, adjustments, batches.' },
  { icon: TrendingUp, title: 'Sales & CRM', desc: 'Customer master, deal health scoring, and team performance tracking.' },
  { icon: Wallet, title: 'Finance & Accounts', desc: 'Ledger, payables, receivables, budgeting and GST — one source of truth.' },
  { icon: UserCog, title: 'HR & Payroll', desc: 'Attendance, leave, payroll and statutory compliance, fully automated.' },
  { icon: Factory, title: 'Manufacturing', desc: 'Work orders, bill of materials, OEE and live shop-floor visibility.' },
  { icon: Wrench, title: 'Service & Installations', desc: 'Track installations, service requests and engineer field activity.' },
  { icon: BarChart3, title: 'Reports & Analytics', desc: 'Cross-functional dashboards for every level of the organization.' },
];

const DIFFERENTIATORS = [
  { icon: ShieldCheck, title: 'Healthcare-grade reliability', desc: 'Built to the same standards Meril applies to its medical devices — accuracy and traceability, end to end.' },
  { icon: Zap, title: 'Real-time visibility', desc: 'Every quote, order, dispatch and stock movement updates live, across every distributor location.' },
  { icon: Layers, title: 'One connected platform', desc: 'Sales, inventory, finance, HR and manufacturing on a single data model — no reconciling spreadsheets.' },
  { icon: Headphones, title: 'Built around distributors', desc: 'Onboarding, pricing and workflows shaped by how Meril’s own distributor network actually operates.' },
];

const TRUST_POINTS = [
  'Guided onboarding for every new distributor',
  "Dedicated support from Meril's own team",
  'One connected system from day one — no spreadsheets',
];

const LandingPage = () => {
  const { isAuthenticated, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const dashboardHref = isAuthenticated ? getDefaultRoute(user) : '/login';

  return (
    <div className="bg-white text-gray-900">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white shadow-sm" style={{ backgroundImage: 'var(--gradient-brand)' }}>
              M
            </div>
            <div className="leading-tight">
              <p className="text-base font-bold text-primary-800">Meril One</p>
              <p className="text-[9px] font-semibold text-gray-400 tracking-widest uppercase">Distributor Platform</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <div
              className="relative"
              onMouseEnter={() => setPlatformOpen(true)}
              onMouseLeave={() => setPlatformOpen(false)}
            >
              <button className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-primary-700 transition-colors px-3 py-2 rounded-lg">
                Platform
                <ChevronDown size={14} className={`transition-transform duration-200 ${platformOpen ? 'rotate-180' : ''}`} />
              </button>

              {platformOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 w-[680px]">
                  <div className="bg-white rounded-2xl shadow-2xl shadow-black/10 border border-gray-100 p-5 grid grid-cols-[1fr_210px] gap-5">
                    <div className="grid grid-cols-2 gap-1">
                      {MODULES.map((m) => (
                        <a
                          key={m.title}
                          href="#modules"
                          onClick={() => setPlatformOpen(false)}
                          className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                        >
                          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                            <m.icon size={16} className="text-primary-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{m.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{m.desc}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                    <div className="rounded-xl p-5 flex flex-col justify-between" style={{ backgroundImage: 'var(--gradient-brand-dark)' }}>
                      <div>
                        <p className="text-white font-semibold text-sm mb-1.5">New to Meril One?</p>
                        <p className="text-white/60 text-xs leading-relaxed">
                          See the full platform in action and create your distributor account in minutes.
                        </p>
                      </div>
                      <Link to="/register" onClick={() => setPlatformOpen(false)} className="btn-gradient !text-xs mt-4 justify-center">
                        Get Started <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <a href="#why" className="text-sm font-medium text-gray-600 hover:text-primary-700 transition-colors px-3 py-2 rounded-lg">
              Why Meril One
            </a>
            <a href="#about" className="text-sm font-medium text-gray-600 hover:text-primary-700 transition-colors px-3 py-2 rounded-lg">
              About Meril
            </a>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <a href="#pricing" title="Pricing" aria-label="Pricing" className="p-2 rounded-lg text-gray-500 hover:text-primary-700 hover:bg-gray-50 transition-colors">
              <CreditCard size={18} />
            </a>
            {isAuthenticated ? (
              <Link to={dashboardHref} className="btn-gradient">
                Go to Dashboard <ArrowRight size={15} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-sm font-semibold text-gray-700 hover:text-primary-700 px-3 py-2">
                  Sign In
                </Link>
                <Link to="/register" className="btn-gradient">
                  Get Started <ArrowRight size={15} />
                </Link>
              </>
            )}
          </div>

          <button className="md:hidden p-2 -mr-2 text-gray-600" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 px-6 py-4 flex flex-col gap-4 bg-white">
            <a href="#modules" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-gray-600">Platform</a>
            <a href="#why" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-gray-600">Why Meril One</a>
            <a href="#about" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-gray-600">About Meril</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm font-medium text-gray-600">
              <CreditCard size={16} /> Pricing
            </a>
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
              {isAuthenticated ? (
                <Link to={dashboardHref} className="btn-gradient justify-center">Go to Dashboard</Link>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary justify-center">Sign In</Link>
                  <Link to="/register" className="btn-gradient justify-center">Get Started</Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section id="platform" className="relative bg-gradient-brand-dark overflow-hidden">
        {/* Soft accent glows for depth — pure CSS, no image */}
        <div className="pointer-events-none absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-primary-500/25 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -right-32 w-[480px] h-[480px] rounded-full bg-teal-500/10 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-32 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/15 mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
              Meril One — Distributor Management System
            </div>
            <h1 className="text-4xl md:text-5xl xl:text-6xl font-bold text-white leading-tight mb-6">
              One platform connecting Meril and every distributor, worldwide
            </h1>
            <p className="text-white/70 text-lg max-w-xl mx-auto lg:mx-0 mb-10">
              Quotations, orders, dispatch, inventory, finance and HR — unified in a single ERP built on
              the same rigor Meril brings to healthcare innovation, for a distributor network spanning 150+ countries.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <Link to="/register" className="btn-gradient !px-6 !py-3 !text-base">
                Experience the Platform <ArrowRight size={18} />
              </Link>
              <Link to="/login" className="inline-flex items-center gap-2 text-white font-semibold px-6 py-3 rounded-lg border border-white/25 hover:bg-white/10 transition-all text-base">
                Distributor Login
              </Link>
            </div>
          </div>

          {/* 3D network globe — hidden below lg to keep mobile light-weight */}
          <div className="hidden lg:block relative">
            <div className="relative aspect-square w-full max-w-[540px] mx-auto">
              <HeroGlobe />

              <div className="absolute top-4 left-0 flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-3.5 py-2.5 shadow-lg animate-[float_6s_ease-in-out_infinite]">
                <Globe2 size={16} className="text-amber-500" />
                <span className="text-white text-xs font-semibold">150+ countries, live</span>
              </div>

              <div
                className="absolute bottom-6 right-0 flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-3.5 py-2.5 shadow-lg animate-[float_7s_ease-in-out_infinite]"
                style={{ animationDelay: '1.2s' }}
              >
                <Users2 size={16} className="text-teal-400" />
                <span className="text-white text-xs font-semibold">12,000+ people connected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats strip, overlapping hero/body seam */}
        <div className="relative max-w-6xl mx-auto px-6 -mb-16">
          <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-100 grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100">
            {STATS.map((s) => (
              <div key={s.label} className="flex flex-col items-center justify-center gap-3 py-9 px-5 text-center">
                <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center">
                  <s.icon size={18} className="text-primary-600" />
                </div>
                <p className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums">{s.value}</p>
                <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Meril */}
      <section id="about" className="max-w-7xl mx-auto px-6 pt-32 pb-24 grid md:grid-cols-2 gap-14 items-center">
        <div>
          <p className="text-xs font-bold text-primary-600 tracking-widest uppercase mb-3">About Meril</p>
          <h2 className="text-3xl font-bold text-gray-900 mb-5 leading-snug">
            Innovation for better healthcare, since 2006
          </h2>
          <p className="text-gray-600 mb-4 leading-relaxed">
            Meril is a global medical device company designing clinically relevant solutions across
            cardiovascular, orthopedics, robotics, diagnostics, oncology, ENT and endo-surgery — built by an
            in-house R&amp;D ecosystem working to alleviate human suffering and improve quality of life worldwide.
          </p>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Meril One extends that same discipline to how Meril runs its distributor network — replacing
            fragmented spreadsheets and disconnected tools with a single ERP for quotations, orders, dispatch,
            inventory, finance and HR across every partner, everywhere Meril operates.
          </p>
          <a href="https://www.merillife.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700">
            Learn more at merillife.com <ArrowRight size={15} />
          </a>
        </div>
        <div className="relative rounded-2xl overflow-hidden shadow-lg">
          <img src="/images/meril-hq-facade.jpg" alt="Meril corporate campus" className="w-full h-[420px] object-cover" />
        </div>
      </section>

      {/* Modules — sliding 3D card marquee */}
      <section id="modules" className="bg-gray-50 py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-bold text-primary-600 tracking-widest uppercase mb-3">Platform</p>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything your distribution business needs</h2>
            <p className="text-gray-500">Nine connected modules, one login, zero reconciliation.</p>
          </div>
        </div>

        <div
          className="marquee-wrap relative"
          style={{
            maskImage: 'linear-gradient(90deg, transparent 0, black 8%, black 92%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent 0, black 8%, black 92%, transparent 100%)',
          }}
        >
          <div className="marquee-track flex items-stretch gap-6 w-max px-6" style={{ perspective: '1200px' }}>
            {[...MODULES, ...MODULES].map((m, i) => (
              <div key={i} className="tilt-card w-[300px] flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden">
                <div className="h-1 w-full" style={{ backgroundImage: 'var(--gradient-brand)' }} />
                <div className="p-6">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-primary-50">
                    <m.icon size={20} className="text-primary-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1.5">{m.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Meril One */}
      <section id="why" className="relative bg-gradient-brand-dark py-24 overflow-hidden">
        <div className="pointer-events-none absolute top-0 right-0 w-[420px] h-[420px] rounded-full bg-primary-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-10 w-[380px] h-[380px] rounded-full bg-teal-500/10 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-16 items-start">
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-bold text-teal-400 tracking-widest uppercase mb-3">Why Meril One</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-5 leading-snug">
              Built for how Meril distributors actually work
            </h2>
            <p className="text-white/60 leading-relaxed mb-8">
              Every workflow in Meril One is shaped around the real day-to-day of running a Meril
              distributorship — not bolted on from a generic ERP template.
            </p>
            <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <Globe2 size={18} className="text-amber-500 flex-shrink-0" />
              <p className="text-white text-sm font-semibold">Trusted across a 150+ country distributor network</p>
            </div>
          </div>

          <div className="divide-y divide-white/10 border-t border-b border-white/10">
            {DIFFERENTIATORS.map((d, i) => (
              <div key={d.title} className="group flex items-start gap-5 py-7 px-3 -mx-3 rounded-xl hover:bg-white/5 transition-colors">
                <span className="text-white/20 text-3xl font-bold w-10 flex-shrink-0 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10 group-hover:bg-white/15 transition-colors">
                  <d.icon size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-1.5">{d.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Campus banner with mission quote */}
      <section className="relative">
        <img src="/images/meril-hq-signage.jpg" alt="Meril campus" className="w-full h-80 object-cover" />
        <div className="absolute inset-0 bg-black/50 flex items-center">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-white text-xl md:text-2xl font-semibold leading-relaxed">
              "We work tirelessly towards the alleviation of human suffering, and improving the quality
              of life for people across the globe."
            </p>
            <p className="text-white/60 text-sm mt-4 tracking-wide uppercase">Meril Mission</p>
          </div>
        </div>
      </section>

      {/* Pricing — above the "Ready to get connected?" CTA */}
      <PricingSection plans={PRICING_PLANS} />

      {/* Ready to get connected — simple CTA, no inquiry form (that was
          backed by an /api/inquiries endpoint that no longer exists after
          this app's cleanup down to just the OEM/Reseller partner flow). */}
      <section className="relative bg-gradient-brand-dark py-24 overflow-hidden">
        <div className="pointer-events-none absolute top-10 left-1/4 w-[420px] h-[420px] rounded-full bg-primary-500/20 blur-3xl" />

        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Ready to get connected?</h2>
          <p className="text-white/70 text-base mb-8 max-w-md mx-auto">
            Create your partner account and start experiencing Meril One today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <Link to="/register" className="btn-gradient !px-6 !py-3 !text-base">
              Create Partner Account <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 text-white font-semibold px-6 py-3 rounded-lg border border-white/25 hover:bg-white/10 transition-all text-base">
              Sign In
            </Link>
          </div>
          <div className="flex flex-col gap-2.5 items-center">
            {TRUST_POINTS.map((t) => (
              <p key={t} className="flex items-center gap-2 text-white/60 text-sm">
                <CheckCircle2 size={15} className="text-teal-400 flex-shrink-0" /> {t}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white" style={{ backgroundImage: 'var(--gradient-brand)' }}>
              M
            </div>
            <div className="leading-tight text-left">
              <p className="text-sm font-bold text-primary-800">Meril One</p>
              <p className="text-[9px] font-semibold text-gray-400 tracking-widest uppercase">Distributor Management System</p>
            </div>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-6">
            <a href="#modules" className="text-xs font-medium text-gray-500 hover:text-primary-700">Platform</a>
            <a href="#why" className="text-xs font-medium text-gray-500 hover:text-primary-700">Why Meril One</a>
            <a href="#about" className="text-xs font-medium text-gray-500 hover:text-primary-700">About Meril</a>
            <a href="https://www.merillife.com/" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-gray-500 hover:text-primary-700">
              merillife.com
            </a>
          </nav>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} Meril Diagnostics Pvt. Ltd.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
