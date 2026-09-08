import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  LayoutDashboard, KanbanSquare, Package, FileText, Sparkles, StickyNote, Settings,
} from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import OverviewTab from './workspace/OverviewTab';
import WorkspaceTab from './workspace/WorkspaceTab';
import ProductsTab from './workspace/ProductsTab';
import DocumentsTab from './workspace/DocumentsTab';
import DocPrepTab from './workspace/DocPrepTab';
import MyDocsTab from './workspace/MyDocsTab';
import SettingsTab from './workspace/SettingsTab';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'workspace', label: 'Workspace', icon: KanbanSquare },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'docprep', label: 'Doc Prep', icon: Sparkles },
  { key: 'mydocs', label: 'My Docs', icon: StickyNote },
  { key: 'settings', label: 'Settings', icon: Settings },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// Clone of the automation site's "Tender Hub" (/workspace/:tenderId) — opens
// from Active Workspaces' "Open Workspace" button. See
// backend/controllers/workspaceController.js for the per-partner scoping
// rationale that differs from the original's shared internal tool.
const TenderHubPage = () => {
  const { bidNumber: bidUrlId } = useParams();
  const [tab, setTab] = useState<TabKey>('overview');

  usePageHeader('Tender Hub', bidUrlId ? bidUrlId.replace(/_/g, '/') : undefined);

  if (!bidUrlId) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-1.5 flex flex-wrap gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                active ? 'bg-primary-950 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <OverviewTab bidUrlId={bidUrlId} />}
      {tab === 'workspace' && <WorkspaceTab bidUrlId={bidUrlId} />}
      {tab === 'products' && <ProductsTab bidUrlId={bidUrlId} />}
      {tab === 'documents' && <DocumentsTab bidUrlId={bidUrlId} />}
      {tab === 'docprep' && <DocPrepTab bidUrlId={bidUrlId} />}
      {tab === 'mydocs' && <MyDocsTab bidUrlId={bidUrlId} />}
      {tab === 'settings' && <SettingsTab bidUrlId={bidUrlId} />}
    </div>
  );
};

export default TenderHubPage;
