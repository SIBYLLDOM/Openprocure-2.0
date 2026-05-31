import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  FileText, Clock, CheckCircle, TrendingUp, TrendingDown,
  Award, AlertTriangle, Target, Star, Zap, Users, ChevronUp,
  ChevronDown, Medal, Crown, Flame, BarChart2, Filter
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const ICON_MAP = {
  FileText, Clock, CheckCircle, TrendingUp, TrendingDown,
  Award, AlertTriangle, Target, Star, Zap, Users, BarChart2
};

/* ─────────────────────────────────────────────
   STATIC FALLBACK DATA (For initial load)
   ───────────────────────────────────────────── */
const PRODUCTIVITY_DATA_STATIC = [
  { week: 'Wk 1', tasks: 32, efficiency: 78 },
  { week: 'Wk 2', tasks: 38, efficiency: 82 },
  { week: 'Wk 3', tasks: 35, efficiency: 80 },
  { week: 'Wk 4', tasks: 42, efficiency: 85 },
  { week: 'Wk 5', tasks: 48, efficiency: 88 },
];

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */
const KPI_DATA = {
  activeTenders: { value: 24, change: 12, trend: 'up', label: 'Active Tenders', color: 'blue' },
  totalTasks: { value: 156, change: 8, trend: 'up', label: 'Total Tasks', color: 'purple' },
  completed: { value: 89, change: 15, trend: 'up', label: 'Completed', color: 'green' },
  pending: { value: 67, change: -5, trend: 'down', label: 'Pending', color: 'amber' },
  efficiency: { value: 82, change: 5, trend: 'up', label: 'Efficiency', color: 'teal', suffix: '%' },
};

const ALERTS = [
  { type: 'Overdue Tasks', count: 5, severity: 'high', icon: AlertTriangle },
  { type: 'Deadline Risk', count: 12, severity: 'medium', icon: Clock },
  { type: 'Low Performance', count: 3, severity: 'low', icon: TrendingDown },
];

const DEPT_DATA = [
  { name: 'Finance', completed: 45, pending: 12, total: 57, efficiency: 89 },
  { name: 'Legal', completed: 38, pending: 15, total: 53, efficiency: 82 },
  { name: 'Operations', completed: 52, pending: 28, total: 80, efficiency: 75 },
  { name: 'HR', completed: 28, pending: 18, total: 46, efficiency: 68 },
];

const PRODUCTIVITY_DATA = [
  { week: 'Wk 1', tasks: 32, efficiency: 78 },
  { week: 'Wk 2', tasks: 38, efficiency: 82 },
  { week: 'Wk 3', tasks: 35, efficiency: 80 },
  { week: 'Wk 4', tasks: 42, efficiency: 85 },
  { week: 'Wk 5', tasks: 48, efficiency: 88 },
];

const EMPLOYEES = [
  {
    id: 1, initials: 'PM', name: 'Priya Mehta', role: 'Senior Analyst', dept: 'Finance',
    status: 'online', tasksTotal: 18, tasksDone: 17, efficiency: 94, points: 980,
    streak: 12, avatar: 'blue', isBest: true, trend: 'up', thisMonth: [85, 88, 91, 94],
  },
  {
    id: 2, initials: 'SR', name: 'Sneha Rao', role: 'Procurement Lead', dept: 'Finance',
    status: 'online', tasksTotal: 16, tasksDone: 14, efficiency: 88, points: 850,
    streak: 8, avatar: 'green', isBest: false, trend: 'up', thisMonth: [80, 83, 85, 88],
  },
  {
    id: 3, initials: 'RS', name: 'Rahul Sharma', role: 'Contract Manager', dept: 'Legal',
    status: 'online', tasksTotal: 14, tasksDone: 12, efficiency: 86, points: 820,
    streak: 5, avatar: 'teal', isBest: false, trend: 'up', thisMonth: [78, 80, 83, 86],
  },
  {
    id: 4, initials: 'AJ', name: 'Anita Joshi', role: 'Project Lead', dept: 'Operations',
    status: 'busy', tasksTotal: 22, tasksDone: 16, efficiency: 72, points: 690,
    streak: 3, avatar: 'purple', isBest: false, trend: 'down', thisMonth: [75, 78, 74, 72],
  },
  {
    id: 5, initials: 'VK', name: 'Vikram Kumar', role: 'Ops Coordinator', dept: 'Operations',
    status: 'online', tasksTotal: 19, tasksDone: 14, efficiency: 74, points: 710,
    streak: 4, avatar: 'coral', isBest: false, trend: 'up', thisMonth: [66, 68, 72, 74],
  },
  {
    id: 6, initials: 'DK', name: 'Dev Kapoor', role: 'Compliance Officer', dept: 'HR',
    status: 'busy', tasksTotal: 11, tasksDone: 6, efficiency: 55, points: 430,
    streak: 0, avatar: 'amber', isBest: false, trend: 'down', thisMonth: [62, 58, 60, 55],
  },
];

