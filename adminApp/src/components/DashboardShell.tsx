import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  LayoutDashboard, FileText, FileDigit, ReceiptText, HandCoins, ClipboardCheck, Truck, FileMinus, LogOut, Building2, Trophy, ChevronRight, BarChart3, Users, Swords,
  ShoppingCart, FileSpreadsheet, PackageCheck, UserCircle, LayoutPanelLeft, FolderKanban,
  Handshake, Users2, FileSignature, Bell, CheckCheck, Package, PanelLeftClose, PanelLeftOpen, Settings,
  Receipt, Contact,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDefaultRoute } from '../utils/defaultRoute';
import { PageHeaderProvider, usePageHeaderContext } from '../context/PageHeaderContext';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/notificationsApi';
import type { NotificationRow } from '../services/notificationsApi';

// `to: null` marks a parent that has no page of its own — clicking its
// header only expands/collapses its children (e.g. "Analytics"), unlike
// "Tenders" which is both a real page and a parent.
type ChildItem =
  | { kind: 'link'; to: string; label: string; icon: typeof FileText }
  | { kind: 'section'; label: string };

const link = (to: string, label: string, icon: typeof FileText): ChildItem => ({ kind: 'link', to, label, icon });

type NavItem = { to: string | null; label: string; icon: typeof FileText; end: boolean; children: ChildItem[] };

// Reseller and OEM see the same nav except this last group: an OEM manages
// its own dealer network (Distributors + reviewing incoming requests),
// while a reseller manages the products it's authorized to sell instead
// (Our Products + sending requests) — same "Request Authorization" child
// either way since both roles land on that page, just seeing their own side.
const dealerOrProductNavItem = (partnerType?: string | null): NavItem =>
  partnerType === 'reseller'
    ? {
        to: null, label: 'Product Management', icon: Package, end: false,
        children: [
          link('dealers/our-products', 'Our Products', Package),
          link('dealers/authorization-letter', 'Request Authorization', FileSignature),
        ],
      }
    : {
        to: null, label: 'Dealer Management', icon: Handshake, end: false,
        children: [
          link('dealers/distributors', 'Distributors', Users2),
          link('dealers/authorization-letter', 'View Authorization', FileSignature),
        ],
      };

const BASE_NAV_ITEMS: NavItem[] = [
  { to: '' as string | null, label: 'Dashboard', icon: LayoutDashboard, end: true, children: [] as ChildItem[] },
  {
    to: 'tenders' as string | null,
    label: 'Tenders',
    icon: FileText,
    end: false,
    children: [
      link('tenders/tender-tracker', 'Tender Tracker', ClipboardCheck),
      link('tenders/document-tender', 'Offline Tender', FileMinus),
      link('tenders/participated-tender', 'Participated Tender', Trophy),
    ] as ChildItem[],
  },
  {
    to: null as string | null,
    label: 'Workdesk',
    icon: LayoutPanelLeft,
    end: false,
    children: [
      link('tenders/workdesk/active-workspaces', 'Active Workspaces', LayoutPanelLeft),
      link('tenders/workdesk/library', 'Library', FolderKanban),
    ] as ChildItem[],
  },
  {
    to: null as string | null,
    label: 'Analytics',
    icon: BarChart3,
    end: false,
    children: [
      link('analytics/company-profile', 'Company Profile', Users),
      link('analytics/compare-bidders', 'Compare Bidders', Swords),
    ] as ChildItem[],
  },
  {
    to: null as string | null,
    label: 'Order Management',
    icon: ShoppingCart,
    end: false,
    children: [
      link('orders/gem-contracts', 'GeM Contracts', FileSpreadsheet),
      link('orders/carting-dashboard', 'Carting Dashboard', PackageCheck),
    ] as ChildItem[],
  },
  {
    to: null as string | null,
    label: 'Sales & Invoices',
    icon: Receipt,
    end: false,
    children: [
      link('sales/our-clients', 'Our Clients', Contact),
      link('sales/quotations', 'Quotations', FileText),
      link('sales/invoices', 'Invoices', FileDigit),
      link('sales/proforma-invoice', 'Proforma Invoice', ReceiptText),
      link('sales/payment-receipts', 'Payment Receipts', HandCoins),
      link('sales/sales-order', 'Sales Order', ClipboardCheck),
      link('sales/delivery-challan', 'Delivery Challan', Truck),
      link('sales/credit-note', 'Credit Note', FileMinus),
    ] as ChildItem[],
  },
  {
    to: null as string | null,
    label: 'Purchases',
    icon: ShoppingCart,
    end: false,
    children: [
      link('purchases/purchases-hub', 'Purchases Hub', FileText),
      link('purchases/our-vendors', 'Our Vendors', Truck),
    ] as ChildItem[],
  },
];

