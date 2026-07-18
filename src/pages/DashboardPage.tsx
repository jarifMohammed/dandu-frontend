import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowUp, Database, Gauge,
  Loader2, PackageSearch, RefreshCw, ShieldCheck, Zap,
} from 'lucide-react';
import { Kpi, Panel, InlineError } from '../components/ui';
import {
  authApi, AuthSession, CurrentUserProfile, DashboardMetrics, DashboardPeriod, BackgroundJobResult,
  InventoryAlertItem,
} from '../lib/authApi';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { InventoryAlerts } from '../components/dashboard/InventoryAlerts';

const PERIODS: { label: string; value: DashboardPeriod }[] = [
  { label: '7D',   value: '7D'   },
  { label: '30D',  value: '30D'  },
  { label: '90D',  value: '90D'  },
  { label: '365D', value: '365D' },
];

const PERIOD_MULTIPLIERS: Record<DashboardPeriod, number> = {
  '7D':   0.23,
  '30D':  1.0,
  '90D':  3.1,
  '365D': 13.2,
};

// Sync step labels shown during animated sync
const SYNC_STEPS = [
  'Connecting to Linnworks API...',
  'Fetching stock levels...',
  'Updating channel listings...',
  'Syncing order metrics...',
  'Finalising & caching data...',
];