const TENDERS = [
  { id: 'TND-2024-001', name: 'Government Infrastructure Project', dept: 'Operations', progress: 85, deadline: '15 Jan', status: 'On Track', priority: 'High' },
  { id: 'TND-2024-002', name: 'Healthcare Equipment Supply', dept: 'Finance', progress: 92, deadline: '10 Jan', status: 'On Track', priority: 'Medium' },
  { id: 'TND-2024-003', name: 'IT Services & Maintenance', dept: 'Operations', progress: 45, deadline: '08 Jan', status: 'At Risk', priority: 'High' },
  { id: 'TND-2024-004', name: 'Construction Materials Supply', dept: 'Legal', progress: 78, deadline: '20 Jan', status: 'On Track', priority: 'Medium' },
  { id: 'TND-2024-005', name: 'Educational Software License', dept: 'HR', progress: 30, deadline: '12 Jan', status: 'Delayed', priority: 'High' },
];

/* ─────────────────────────────────────────────
   HELPERS / STYLES
───────────────────────────────────────────── */
const effColor = (e) => e >= 80 ? '#059669' : e >= 70 ? '#d97706' : '#dc2626';
const progColor = (p) => p >= 80 ? '#059669' : p >= 50 ? '#d97706' : '#dc2626';

const AVATAR_COLORS = {
  blue: { bg: '#dbeafe', text: '#1e40af' },
  green: { bg: '#dcfce7', text: '#166534' },
  teal: { bg: '#ccfbf1', text: '#0f766e' },
  purple: { bg: '#ede9fe', text: '#5b21b6' },
  coral: { bg: '#fee2e2', text: '#991b1b' },
  amber: { bg: '#fef3c7', text: '#92400e' },
};

const STATUS_DOT = { online: '#22c55e', busy: '#f59e0b', offline: '#94a3b8' };

/* ─────────────────────────────────────────────
   MINI SPARKLINE (canvas)
───────────────────────────────────────────── */
const Sparkline = ({ data, color }) => {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const w = canvas.offsetWidth || 80;
    const h = 28;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => [
      (i / (data.length - 1)) * w,
      h - ((v - min) / range) * (h - 6) - 3,
    ]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineTo(pts[pts.length - 1][0], h);
    ctx.lineTo(pts[0][0], h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color + '40');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fill();
  }, [data, color]);
  return <canvas ref={ref} style={{ width: '100%', height: 28, display: 'block' }} />;
};

/* ─────────────────────────────────────────────
   PILL BADGE
───────────────────────────────────────────── */
const Pill = ({ children, color }) => {
  const map = {
    green: { bg: '#dcfce7', text: '#166534' },
    amber: { bg: '#fef3c7', text: '#92400e' },
    red: { bg: '#fee2e2', text: '#991b1b' },
    blue: { bg: '#dbeafe', text: '#1e40af' },
    gray: { bg: '#f1f5f9', text: '#475569' },
    gold: { bg: '#fef9c3', text: '#713f12' },
  };
  const c = map[color] || map.gray;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.text,
      letterSpacing: '0.02em',
    }}>
      {children}
    </span>
  );
};