// Left-navbar shell for the real OEM/Reseller app (post Setup-Profile) —
// mounted at /oem/:name/:id/* and /reseller/:name/:id/* (see App.tsx).
// Replaces the old "dashboard is being built" placeholder that lived in
// PartnerPortalShell with the real Dashboard/Tenders/Tender-Details pages,
// and keeps the same route guards that shell used to enforce.
const DashboardShell = ({ expectedType }: { expectedType: 'oem' | 'reseller' }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { name, id } = useParams();
  const location = useLocation();
  const base = `/${expectedType}/${name}/${id}`;
  const navItems = useMemo(() => [...BASE_NAV_ITEMS, dealerOrProductNavItem(user?.partnerType)], [user?.partnerType]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Auto-expand a nav item's sub-section whenever the current route sits
  // under it (e.g. landing straight on /tenders/participated-tender via a
  // bookmark or refresh) — otherwise the active child would be hidden
  // inside a collapsed section with no visual indication.
  const hasActiveChild = (item: NavItem) =>
    item.children.some((c) => c.kind === 'link' && location.pathname.startsWith(`${base}/${c.to}`));

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navItems.map((item) => [item.label, hasActiveChild(item)])),
  );
  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const item of navItems) {
        if (hasActiveChild(item)) next[item.label] = true;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.userType !== 'partner' || user.partnerType !== expectedType || String(user.id) !== id) {
    return <Navigate to={getDefaultRoute(user)} replace />;
  }
  if (!user.profileSubmitted) return <Navigate to="/setup-profile" replace />;

  return (
    <div className="h-screen flex bg-white overflow-hidden">
      <div
        className={`h-screen flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${sidebarOpen ? 'w-56' : 'w-0'}`}
        style={{ backgroundColor: 'var(--color-primary-950)' }}
      >
        <aside className="w-56 h-screen flex flex-col text-white">
          <div className="flex items-center gap-3 px-3 py-2.5 mx-2 mt-3 mb-2 rounded-lg select-none">
            <div className="w-8 h-8 rounded-[6px] flex items-center justify-center font-semibold text-[13px] text-white flex-shrink-0 shadow-sm bg-white/15">M</div>
            <div className="flex flex-col overflow-hidden leading-none">
              <span className="text-[13px] font-medium text-white truncate mb-1">Meril One</span>
              <span className="text-[11px] text-primary-300 truncate capitalize">{expectedType} Portal</span>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2.5 pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <ul className="flex flex-col gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const hasChildren = item.children.length > 0;
                const isOpen = !!expanded[item.label];
                const rowClasses = (isActive: boolean) =>
                  `group flex items-center justify-between gap-2 px-3 py-2.5 rounded-[6px] cursor-pointer transition-colors duration-150 select-none text-[13px] font-medium whitespace-nowrap ${
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                  }`;
                return (
                  <li key={item.label} className="flex flex-col">
                    {item.to === null ? (
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [item.label]: !prev[item.label] }))}
                        className={rowClasses(false)}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon size={16} strokeWidth={1.75} className="text-white/50 group-hover:text-white/80 flex-shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {hasChildren && <ChevronRight size={14} strokeWidth={2} className={`text-white/40 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`} />}
                      </button>
                    ) : (
                      <NavLink
                        to={`${base}${item.to ? `/${item.to}` : ''}`}
                        end={item.end}
                        onClick={() => { if (hasChildren) setExpanded((prev) => ({ ...prev, [item.label]: true })); }}
                        className={({ isActive }) => rowClasses(isActive)}
                      >
                        {({ isActive }) => (
                          <>
                            <span className="flex items-center gap-2.5 min-w-0">
                              <Icon size={16} strokeWidth={1.75} className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-white/50 group-hover:text-white/80'}`} />
                              <span className="truncate">{item.label}</span>
                            </span>
                            {hasChildren && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded((prev) => ({ ...prev, [item.label]: !prev[item.label] })); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setExpanded((prev) => ({ ...prev, [item.label]: !prev[item.label] })); } }}
                                className="p-1 -m-1 rounded flex-shrink-0 hover:bg-white/10"
                              >
                                <ChevronRight size={14} strokeWidth={2} className={`text-white/40 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    )}

                    {hasChildren && (
                      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
                        <div className="overflow-hidden min-h-0">
                          <ul className="relative flex flex-col gap-1 mt-1 mb-1">
                            <div className="absolute top-0 bottom-1 border-l border-white/10" style={{ left: '20.5px' }} />
                            {item.children.map((child) => {
                              if (child.kind === 'section') {
                                return (
                                  <li key={child.label} className="pl-8 pr-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">
                                    {child.label}
                                  </li>
                                );
                              }
                              const ChildIcon = child.icon;
                              return (
                                <li key={child.label}>
                                  <NavLink
                                    to={`${base}/${child.to}`}
                                    className={({ isActive }) =>
                                      `flex items-center gap-2.5 pl-8 pr-2.5 py-2 rounded-[6px] text-[12.5px] font-medium transition-colors duration-150 ${
                                        isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/85'
                                      }`
                                    }
                                  >
                                    <ChildIcon size={14} strokeWidth={1.75} />
                                    {child.label}
                                  </NavLink>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="px-2.5 pb-3 pt-2 border-t border-white/10 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => navigate('/setup-profile')}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-[6px] text-[13px] font-medium text-white/60 hover:bg-white/5 hover:text-white/90 transition-colors duration-150"
            >
              <Settings size={16} strokeWidth={1.75} className="text-white/50" />
              Settings
            </button>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-[6px] text-[13px] font-medium text-white/60 hover:bg-danger-500/10 hover:text-danger-200 transition-colors duration-150"
            >
              <LogOut size={16} strokeWidth={1.75} className="text-white/50" />
              Log out
            </button>
          </div>
        </aside>
      </div>

      <div className="flex-1 h-screen flex flex-col min-w-0 bg-gray-50">
        <PageHeaderProvider>
          <HeaderBar
            userName={user?.name}
            onLogout={logout}
            onViewProfile={() => navigate('/setup-profile')}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
          />
          <main className="flex-1 overflow-y-auto p-8">
            <Outlet />
          </main>
        </PageHeaderProvider>
      </div>
    </div>
  );
};

// Left: current page's title/description (published via usePageHeader).
// Right: "Welcome back, <name>" + a profile icon opening a small dropdown
// (View Profile / Logout) — replaces the sidebar's old standalone Edit
// Setup Profile / Logout buttons with a single consistent spot on every page.
const HeaderBar = ({
  userName, onLogout, onViewProfile, sidebarOpen, onToggleSidebar,
}: {
  userName?: string; onLogout: () => void; onViewProfile: () => void; sidebarOpen: boolean; onToggleSidebar: () => void;
}) => {
  const { header } = usePageHeaderContext();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="flex-shrink-0 border-b border-gray-100 bg-white px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <PanelLeftClose size={18} strokeWidth={1.75} /> : <PanelLeftOpen size={18} strokeWidth={1.75} />}
        </button>
        <div className="min-w-0">
        <h1 className="text-[15px] font-bold text-gray-900 truncate">{header?.title || ' '}</h1>
        {header?.description && <p className="text-xs text-gray-500 truncate">{header.description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <NotificationBell />

        <div className="text-right leading-tight hidden sm:block">
          <p className="text-[11px] text-gray-400">Welcome back,</p>
          <p className="text-sm font-bold text-gray-900">{userName}</p>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-transform hover:scale-105"
            style={{ backgroundColor: 'var(--color-primary-950)' }}
            aria-label="Account menu"
          >
            <UserCircle size={22} />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-lg py-1.5 z-50">
              <div className="px-3.5 py-2 border-b border-gray-50 sm:hidden">
                <p className="text-sm font-bold text-gray-900 truncate">{userName}</p>
              </div>
              <button
                onClick={() => { setOpen(false); onViewProfile(); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Building2 size={15} className="text-gray-400" /> View Profile
              </button>
              <button
                onClick={() => { setOpen(false); onLogout(); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-danger-600 hover:bg-danger-50 transition-colors"
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

// Currently only fired by the Request Authorization workflow (request
// received / approved / rejected) — clicking one marks it read and jumps to
// Request Authorization, where the full request list lives.
const NotificationBell = () => {
  const navigate = useNavigate();
  const { name, id } = useParams();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  const load = () => { getNotifications().then((r) => { setItems(r.data); setUnreadCount(r.unreadCount); }).catch(() => {}); };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const openItem = async (n: NotificationRow) => {
    if (!n.isRead) { await markNotificationRead(n.id).catch(() => {}); load(); }
    setOpen(false);
    if (n.relatedType === 'DealerAuthRequest') {
      const base = `/${window.location.pathname.split('/')[1]}/${name}/${id}`;
      navigate(`${base}/dealers/authorization-letter`);
    }
  };

  const markAll = async () => { await markAllNotificationsRead().catch(() => {}); load(); };

  return (
    <div className="relative" ref={bellRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-danger-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline">
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-primary-50/40' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-primary-600 mt-1.5 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className={`text-sm ${!n.isRead ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{n.title}</p>
                      {n.message && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardShell;