export function DashboardPage({ session, profile }: { session: AuthSession; profile: CurrentUserProfile | null }) {
  const displayName = profile?.userProfile?.firstName || session.user.username;

  const [period, setPeriod] = useState<DashboardPeriod>('30D');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState<InventoryAlertItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState(0);
  const [syncResult, setSyncResult] = useState<BackgroundJobResult | null>(null);

  const fetchMetrics = useCallback(async (p: DashboardPeriod, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await authApi.getDashboardMetrics(session.accessToken, p);
      setMetrics(response.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load metrics';
      setError(msg);
      setMetrics({
        salesVelocity: [],
        stockDistribution: [],
        revenueTrend: []
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.accessToken]);

  useEffect(() => {
    fetchMetrics(period);
    // Load alerts once on mount
    authApi.getInventoryAlerts(session.accessToken)
      .then((r) => setAlerts(r.data))
      .catch(() => {})
      .finally(() => setAlertsLoading(false));
  }, [period, fetchMetrics]);

  // Animate sync steps in parallel while the real request runs
  const handleSync = async () => {
    setSyncing(true);
    setSyncStep(0);
    setSyncResult(null);

    // Advance step label every 600ms for a convincing animation
    const interval = setInterval(() => {
      setSyncStep((s) => Math.min(s + 1, SYNC_STEPS.length - 1));
    }, 620);

    try {
      const response = await authApi.triggerLinnworksSync(session.accessToken);
      setSyncResult(response.data);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Sync failed. Please try again.';
      setError(msg);
    } finally {
      clearInterval(interval);
      setSyncing(false);
      setSyncStep(0);
    }
  };

  const totalRevenue = metrics?.revenueTrend?.reduce((sum, row) => sum + row.revenue, 0) ?? 0;
  const totalUnits = metrics?.salesVelocity?.reduce((sum, row) => sum + row.fba + row.mfn, 0) ?? 0;
  
  // Ensure we have something to show if the API returns empty arrays
  const displayVelocity = metrics?.salesVelocity?.length 
    ? metrics.salesVelocity 
    : [
        { channel: 'Amazon US', fba: 0, mfn: 0 },
        { channel: 'eBay US', fba: 0, mfn: 0 },
        { channel: 'Website', fba: 0, mfn: 0 }
      ];

  const displayStock = metrics?.stockDistribution?.length
    ? metrics.stockDistribution
    : [
        { name: 'US FBA', value: 0, fill: '#047857' },
        { name: 'US MAIN', value: 0, fill: '#0f172a' }
      ];

  const channelPerf = metrics?.salesVelocity?.length 
    ? metrics.salesVelocity.map((row) => {
        const units = row.fba + row.mfn;
        return {
          channel: row.channel,
          fulfillment: row.fba && row.mfn ? 'FBA + MFN' : row.fba ? 'FBA' : 'MFN',
          units,
          revenue: totalUnits > 0 ? Math.round((units / totalUnits) * totalRevenue) : 0,
          growth: 0,
          stockCover: 0,
        };
      })
    : [
        { channel: 'Amazon US', fulfillment: 'FBA', units: 0, revenue: 0, growth: 0, stockCover: 0 },
        { channel: 'eBay US', fulfillment: 'MFN', units: 0, revenue: 0, growth: 0, stockCover: 0 },
        { channel: 'Website', fulfillment: 'MFN', units: 0, revenue: 0, growth: 0, stockCover: 0 }
      ];

  return (
    <div className="space-y-4">
      {/* Top bar: KPIs + action buttons */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="grid flex-1 gap-3 md:grid-cols-4">
          <Kpi icon={<ShieldCheck className="size-5" />} label="Session"  value="Active"   detail="Bearer auth online" />
          <Kpi icon={<Database className="size-5" />}    label="Database" value="Railway"  detail="MySQL schema synced" />
          <Kpi icon={<PackageSearch className="size-5" />} label="SKU API" value="Protected" detail="/sku-dashboard/search" />
          <Kpi icon={<Gauge className="size-5" />}       label="User"     value={displayName} detail={session.user.verified ? 'Verified' : 'Pending verify'} />
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => fetchMetrics(period, true)}
            disabled={refreshing || syncing}
            title="Refresh dashboard data"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleSync}
            disabled={syncing || refreshing}
            title="Pull latest data from Linnworks"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-800 transition disabled:opacity-60"
          >
            {syncing
              ? <Loader2 className="size-4 animate-spin" />
              : <Zap className="size-4" />
            }
            {syncing ? 'Syncing...' : 'Sync Linnworks'}
          </button>
        </div>
      </div>

      {/* Sync progress banner */}
      {syncing && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Loader2 className="size-4 animate-spin shrink-0" />
          <div>
            <span className="font-bold">Linnworks Sync in progress</span>
            <span className="ml-2 text-emerald-600">{SYNC_STEPS[syncStep]}</span>
          </div>
          {/* Step dots */}
          <div className="ml-auto flex items-center gap-1">
            {SYNC_STEPS.map((_, i) => (
              <span key={i} className={`size-1.5 rounded-full transition-colors ${i <= syncStep ? 'bg-emerald-600' : 'bg-emerald-200'}`} />
            ))}
          </div>
        </div>
      )}

      {/* Sync success banner */}
      {syncResult && !syncing && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="font-bold">Sync queued</span>
          <span>Job: <strong>{syncResult.jobId ?? 'pending'}</strong></span>
          <span className="text-emerald-600">Running in the background</span>
          <button onClick={() => setSyncResult(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {error && <InlineError text={error} />}

      {loading ? (
        <div className="h-64 flex items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <Loader2 className="size-8 animate-spin text-emerald-600" />
        </div>
      ) : metrics ? (
        <>
          {/* Sales Velocity — with period pills */}
          <Panel title="Sales Velocity">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-500">Units sold (FBA + MFN) grouped by channel</p>
              {/* Period pill selector */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                {PERIODS.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => setPeriod(value)}
                    className={`rounded-lg px-3 py-1 text-xs font-black transition ${
                      period === value
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayVelocity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="channel" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }} />
                  <Bar dataKey="fba" name="FBA Units" stackId="a" fill="#047857" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="mfn" name="MFN Units" stackId="a" fill="#0f172a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Stock Distribution */}
            <div className="lg:col-span-1">
              <Panel title="Global Stock Distribution">
                <div className="h-64 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: '12px' }} />
                      <Pie data={displayStock} cx="50%" cy="45%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                        {displayStock.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            {/* Channel Performance — period-aware */}
            <div className="lg:col-span-2">
              <Panel title={`Channel Performance — ${period}`}>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-2 pr-4 text-left   text-xs font-black uppercase tracking-wide text-slate-400">Channel</th>
                        <th className="py-2 pr-4 text-right  text-xs font-black uppercase tracking-wide text-slate-400">Units</th>
                        <th className="py-2 pr-4 text-right  text-xs font-black uppercase tracking-wide text-slate-400">Revenue</th>
                        <th className="py-2 pr-4 text-right  text-xs font-black uppercase tracking-wide text-slate-400">Growth</th>
                        <th className="py-2 text-right       text-xs font-black uppercase tracking-wide text-slate-400">Stock Cover</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {channelPerf.map((row) => (
                        <tr key={row.channel} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="font-semibold text-slate-900">{row.channel}</div>
                            <div className="text-[11px] text-slate-400 font-medium">{row.fulfillment}</div>
                          </td>
                          <td className="py-3 pr-4 text-right font-semibold text-slate-700">{row.units.toLocaleString()}</td>
                          <td className="py-3 pr-4 text-right font-bold text-emerald-700">${row.revenue.toLocaleString()}</td>
                          <td className="py-3 pr-4 text-right">
                            <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2 py-0.5 ${
                              row.growth >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                            }`}>
                              {row.growth >= 0
                                ? <ArrowUp className="size-3" />
                                : <AlertTriangle className="size-3" />}
                              {Math.abs(row.growth)}%
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <span className={`text-sm font-bold ${
                              row.stockCover <= 21 ? 'text-red-600' : row.stockCover <= 45 ? 'text-amber-600' : 'text-slate-700'
                            }`}>
                              {row.stockCover}d
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </div>
        </>
      ) : null}

      {/* Inventory Alerts — always visible */}
      <div>
        {alertsLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
            <Loader2 className="size-4 animate-spin" /> Loading inventory alerts...
          </div>
        ) : (
          <InventoryAlerts alerts={alerts} />
        )}
      </div>
    </div>
  );
}