/* ─────────────────────────────────────────────
   KPI CARD
───────────────────────────────────────────── */
const KpiCard = ({ icon: Icon, value, label, change, trend, color, suffix = '' }) => {
  const colorMap = {
    blue: { icon: '#dbeafe', iconText: '#1e40af' },
    purple: { icon: '#ede9fe', iconText: '#5b21b6' },
    green: { icon: '#dcfce7', iconText: '#166534' },
    amber: { icon: '#fef3c7', iconText: '#92400e' },
    teal: { icon: '#ccfbf1', iconText: '#0f766e' },
  };
  const c = colorMap[color];
  return (
    <div className="kpi-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: c.icon,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color={c.iconText} />
        </div>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 2,
          fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
          background: trend === 'up' ? '#dcfce7' : '#fee2e2',
          color: trend === 'up' ? '#166534' : '#991b1b',
        }}>
          {trend === 'up' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {Math.abs(change)}%
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
        {value}{suffix}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   BEST EMPLOYEE CARD
───────────────────────────────────────────── */
const BestEmployeeCard = ({ emp }) => {
  const av = AVATAR_COLORS[emp.avatar];
  return (
    <div className="best-emp-card">
      {/* Crown badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, background: '#fef9c3',
          border: '1px solid #fde68a', borderRadius: 99, padding: '4px 12px',
        }}>
          <Crown size={13} color="#b45309" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#713f12', letterSpacing: '0.04em' }}>
            BEST EMPLOYEE OF THE MONTH
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Avatar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: av.bg, color: av.text,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700,
            border: '3px solid #fbbf24',
            boxShadow: '0 0 0 4px #fef9c3',
          }}>
            {emp.initials}
          </div>
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 18, height: 18, borderRadius: '50%',
            background: STATUS_DOT[emp.status], border: '2px solid white',
          }} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{emp.name}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{emp.role} · {emp.dept}</div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>{emp.efficiency}%</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Efficiency</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{emp.tasksDone}<span style={{ fontSize: 13, color: '#94a3b8' }}>/{emp.tasksTotal}</span></div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Tasks done</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#b45309' }}>{emp.points}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Points</div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Flame size={16} color="#ef4444" />
                <span style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{emp.streak}</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Day streak</div>
            </div>
          </div>

          {/* Trend sparkline */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Efficiency trend — this month</div>
            <div style={{ width: '100%', maxWidth: 240 }}>
              <Sparkline data={emp.thisMonth} color="#059669" />
            </div>
          </div>
        </div>

        {/* Medal */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Medal size={26} color="white" />
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Task completion</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>
            {Math.round((emp.tasksDone / emp.tasksTotal) * 100)}%
          </span>
        </div>
        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${Math.round((emp.tasksDone / emp.tasksTotal) * 100)}%`,
            background: 'linear-gradient(90deg, #34d399, #059669)',
            transition: 'width 1s ease',
          }} />
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   EMPLOYEE ROW
───────────────────────────────────────────── */
const EmpRow = ({ emp, rank }) => {
  const av = AVATAR_COLORS[emp.avatar];
  const pct = Math.round((emp.tasksDone / emp.tasksTotal) * 100);
  const rankStyle = rank === 1
    ? { bg: '#fef9c3', color: '#b45309', icon: <Crown size={11} color="#b45309" /> }
    : rank === 2
      ? { bg: '#f1f5f9', color: '#475569', icon: null }
      : rank === 3
        ? { bg: '#fef3c7', color: '#92400e', icon: null }
        : { bg: '#f8fafc', color: '#94a3b8', icon: null };

  return (
    <tr className="emp-row">
      <td style={{ padding: '10px 12px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          width: 26, height: 26, borderRadius: 8, fontSize: 11, fontWeight: 700,
          background: rankStyle.bg, color: rankStyle.color,
        }}>
          {rankStyle.icon || rank}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: av.bg, color: av.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
            }}>
              {emp.initials}
            </div>
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 9, height: 9, borderRadius: '50%',
              background: STATUS_DOT[emp.status], border: '1.5px solid white',
            }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{emp.name}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{emp.role}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <Pill color="gray">{emp.dept}</Pill>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
          {emp.tasksDone}<span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>/{emp.tasksTotal}</span>
        </span>
      </td>
      <td style={{ padding: '10px 12px', minWidth: 140 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${pct}%`,
              background: effColor(emp.efficiency),
              transition: 'width .6s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: effColor(emp.efficiency), minWidth: 34 }}>
            {emp.efficiency}%
          </span>
        </div>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Flame size={12} color={emp.streak > 0 ? '#ef4444' : '#cbd5e1'} />
          <span style={{ fontSize: 12, fontWeight: 600, color: emp.streak > 0 ? '#ef4444' : '#94a3b8' }}>
            {emp.streak}d
          </span>
        </div>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>
          {emp.points}
        </span>
      </td>
      <td style={{ padding: '10px 12px', minWidth: 90 }}>
        <Sparkline data={emp.thisMonth} color={emp.trend === 'up' ? '#059669' : '#ef4444'} />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <Pill color={emp.trend === 'up' ? 'green' : 'red'}>
          {emp.trend === 'up' ? '▲ Up' : '▼ Down'}
        </Pill>
      </td>
    </tr>
  );
};

/* ─────────────────────────────────────────────
   CUSTOM TOOLTIP
───────────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#0f172a' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginTop: 2 }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────
   MAIN DASHBOARD
───────────────────────────────────────────── */
const Dashboard = () => {
  const [timeFilter, setTimeFilter] = useState('This Month');
  const [deptFilter, setDeptFilter] = useState('All Departments');
  const [empSort, setEmpSort] = useState('efficiency');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/workspaces/command-center`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch dashboard data');
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#64748b' }}>
        <div style={{ textAlign: 'center' }}>
          <Zap size={48} className="animate-pulse" style={{ color: '#3b82f6', marginBottom: 16 }} />
          <p style={{ fontSize: 18, fontWeight: 600 }}>Syncing Command Center...</p>
        </div>
      </div>
    );
  }

  const kpiData = data?.kpiData || KPI_DATA;
  const alerts = data?.alerts || ALERTS;
  const deptData = data?.deptData || DEPT_DATA;
  const employees = data?.employeeLeaderboard || EMPLOYEES;
  const tenders = data?.activeTenders || TENDERS;

  const sortedEmps = [...employees].sort((a, b) => b[empSort] - a[empSort]);
  const bestEmp = employees.find(e => e.isBest) || employees[0];

  const filteredTenders = deptFilter === 'All Departments'
    ? tenders
    : tenders.filter(t => t.dept === deptFilter);

  return (
    <>
      {/* ── GLOBAL STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        .db-root { font-family: 'DM Sans', sans-serif; background: #f8fafc; min-height: 100vh; padding: 0; }

        /* Top nav bar */
        .db-topbar {
          background: #fff; border-bottom: 1px solid #e2e8f0;
          padding: 14px 28px; display: flex; align-items: center;
          justify-content: space-between; position: sticky; top: 0; z-index: 50;
          gap: 12px; flex-wrap: wrap;
        }
        .db-topbar-left { display: flex; align-items: center; gap: 12px; }
        .db-logo {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, #1e40af, #0f766e);
          display: flex; align-items: center; justify-content: center;
        }
        .db-title { font-size: 17px; font-weight: 700; color: #0f172a; }
        .db-subtitle { font-size: 12px; color: #94a3b8; margin-top: 1px; }
        .db-topbar-right { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .db-select {
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          padding: 7px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
          background: #fff; color: #0f172a; cursor: pointer; outline: none;
        }
        .db-select:focus { border-color: #3b82f6; }
        .pill-group { display: flex; background: #f1f5f9; border-radius: 8px; padding: 3px; }
        .pill-btn {
          font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 500;
          padding: 5px 14px; border-radius: 6px; border: none; cursor: pointer;
          color: #64748b; background: transparent; transition: all .15s;
        }
        .pill-btn.active { background: #fff; color: #0f172a; font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }

        /* Main content */
        .db-body { padding: 24px 28px; max-width: 1600px; margin: 0 auto; }

        /* KPI grid */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px; margin-bottom: 16px;
        }
        .kpi-card {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
          padding: 16px; transition: box-shadow .2s;
        }
        .kpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }

        /* Alert strip */
        .alert-strip { display: flex; gap: 12px; margin-bottom: 16px; }
        .alert-card {
          flex: 1; display: flex; align-items: center; gap: 14px;
          padding: 14px 18px; border-radius: 12px; border: 1px solid;
        }
        .alert-card.high   { background: #fff1f2; border-color: #fda4af; }
        .alert-card.medium { background: #fffbeb; border-color: #fcd34d; }
        .alert-card.low    { background: #eff6ff; border-color: #93c5fd; }
        .alert-count { font-size: 26px; font-weight: 700; line-height: 1; }
        .high   .alert-count { color: #be123c; }
        .medium .alert-count { color: #b45309; }
        .low    .alert-count { color: #1d4ed8; }
        .alert-label { font-size: 12px; margin-top: 2px; }
        .high   .alert-label { color: #9f1239; }
        .medium .alert-label { color: #92400e; }
        .low    .alert-label { color: #1e40af; }
        .alert-icon { opacity: 0.7; }

        /* Main two-col */
        .main-grid { display: grid; grid-template-columns: 1fr 360px; gap: 14px; margin-bottom: 14px; }

        /* Best employee card */
        .best-emp-card {
          background: linear-gradient(135deg, #fffbeb 0%, #fff 60%);
          border: 1.5px solid #fbbf24; border-radius: 14px; padding: 20px;
          margin-bottom: 14px;
        }

        /* Section card */
        .section-card {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
          padding: 20px; overflow: hidden;
        }
        .section-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
        .section-sub   { font-size: 12px; color: #94a3b8; margin-bottom: 16px; }

        /* Dept efficiency bars */
        .eff-bar-item { margin-bottom: 12px; }
        .eff-bar-header { display: flex; justify-content: space-between; margin-bottom: 5px; }
        .eff-bar-name  { font-size: 12px; font-weight: 500; color: #374151; }
        .eff-bar-score { font-size: 12px; font-weight: 700; }
        .eff-bar-track { height: 7px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
        .eff-bar-fill  { height: 100%; border-radius: 99px; transition: width .8s ease; }

        /* Leaderboard row */
        .leader-strip { display: flex; gap: 12px; margin-bottom: 14px; }
        .leader-card {
          flex: 1; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
          padding: 14px 16px; display: flex; align-items: center; gap: 12px;
        }
        .leader-card.gold-card { border-color: #fbbf24; background: #fffbeb; }
        .leader-icon { font-size: 22px; flex-shrink: 0; }
        .leader-tag  { font-size: 11px; color: #94a3b8; font-weight: 500; }
        .leader-name { font-size: 15px; font-weight: 700; color: #0f172a; margin: 1px 0; }
        .leader-stat { font-size: 12px; color: #64748b; }
        .gold-card .leader-tag  { color: #92400e; }
        .gold-card .leader-name { color: #451a03; }
        .gold-card .leader-stat { color: #b45309; }

        /* Employee table */
        .emp-section { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; margin-bottom: 14px; }
        .emp-table-header { padding: 18px 20px 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid #f1f5f9; }
        .emp-table { width: 100%; border-collapse: collapse; }
        .emp-table th {
          font-size: 11px; font-weight: 600; color: #94a3b8; text-align: left;
          padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid #f1f5f9;
          text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
        }
        .emp-row td { border-bottom: 1px solid #f8fafc; vertical-align: middle; }
        .emp-row:last-child td { border-bottom: none; }
        .emp-row:hover td { background: #f8fafc; }
        .emp-sort-btn {
          font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600;
          padding: 6px 14px; border-radius: 8px; border: 1px solid #e2e8f0;
          background: #fff; cursor: pointer; color: #374151;
          display: flex; align-items: center; gap: 6px;
          transition: all .15s;
        }
        .emp-sort-btn:hover { border-color: #3b82f6; color: #1d4ed8; }
        .emp-sort-btn.active { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }

        /* Tender table */
        .tender-section { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; margin-bottom: 14px; }
        .tender-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .tender-table th {
          font-size: 11px; font-weight: 600; color: #94a3b8; text-align: left;
          padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #f1f5f9;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .tender-table td { padding: 12px 14px; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
        .tender-row:last-child td { border-bottom: none; }
        .tender-row:hover td { background: #f8fafc; }
        .tender-id { font-family: 'DM Mono', monospace; font-size: 11px; color: #94a3b8; }
        .tender-name { font-weight: 600; color: #0f172a; font-size: 13px; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

        /* RESPONSIVE */
        @media (max-width: 1200px) {
          .main-grid { grid-template-columns: 1fr; }
          .kpi-grid  { grid-template-columns: repeat(3, minmax(0,1fr)); }
        }
        @media (max-width: 900px) {
          .kpi-grid    { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .alert-strip { flex-direction: column; }
          .leader-strip { flex-wrap: wrap; }
          .db-body { padding: 16px; }
        }
        @media (max-width: 600px) {
          .kpi-grid  { grid-template-columns: 1fr 1fr; }
          .db-topbar { padding: 12px 16px; }
          .emp-table-header { flex-direction: column; align-items: flex-start; }
          .tender-table th:nth-child(3),
          .tender-table td:nth-child(3) { display: none; }
        }
        @media (max-width: 480px) {
          .kpi-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="db-root">
        {/* ── TOP NAV ── */}
        <div className="db-topbar">
          <div className="db-topbar-left">
            <div className="db-logo">
              <BarChart2 size={18} color="#fff" />
            </div>
            <div>
              <div className="db-title">Command Center</div>
              <div className="db-subtitle">Tender &amp; Employee Management</div>
            </div>
          </div>
          <div className="db-topbar-right">
            <select
              className="db-select"
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
            >
              {['All Departments', 'Finance', 'Legal', 'Operations', 'HR'].map(d => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <div className="pill-group">
              {['This Month', 'Last Month', 'This Quarter', 'This Year'].map(t => (
                <button
                  key={t}
                  className={`pill-btn${timeFilter === t ? ' active' : ''}`}
                  onClick={() => setTimeFilter(t)}
                >
                  {t.replace('This ', '').replace('Last ', '↩ ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="db-body">
          {/* ── KPI CARDS ── */}
          <div className="kpi-grid">
            <KpiCard icon={FileText}  {...kpiData.activeTenders} />
            <KpiCard icon={Target}    {...kpiData.totalTasks} />
            <KpiCard icon={CheckCircle} {...kpiData.completed} />
            <KpiCard icon={Clock}     {...kpiData.pending} />
            <KpiCard icon={Award}     {...kpiData.efficiency} />
          </div>

          {/* ── ALERT STRIP ── */}
          <div className="alert-strip">
            {alerts.map((a, i) => {
              const Icon = ICON_MAP[a.icon] || AlertTriangle;
              return (
                <div key={i} className={`alert-card ${a.severity}`}>
                  <div className="alert-icon">
                    <Icon size={22} color={a.severity === 'high' ? '#be123c' : a.severity === 'medium' ? '#b45309' : '#1d4ed8'} />
                  </div>
                  <div>
                    <div className="alert-count">{a.count}</div>
                    <div className="alert-label">{a.type}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── BEST EMPLOYEE SPOTLIGHT ── */}
          {bestEmp && <BestEmployeeCard emp={bestEmp} />}

          {/* ── MAIN GRID: DEPT + TRENDS ── */}
          <div className="main-grid">
            {/* Department performance */}
            <div className="section-card">
              <div className="section-title">Department performance</div>
              <div className="section-sub">Task completion by department</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={deptData} barGap={6} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tick={{ fill: '#64748b' }} />
                  <YAxis stroke="#94a3b8" fontSize={12} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="completed" fill="#34d399" radius={[5, 5, 0, 0]} name="Completed" />
                  <Bar dataKey="pending" fill="#fbbf24" radius={[5, 5, 0, 0]} name="Pending" />
                </BarChart>
              </ResponsiveContainer>

              {/* Efficiency progress bars */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Efficiency by department
                </div>
                {[...deptData].sort((a, b) => b.efficiency - a.efficiency).map((d, i) => (
                  <div key={i} className="eff-bar-item">
                    <div className="eff-bar-header">
                      <span className="eff-bar-name">{d.name}</span>
                      <span className="eff-bar-score" style={{ color: effColor(d.efficiency) }}>
                        {d.efficiency}%
                      </span>
                    </div>
                    <div className="eff-bar-track">
                      <div className="eff-bar-fill" style={{
                        width: `${d.efficiency}%`,
                        background: effColor(d.efficiency),
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Productivity trend */}
            <div className="section-card">
              <div className="section-title">Productivity trend</div>
              <div className="section-sub">Weekly · last 5 weeks</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={PRODUCTIVITY_DATA_STATIC}>
                  <defs>
                    <linearGradient id="gTasks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gEff" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="week" stroke="#94a3b8" fontSize={12} tick={{ fill: '#64748b' }} />
                  <YAxis stroke="#94a3b8" fontSize={12} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="tasks" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gTasks)" name="Tasks" dot={{ r: 4, fill: '#3b82f6' }} />
                  <Area type="monotone" dataKey="efficiency" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#gEff)" name="Efficiency %" dot={{ r: 4, fill: '#8b5cf6' }} />
                </AreaChart>
              </ResponsiveContainer>

              {/* Leaderboard condensed */}
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { emoji: '🏆', tag: 'Top dept', name: deptData[0]?.name || 'N/A', stat: `${deptData[0]?.efficiency || 0}% efficiency` },
                  { emoji: '📈', tag: 'Most active', name: sortedEmps[0]?.name || 'N/A', stat: `${sortedEmps[0]?.tasksDone || 0} tasks done` },
                  { emoji: '💡', tag: 'Project count', name: 'Total Tenders', stat: `${kpiData.activeTenders.value} Active` },
                ].map((l, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', background: i === 0 ? '#fffbeb' : '#f8fafc',
                    borderRadius: 8, border: `1px solid ${i === 0 ? '#fde68a' : '#f1f5f9'}`,
                  }}>
                    <span style={{ fontSize: 16 }}>{l.emoji}</span>
                    <div>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{l.tag} · </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{l.name}</span>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>{l.stat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── EMPLOYEE LEADERBOARD TABLE ── */}
          <div className="emp-section">
            <div className="emp-table-header">
              <div>
                <div className="section-title" style={{ margin: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users size={16} color="#0f172a" />
                    Employee leaderboard
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Ranked by performance — click column to re-sort
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { key: 'efficiency', label: 'Efficiency' },
                  { key: 'points', label: 'Points' },
                  { key: 'tasksDone', label: 'Tasks done' },
                  { key: 'streak', label: 'Streak' },
                ].map(s => (
                  <button
                    key={s.key}
                    className={`emp-sort-btn${empSort === s.key ? ' active' : ''}`}
                    onClick={() => setEmpSort(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="emp-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Employee</th>
                    <th>Department</th>
                    <th style={{ textAlign: 'center' }}>Tasks</th>
                    <th>Efficiency</th>
                    <th style={{ textAlign: 'center' }}>Streak</th>
                    <th style={{ textAlign: 'center' }}>Points</th>
                    <th style={{ minWidth: 100 }}>Trend</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEmps.map((emp, i) => (
                    <EmpRow key={emp.id} emp={emp} rank={i + 1} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── ACTIVE TENDERS TABLE ── */}
          <div className="tender-section">
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  <FileText size={15} color="#0f172a" />
                  Active tenders &amp; critical tasks
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Real-time status tracking · {filteredTenders.length} tenders shown
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                <Filter size={13} />
                {deptFilter}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="tender-table">
                <thead>
                  <tr>
                    <th>Tender ID</th>
                    <th>Name</th>
                    <th>Dept</th>
                    <th style={{ minWidth: 160 }}>Progress</th>
                    <th>Deadline</th>
                    <th>Status</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTenders.map((t, i) => {
                    const sc = t.status === 'Completed' ? 'green' : t.status === 'Active' ? 'blue' : 'amber';
                    const pc = t.priority === 'High' ? 'red' : 'amber';
                    return (
                      <tr key={i} className="tender-row">
                        <td><span className="tender-id">{t.id}</span></td>
                        <td><span className="tender-name">{t.name}</span></td>
                        <td><Pill color="gray">{t.dept || 'N/A'}</Pill></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', minWidth: 80 }}>
                              <div style={{
                                height: '100%', borderRadius: 99,
                                width: `${t.progress}%`,
                                background: progColor(t.progress),
                                transition: 'width .6s ease',
                              }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: progColor(t.progress), minWidth: 32 }}>
                              {t.progress}%
                            </span>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>{t.deadline}</td>
                        <td><Pill color={sc}>{t.status}</Pill></td>
                        <td><Pill color={pc}>{t.priority}</Pill></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: 12, color: '#cbd5e1' }}>
            Command Center · {timeFilter} · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;