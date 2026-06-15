import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Loader2, PackageSearch, RefreshCw } from 'lucide-react';
import { Empty, InlineError, Panel } from '../components/ui';
import { authApi, AuthSession, SkuFilterParams, SkuMetrics } from '../lib/authApi';
import { SkuDataTable } from '../components/sku/SkuDataTable';
import { RestockCalculator } from '../components/sku/RestockCalculator';
import { ProfitCalculator } from '../components/sku/ProfitCalculator';
import { useVirtualizer } from '@tanstack/react-virtual';

export function SkuSearchPage({ session }: { session: AuthSession }) {
  const [filters, setFilters] = useState<SkuFilterParams>({ q: '', stockStatus: 'ALL', channel: 'ALL' });
  const [activeFilters, setActiveFilters] = useState<SkuFilterParams>(filters);
  
  const [items, setItems] = useState<SkuMetrics[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  
  const [selectedSku, setSelectedSku] = useState<SkuMetrics | null>(null);
  const [refreshingSku, setRefreshingSku] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);

  // Debounce the text search
  useEffect(() => {
    const handler = setTimeout(() => {
      setActiveFilters(filters);
    }, 500);
    return () => clearTimeout(handler);
  }, [filters]);

  const fetchSkus = async (appliedFilters: SkuFilterParams, cursor?: string) => {
    setError('');
    if (cursor) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await authApi.browseSkus(session.accessToken, appliedFilters, cursor);
      if (cursor) {
        setItems(prev => [...prev, ...response.data.items]);
      } else {
        setItems(response.data.items);
      }
      setNextCursor(response.data.nextCursor);
      setTotal(response.data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch SKUs');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Fetch when activeFilters change
  useEffect(() => {
    let mounted = true;
    if (mounted) fetchSkus(activeFilters);
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters]);

  const loadMore = () => {
    if (nextCursor && !loadingMore) {
      fetchSkus(activeFilters, nextCursor);
    }
  };

  // Set up the virtualizer
  // We add 1 to the count if there's a nextCursor to render the "Load More" row
  const rowCount = items.length + (nextCursor ? 1 : 0);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88, // estimated row height in px
    overscan: 5,
  });

  const refreshSelectedSku = async () => {
    if (!selectedSku) return;
    setRefreshingSku(true);
    try {
      const response = await authApi.searchSku(session.accessToken, selectedSku.sku);
      setSelectedSku(response.data);
    } catch {
      // silently fail on refresh
    } finally {
      setRefreshingSku(false);
    }
  };

  if (selectedSku) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedSku(null)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-black tracking-tight text-slate-900">{selectedSku.sku}</h2>
            <div className="text-sm text-slate-500">Detailed Metrics View</div>
          </div>
          <button
            onClick={refreshSelectedSku}
            disabled={refreshingSku}
            title="Refresh this SKU's data"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${refreshingSku ? 'animate-spin' : ''}`} />
            Refresh SKU
          </button>
        </div>
        <Panel title="SKU Details">
          <SkuDataTable data={selectedSku} />
        </Panel>
        <RestockCalculator data={selectedSku} />
        <ProfitCalculator data={selectedSku} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Ribbon */}
      <div className="shrink-0">
        <Panel title="Catalog Browser">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Search</span>
              <div className="relative">
                <PackageSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input 
                  className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-600" 
                  placeholder="Type to search SKU or Title..." 
                  value={filters.q} 
                  onChange={(e) => setFilters({ ...filters, q: e.target.value })} 
                />
              </div>
            </label>
            
            <label className="w-full md:w-48">
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Stock Status</span>
              <select 
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                value={filters.stockStatus}
                onChange={(e) => setFilters({ ...filters, stockStatus: e.target.value as any })}
              >
                <option value="ALL">All Status</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW_STOCK">Low Stock (≤50)</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
            </label>

            <label className="w-full md:w-48">
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Channel</span>
              <select 
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                value={filters.channel}
                onChange={(e) => setFilters({ ...filters, channel: e.target.value as any })}
              >
                <option value="ALL">All Channels</option>
                <option value="AMAZON">Amazon</option>
                <option value="EBAY">eBay</option>
                <option value="WEBSITE">DistinctAndUnique</option>
              </select>
            </label>
          </div>
        </Panel>
      </div>

      {error ? <InlineError text={error} /> : null}

      {/* Master List View */}
      <div>
        <Panel title={`Results (${total} SKUs found)`} className="flex flex-col flex-1 min-h-0">
          <div>
          {loading && items.length === 0 ? (
            <div className="flex h-40 items-center justify-center shrink-0">
              <Loader2 className="size-8 animate-spin text-emerald-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="shrink-0">
              <Empty text="No SKUs matched your filters." />
            </div>
          ) : (
            <div
              ref={parentRef}
              className="mt-2"
              style={{ minHeight: '300px' }}
            >
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const isLoaderRow = virtualRow.index > items.length - 1;
                  
                  if (isLoaderRow) {
                    return (
                      <div
                        key="loader-row"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          paddingTop: '12px'
                        }}
                        className="flex justify-center"
                      >
                        <button 
                          onClick={loadMore}
                          disabled={loadingMore}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 hover:bg-slate-50 transition"
                        >
                          {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
                          {loadingMore ? 'Loading...' : 'Load More SKUs'}
                        </button>
                      </div>
                    );
                  }

                  const item = items[virtualRow.index];
                  const product: any = item.product || {};
                  const totalStock = item.stock.reduce((sum, s: any) => sum + (s.available || 0), 0);
                  const isLowStock = totalStock > 0 && totalStock <= 50;
                  const isOutOfStock = totalStock === 0;

                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingBottom: '12px'
                      }}
                    >
                      <button
                        onClick={() => setSelectedSku(item)}
                        className="flex w-full h-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-400 hover:shadow-sm"
                      >
                        {/* Thumb */}
                        <div className="size-16 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <div className="flex size-full items-center justify-center text-[10px] text-slate-400">No Img</div>
                          )}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-emerald-700">{item.sku}</span>
                            {isOutOfStock && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Out of Stock</span>}
                            {isLowStock && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">Low Stock</span>}
                          </div>
                          <div className="truncate text-sm font-medium text-slate-900">{product.title}</div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                            <span>Stock: <strong className="text-slate-700">{totalStock}</strong></span>
                            <span>Channels: <strong className="text-slate-700">{item.channels.length}</strong></span>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
