import { SkuMetrics } from '../../lib/authApi';

function formatCurrency(value: string | number | null | undefined, currency = 'USD'): string {
  if (value == null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num);
}

function formatNumber(value: string | number | null | undefined): string {
  if (value == null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return num.toLocaleString();
}

/**
 * Pick the best matching salesMetrics entry for a given channel/country/period combo.
 * The mock data stores one entry per period bucket, so we match on period length in days.
 */
function getSalesForPeriod(
  metrics: SkuMetrics,
  channelName: string,
  country: string | undefined,
  targetDays: number,
): string {
  // Build a sorted list of relevant entries
  const relevant = metrics.salesMetrics.filter((m: any) => {
    if (m.channel !== channelName) return false;
    if (country && m.country !== country) return false;
    return true;
  }) as any[];

  if (!relevant.length) return '-';

  // Find the entry whose period length is closest to targetDays
  const withLen = relevant.map((m: any) => {
    const start = new Date(m.periodStart).getTime();
    const end = new Date(m.periodEnd).getTime();
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
    return { ...m, days };
  });

  const exact = withLen.find((m) => m.days === targetDays);
  if (exact) return exact.unitsSold > 0 ? exact.unitsSold.toLocaleString() : '-';

  // Fall back to the closest match
  const closest = withLen.reduce((prev, curr) =>
    Math.abs(curr.days - targetDays) < Math.abs(prev.days - targetDays) ? curr : prev,
  );
  return closest.unitsSold > 0 ? closest.unitsSold.toLocaleString() : '-';
}

function getChannelData(metrics: SkuMetrics, channelName: string, country?: string) {
  const channel = metrics.channels.find(
    (c: any) => c.channel === channelName && (!country || c.country === country),
  ) as any;

  const stockFBA = metrics.stock.find(
    (s: any) => s.locationType === 'FBA' && (!country || s.country === country),
  ) as any;

  const stockMFN = metrics.stock.find(
    (s: any) => s.locationType === 'FBM' && (!country || s.country === country),
  ) as any;

  return {
    asin: channel?.asin ?? '-',
    fbaQty: stockFBA?.available != null ? stockFBA.available.toLocaleString() : '-',
    mfnQty: stockMFN?.available != null ? stockMFN.available.toLocaleString() : '-',
    fbaPrice: formatCurrency(channel?.price, channel?.currency),
    mfnPrice: formatCurrency(channel?.price, channel?.currency),
    salesFBA7: getSalesForPeriod(metrics, channelName, country, 7),
    salesFBA30: getSalesForPeriod(metrics, channelName, country, 30),
    salesFBA90: getSalesForPeriod(metrics, channelName, country, 90),
    salesFBA365: getSalesForPeriod(metrics, channelName, country, 365),
  };
}

const ATTRIBUTE_ROWS = [
  { label: 'COST' },
  { label: 'WEIGHT (oz / lbs)' },
  { label: 'LENGTH (in)' },
  { label: 'WIDTH (in)' },
  { label: 'HEIGHT (in)' },
  { label: 'MATERIAL' },
  { label: 'THICKNESS' },
  { label: 'PACK QTY' },
] as const;

const SALES_ROWS: { label: string; key: keyof ReturnType<typeof getChannelData> }[] = [
  { label: '7-Day Sales (units)', key: 'salesFBA7' },
  { label: '30-Day Sales (units)', key: 'salesFBA30' },
  { label: '90-Day Sales (units)', key: 'salesFBA90' },
  { label: '365-Day Sales (units)', key: 'salesFBA365' },
];

export function SkuDataTable({ data }: { data: SkuMetrics }) {
  const product: any = data.product ?? {};

  const channelDefs = [
    { name: 'Amazon US', ch: 'AMAZON', country: 'US' },
    { name: 'Amazon CA', ch: 'AMAZON', country: 'CA' },
    { name: 'eBay', ch: 'EBAY', country: undefined },
    { name: 'DistinctAndUnique', ch: 'WEBSITE', country: undefined },
  ];

  const channels = channelDefs.map((def) => ({
    ...def,
    data: getChannelData(data, def.ch, def.country),
  }));

  const attrValues: Record<string, string> = {
    'COST': formatCurrency(product.cost, product.currency),
    'WEIGHT (oz / lbs)': formatNumber(product.weight),
    'LENGTH (in)': formatNumber(product.dimensions?.length ?? product.length),
    'WIDTH (in)': formatNumber(product.dimensions?.width ?? product.width),
    'HEIGHT (in)': formatNumber(product.dimensions?.height ?? product.height),
    'MATERIAL': product.material ?? 'N/A',
    'THICKNESS': product.thickness ?? 'N/A',
    'PACK QTY': product.packQty ?? 'N/A',
  };

  const th = 'border-b border-r border-slate-200 p-3 text-xs font-bold uppercase tracking-wide';
  const td = 'border-b border-r border-slate-200 p-2 text-center text-sm';
  const tdLeft = 'border-b border-r border-slate-200 p-3 text-sm';

  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm text-sm">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          {/* Row 1 — SKU + Title */}
          <tr className="bg-slate-50">
            <th className={`${th} bg-slate-100 text-slate-600 w-52`}>SKU</th>
            <td className={`${td} text-left font-mono text-emerald-700 font-bold`}>{data.sku}</td>
            <td className={`${td} text-left font-medium text-slate-900`} colSpan={channels.length - 1}>
              {product.title ?? 'N/A'}
            </td>
          </tr>
          {/* Row 2 — Channel Headers */}
          <tr>
            <th className={`${th} bg-slate-100 text-slate-600`}>Product Info</th>
            {channels.map((c) => (
              <th key={c.name} className={`${th} bg-emerald-700 text-white text-center`}>{c.name}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Image + ASIN + Stock + Price rows */}
          <tr>
            <td className={`${tdLeft} align-top`} rowSpan={5}>
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.title}
                  className="h-36 w-36 rounded-xl border border-slate-100 object-contain p-1"
                />
              ) : (
                <div className="flex h-36 w-36 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
                  No Image
                </div>
              )}
            </td>
            {channels.map((c) => (
              <td key={c.name} className={td}>
                <span className="text-[10px] uppercase text-slate-400 tracking-wider block">Listing ID / ASIN</span>
                <span className="font-mono font-semibold text-slate-800">{c.data.asin}</span>
              </td>
            ))}
          </tr>
          <tr className="bg-slate-50">
            {channels.map((c) => (
              <td key={c.name} className={td}>
                <span className="text-[10px] uppercase text-slate-400 tracking-wider block">FBA Stock</span>
                <span className="font-semibold text-slate-800">{c.data.fbaQty}</span>
              </td>
            ))}
          </tr>
          <tr>
            {channels.map((c) => (
              <td key={c.name} className={td}>
                <span className="text-[10px] uppercase text-slate-400 tracking-wider block">MFN Stock</span>
                <span className="font-semibold text-slate-800">{c.data.mfnQty}</span>
              </td>
            ))}
          </tr>
          <tr className="bg-slate-50">
            {channels.map((c) => (
              <td key={c.name} className={td}>
                <span className="text-[10px] uppercase text-slate-400 tracking-wider block">FBA Price</span>
                <span className="font-bold text-emerald-700">{c.data.fbaPrice}</span>
              </td>
            ))}
          </tr>
          <tr>
            {channels.map((c) => (
              <td key={c.name} className={td}>
                <span className="text-[10px] uppercase text-slate-400 tracking-wider block">MFN Price</span>
                <span className="font-bold text-slate-700">{c.data.mfnPrice}</span>
              </td>
            ))}
          </tr>

          {/* Attributes + Sales Velocity Matrix */}
          {ATTRIBUTE_ROWS.map((row, i) => {
            const salesRow = SALES_ROWS[i];
            return (
              <tr key={row.label} className={i % 2 === 0 ? 'bg-slate-50 hover:bg-slate-100 transition-colors' : 'hover:bg-slate-50 transition-colors'}>
                <td className={tdLeft}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{row.label}</span>
                    <span className="font-semibold text-slate-900">{attrValues[row.label] ?? 'N/A'}</span>
                  </div>
                </td>
                {channels.map((c) => (
                  <td key={c.name} className={td}>
                    {salesRow ? (
                      <>
                        <span className="text-[10px] uppercase text-slate-400 tracking-wider block">{salesRow.label}</span>
                        <span className="font-semibold text-slate-800">{c.data[salesRow.key]}</span>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
