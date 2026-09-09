import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FileText, Clock, Globe, IndianRupee, TrendingUp, ShieldCheck, AlertCircle,
  ArrowUpRight, Activity, Users, LogIn, CalendarCheck, Timer, Award, Headset, Building2, MapPin, Handshake,
} from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { getDashboardStats } from '../../services/tenderApi';
import type { DashboardStats } from '../../services/tenderApi';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useAuth } from '../../context/AuthContext';

const formatINR = (value: number) => {
  const v = Number(value) || 0;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)} K`;
  return `₹${v.toFixed(0)}`;
};

const timeLeftLabel = (hoursLeft: number | null) => {
  if (hoursLeft == null) return '';
  if (hoursLeft < 1) return '<1 hr left';
  if (hoursLeft < 48) return `${hoursLeft} hrs left`;
  return `${Math.floor(hoursLeft / 24)} days left`;
};

// Same accent palette family as the tender-automation site's dashboard
// charts, just built from our own CSS custom properties instead of hardcoded
// hex, so it tracks the app's navy theme instead of their blue/purple mix.
const STATE_COLORS = ['#1E4373', '#0D9488', '#7C3AED', '#D97706', '#0EA5E9', '#DC2626'];
const CONTRACT_BAR_COLORS = ['#8CA9CB', '#5B80AC', '#375D8A', '#1E4373', '#16305A', '#102343'];
const SELLER_COLORS = ['#1E4373', '#0D9488', '#7C3AED', '#D97706', '#DC2626'];

const StatCard = ({ icon: Icon, title, value, subtitle, color, onClick }: { icon: typeof FileText; title: string; value: string | number; subtitle: string; color: string; onClick: () => void }) => (
  <button onClick={onClick} className="text-left rounded-xl border border-gray-100 bg-white p-5 hover:shadow-md hover:border-primary-200 transition-all group">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{title}</p>
      </div>
      <span className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
        <Icon size={18} />
      </span>
    </div>
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
      <span className="text-xs text-gray-400">{subtitle}</span>
      <span className="text-xs font-semibold text-primary-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        View <ArrowUpRight size={12} />
      </span>
    </div>
  </button>
);

const MiniStat = ({ icon: Icon, iconColor, value, label, live }: { icon: typeof Users; iconColor: string; value: string | number; label: string; live?: boolean }) => (
  <div className="rounded-lg border border-gray-100 p-3 flex flex-col items-center text-center gap-1 relative">
    {live && <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse" />}
    <Icon size={15} color={iconColor} />
    <span className="text-lg font-bold text-gray-900">{value}</span>
    <span className="text-[11px] text-gray-500">{label}</span>
  </div>
);

// Module-scoped, not component state — survives unmount/remount when the
// user flips between the Dashboard and Tenders nav items, so coming back
// shows the last-known numbers instantly instead of a spinner every time.
// Refetches quietly underneath on each mount to stay current.
let cachedStats: DashboardStats | null = null;

const DashboardPage = () => {
  usePageHeader('Tender Dashboard', 'Real-time snapshot of active GeM and open tenders.');
  const navigate = useNavigate();
  const { name, id } = useParams();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(cachedStats);
  const [loading, setLoading] = useState(!cachedStats);
  const tendersPath = (bidUrlId?: string) => `/${window.location.pathname.split('/')[1]}/${name}/${id}/tenders${bidUrlId ? `/${bidUrlId}` : ''}`;

  useEffect(() => {
    getDashboardStats().then((r) => { cachedStats = r.data; setStats(r.data); }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading dashboard…</p>;
  }
  if (!stats) {
    return <p className="text-sm text-gray-400">Couldn't load dashboard stats.</p>;
  }

  const deptSplitEntries = [
    { name: 'Diagno', value: stats.deptSplit.diagno || 0 },
    { name: 'Endo', value: stats.deptSplit.endo || 0 },
  ];
  const deptSplitTotal = deptSplitEntries.reduce((sum, d) => sum + d.value, 0) || 1;

  const loginTrendData = stats.userActivity.trend.map((r) => ({
    day: new Date(r.day).toLocaleDateString('en-IN', { weekday: 'short' }),
    count: Number(r.count),
  }));

  const avgSessionLabel = (() => {
    const s = stats.userActivity.avgSessionSeconds || 0;
    if (s < 60) return `${s}s`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m`;
    return `${(m / 60).toFixed(1)}h`;
  })();

  const maxState = stats.topStates[0]?.count || 1;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={FileText} color="#1E4373" title="Active Tenders" value={stats.activeTenders.toLocaleString('en-IN')} subtitle="Currently pursuing" onClick={() => navigate(tendersPath())} />
        <StatCard icon={Clock} color="#D97706" title="Closing in 7 Days" value={stats.closingSoon.toLocaleString('en-IN')} subtitle="Needs action" onClick={() => navigate(tendersPath())} />
        <StatCard icon={Globe} color="#0D9488" title="Open Tenders (CPPP)" value={stats.openTenders.toLocaleString('en-IN')} subtitle="Non-GeM portals" onClick={() => navigate(tendersPath())} />
        <StatCard icon={IndianRupee} color="#7C3AED" title="Contract Value" value={formatINR(stats.contracts.totalValue)} subtitle={`${stats.contracts.count.toLocaleString('en-IN')} contracts`} onClick={() => navigate(tendersPath())} />
        <StatCard icon={TrendingUp} color="#16305A" title="Active Pipeline Value" value={formatINR(stats.pipelineValue)} subtitle="Est. value, open tenders" onClick={() => navigate(tendersPath())} />
        {user?.partnerType === 'oem' ? (
          <StatCard icon={Handshake} color="#16A34A" title="Resellers" value={stats.resellersCount.toLocaleString('en-IN')} subtitle="Approved authorizations" onClick={() => navigate(`/${window.location.pathname.split('/')[1]}/${name}/${id}/dealers/authorization-letter`)} />
        ) : (
          <StatCard icon={ShieldCheck} color="#16A34A" title="EMD Locked" value={formatINR(stats.emdLocked)} subtitle="Across active bids" onClick={() => navigate(tendersPath())} />
        )}
        <StatCard icon={AlertCircle} color="#DC2626" title="Open Incidents" value={stats.incidents.pendingResponse.toLocaleString('en-IN')} subtitle={`${stats.incidents.total} total`} onClick={() => navigate(tendersPath())} />
        <StatCard icon={Building2} color="#0D9488" title="Distributor Network" value={stats.distributors.total.toLocaleString('en-IN')} subtitle={`${stats.distributors.active} active`} onClick={() => navigate(tendersPath())} />
      </div>

      {/* User Activity + Top Sellers */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">User Activity</h3>
              <p className="text-xs text-gray-400 mt-0.5">Platform engagement, last 7 days</p>
            </div>
            <Users size={16} className="text-primary-600" />
          </div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            <MiniStat icon={Activity} iconColor="#16A34A" value={stats.userActivity.activeNow} label="Active Now" live />
            <MiniStat icon={LogIn} iconColor="#1E4373" value={stats.userActivity.loginsToday} label="Logins Today" />
            <MiniStat icon={CalendarCheck} iconColor="#7C3AED" value={stats.userActivity.loginsWeek} label="Logins / Week" />
            <MiniStat icon={Timer} iconColor="#D97706" value={avgSessionLabel} label="Avg Session" />
          </div>
          {loginTrendData.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={loginTrendData}>
                <defs>
                  <linearGradient id="loginFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1E4373" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1E4373" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="count" stroke="#1E4373" strokeWidth={2.5} fill="url(#loginFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No login activity this week</p>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Top Sellers by Contract Value</h3>
              <p className="text-xs text-gray-400 mt-0.5">Competitor & own revenue on record</p>
            </div>
            <Award size={16} className="text-warning-600" />
          </div>
          {stats.topSellers.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.topSellers} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" stroke="#6b7280" fontSize={12} tickFormatter={formatINR} />
                <YAxis type="category" dataKey="sellerName" stroke="#6b7280" fontSize={11} width={110} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} formatter={(v: number) => formatINR(v)} />
                <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                  {stats.topSellers.map((_, index) => <Cell key={index} fill={SELLER_COLORS[index % SELLER_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No contract data yet</p>
          )}
        </div>
      </div>

      {/* Department Split */}
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Activity size={16} className="text-primary-600" /> Department Split</h3>
        <div className="grid sm:grid-cols-2 gap-5">
          {deptSplitEntries.map((d) => (
            <div key={d.name}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-semibold text-gray-700">{d.name}</span>
                <span className="font-bold text-primary-700">{Math.round((d.value / deptSplitTotal) * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary-600 rounded-full" style={{ width: `${(d.value / deptSplitTotal) * 100}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{d.value} active tenders</p>
            </div>
          ))}
        </div>
      </div>

      {/* States / Support Tickets / Distributors */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Tenders by State</h3>
              <p className="text-xs text-gray-400 mt-0.5">Top active markets</p>
            </div>
            <MapPin size={16} className="text-primary-600" />
          </div>
          {stats.topStates.length > 0 ? (
            <div className="space-y-2.5">
              {stats.topStates.map((s, i) => (
                <div key={s.state} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-24 truncate flex-shrink-0">{s.state}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(s.count / maxState) * 100}%`, background: STATE_COLORS[i % STATE_COLORS.length] }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-6 text-right flex-shrink-0">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No state data yet</p>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Support Tickets</h3>
              <p className="text-xs text-gray-400 mt-0.5">{stats.supportTickets.total} total</p>
            </div>
            <Headset size={16} className="text-violet-600" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Open', value: stats.supportTickets.open, color: '#EF4444' },
              { label: 'In Progress', value: stats.supportTickets.inProgress, color: '#F59E0B' },
              { label: 'Resolved', value: stats.supportTickets.resolved, color: '#0EA5E9' },
              { label: 'Closed', value: stats.supportTickets.closed, color: '#10B981' },
            ].map((t) => (
              <div key={t.label} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                <span className="text-xs text-gray-600 flex-1 truncate">{t.label}</span>
                <span className="text-sm font-bold" style={{ color: t.color }}>{t.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Distributor Network</h3>
              <p className="text-xs text-gray-400 mt-0.5">Registered dealers</p>
            </div>
            <Building2 size={16} className="text-teal-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.distributors.total}</p>
          <p className="text-xs text-gray-400 mb-3">Total Distributors</p>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${stats.distributors.total > 0 ? (stats.distributors.active / stats.distributors.total) * 100 : 0}%`, background: 'linear-gradient(90deg, #0D9488 0%, #10B981 100%)' }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1.5">
            <span>{stats.distributors.active} active</span>
            <span>{stats.distributors.total - stats.distributors.active} inactive</span>
          </div>
        </div>
      </div>

      {/* Contract Value Trend */}
      {stats.contractsTrend.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-1">Contract Value Trend</h3>
          <p className="text-xs text-gray-400 mb-4">Awarded value by month, last 6 months</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.contractsTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} tickFormatter={formatINR} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} formatter={(v: number) => formatINR(v)} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {stats.contractsTrend.map((_, index) => <Cell key={index} fill={CONTRACT_BAR_COLORS[index % CONTRACT_BAR_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Upcoming Deadlines + Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Clock size={16} className="text-primary-600" /> Upcoming Deadlines</h3>
            <button onClick={() => navigate(tendersPath())} className="text-xs font-semibold text-primary-600 hover:underline">View All</button>
          </div>
          {stats.upcomingDeadlines.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No active tenders closing soon.</p>
          ) : (
            <div className="space-y-1.5">
              {stats.upcomingDeadlines.map((t) => {
                const urgent = (t.hoursLeft ?? 999) <= 24;
                return (
                  <button
                    key={t.bid_number}
                    onClick={() => navigate(tendersPath(t.url_id))}
                    className="w-full flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3.5 py-2.5 hover:bg-gray-50 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{t.title || t.bid_number}</p>
                      <p className="text-[11px] text-gray-400 truncate">{t.dept || t.bid_number}</p>
                    </div>
                    <span className={`text-xs font-semibold flex-shrink-0 ${urgent ? 'text-danger-600' : 'text-primary-600'}`}>{timeLeftLabel(t.hoursLeft)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Activity size={16} className="text-primary-600" /> Recent Activity</h3>
          {stats.recentActivity.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No recent tender activity.</p>
          ) : (
            <div className="space-y-1.5">
              {stats.recentActivity.map((a) => (
                <button
                  key={`${a.bid_number}-${a.processing_date}`}
                  onClick={() => navigate(tendersPath(a.url_id))}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3.5 py-2.5 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                      <FileText size={14} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{a.title || a.bid_number}</p>
                      <p className="text-[11px] text-gray-400 truncate">{a.dept}</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0 capitalize">{a.status || 'processed'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
