import { useState } from 'react';
import { Pencil, Check, X, Loader2, ExternalLink } from 'lucide-react';
import { authApi, AuthSession, SkuMetrics } from '../../lib/authApi';

type UnknownRecord = Record<string, unknown>;
type FulfillmentTab = 'FBA' | 'MFN';

function formatCurrency(value: string | number | null | undefined): string {
  if (value == null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function formatNumber(value: string | number | null | undefined): string {
  if (value == null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return num.toLocaleString();
}

function formatWeight(value: string | number | null | undefined): string {
  if (value == null) return '-';
  const ounces = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(ounces)) return '-';

  const pounds = ounces / 16;
  const kilograms = ounces * 0.0283495;
  return `${ounces.toLocaleString(undefined, { maximumFractionDigits: 3 })} oz / ${pounds.toLocaleString(undefined, { maximumFractionDigits: 3 })} lb / ${kilograms.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`;
}

function formatDetailValue(value: unknown): string {
  if (value == null || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toLocaleString();
    }
    return value;
  }
  return JSON.stringify(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function collectColumns(rows: UnknownRecord[], preferredColumns: string[]): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];

  for (const key of preferredColumns) {
    if (rows.some((row) => key in row)) {
      seen.add(key);
      columns.push(key);
    }
  }

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  return columns;
}

function asNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : 0;
}

function getMarketplaceUrl(
  channel: string,
  country: string | undefined,
  asin: string | null,
  listingId: string | null,
  productUrl?: string | null,
): string | null {
  if (channel === 'AMAZON' && asin && asin !== '-') {
    const domain = country === 'CA' ? 'amazon.ca' : 'amazon.com';
    return `https://www.${domain}/dp/${asin}`;
  }
  if (channel === 'EBAY') {
    const ebayId = (listingId && listingId !== '-') ? listingId : (asin && asin !== '-' ? asin : null);
    if (ebayId) return `https://www.ebay.com/itm/${ebayId}`;
  }
  if (channel === 'WEBSITE') {
    const candidate = productUrl || listingId || asin;
    if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
  }
  return null;
}

function ClickableValue({
  value,
  url,
}: {
  value: string | number | null | undefined;
  url: string | null;
}) {
  const display = value == null || value === '' ? '-' : String(value);
  if (!url || display === '-') return <span>{display}</span>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1 font-mono font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
    >
      {display}
      <ExternalLink className="size-3" />
    </a>
  );
}

function DetailTable({
  title,
  rows,
  preferredColumns,
}: {
  title: string;
  rows: UnknownRecord[];
  preferredColumns: string[];
}) {
  const columns = collectColumns(rows, preferredColumns);

  return (
    <section className="border-t border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</h4>
        <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">
          {rows.length} {rows.length === 1 ? 'row' : 'rows'}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm font-semibold text-slate-400">
          No data available
        </div>
      ) : (
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-max border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-600">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="border-b border-r border-slate-200 px-3 py-2 font-black uppercase">
                    {humanizeKey(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.id ?? index)} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  {columns.map((column) => (
                    <td key={column} className="max-w-72 whitespace-pre-wrap break-words border-b border-r border-slate-100 px-3 py-2 text-slate-700">
                      {formatDetailValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function periodDays(row: any): number {
  const start = new Date(row.periodStart).getTime();
  const end = new Date(row.periodEnd).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function getSalesForPeriod(
  metrics: SkuMetrics,
  channelName: string,
  country: string | undefined,
  targetDays: number,
  fulfillmentType?: 'FBA' | 'MFN' | 'ALL',
): string {
  const value = sumSales(metrics, {
    channel: channelName,
    country,
    fulfillmentType: fulfillmentType === 'ALL' ? undefined : fulfillmentType,
    days: targetDays,
  });
  return value > 0 ? value.toLocaleString() : '-';
}

function sumSales(
  metrics: SkuMetrics,
  options: {
    channel?: string;
    country?: string;
    fulfillmentType?: 'FBA' | 'MFN';
    days: number;
  },
): number {
  return (metrics.salesMetrics as any[])
    .filter((metric) => {
      if (options.channel && metric.channel !== options.channel) return false;
      if (options.country && metric.country !== options.country) return false;
      if (options.fulfillmentType && (metric.fulfillmentType ?? 'ALL') !== options.fulfillmentType) return false;
      return periodDays(metric) === options.days;
    })
    .reduce((sum, metric) => sum + asNumber(metric.unitsSold), 0);
}

function findChannel(metrics: SkuMetrics, channel: string, country?: string) {
  return (metrics.channels as any[]).find((row) =>
    row.channel === channel && (country ? row.country === country : true),
  ) as any | undefined;
}

function getChannelData(metrics: SkuMetrics, channelName: string, country?: string) {
  const channel = findChannel(metrics, channelName, country);
  const stockFBA = stockQuantity(metrics, { country, fba: true, includeInbound: false });
  const stockMFN = stockQuantity(metrics, { country, fba: false, includeInbound: false });

  return {
    asin: channel?.asin ?? channel?.listingId ?? '-',
    listingId: channel?.listingId ?? null,
    url: getMarketplaceUrl(
      channelName,
      country,
      channel?.asin ?? null,
      channel?.listingId ?? null,
      (metrics.product as any)?.productUrl ?? null,
    ),
    fbaQty: stockFBA > 0 ? stockFBA.toLocaleString() : '-',
    mfnQty: stockMFN > 0 ? stockMFN.toLocaleString() : '-',
    fbaPrice: formatCurrency(channel?.fbaPrice ?? channel?.price),
    mfnPrice: formatCurrency(channel?.mfnPrice ?? channel?.price),
    salesFBA7: getSalesForPeriod(metrics, channelName, country, 7, 'FBA'),
    salesFBA30: getSalesForPeriod(metrics, channelName, country, 30, 'FBA'),
    salesFBA90: getSalesForPeriod(metrics, channelName, country, 90, 'FBA'),
    salesFBA365: getSalesForPeriod(metrics, channelName, country, 365, 'FBA'),
    salesMFN7: getSalesForPeriod(metrics, channelName, country, 7, 'MFN'),
    salesMFN30: getSalesForPeriod(metrics, channelName, country, 30, 'MFN'),
    salesMFN90: getSalesForPeriod(metrics, channelName, country, 90, 'MFN'),
    salesMFN365: getSalesForPeriod(metrics, channelName, country, 365, 'MFN'),
  };
}

function stockQuantity(metrics: SkuMetrics, options: { country?: string; fba?: boolean; includeInbound?: boolean }): number {
  return (metrics.stock as any[])
    .filter((row) => {
      const type = row.locationType === 'FBM' ? 'MFN' : row.locationType;
      if (options.country && row.country !== options.country) return false;
      return options.fba ? type === 'FBA' : type !== 'FBA';
    })
    .reduce((sum, row) => sum + asNumber(row.available) + (options.includeInbound ? asNumber(row.inbound) : 0), 0);
}

const ATTRIBUTE_ROWS = [
  { label: 'CATEGORY' },
  { label: 'COST' },
  { label: 'WEIGHT (oz / lb / kg)' },
  { label: 'LENGTH (in)' },
  { label: 'WIDTH (in)' },
  { label: 'HEIGHT (in)' },
  { label: 'MATERIAL' },
  { label: 'THICKNESS' },
  { label: 'PACK QTY' },
] as const;

function getSalesRowsForTab(tab: FulfillmentTab): { label: string; key: string }[] {
  if (tab === 'FBA') {
    return [
      { label: '7-Day FBA Sales (units)', key: 'salesFBA7' },
      { label: '30-Day FBA Sales (units)', key: 'salesFBA30' },
      { label: '90-Day FBA Sales (units)', key: 'salesFBA90' },
      { label: '365-Day FBA Sales (units)', key: 'salesFBA365' },
    ];
  }
  return [
    { label: '7-Day MFN Sales (units)', key: 'salesMFN7' },
    { label: '30-Day MFN Sales (units)', key: 'salesMFN30' },
    { label: '90-Day MFN Sales (units)', key: 'salesMFN90' },
    { label: '365-Day MFN Sales (units)', key: 'salesMFN365' },
  ];
}

export function SkuDataTable({ data, session, onUpdate }: { data: SkuMetrics; session?: AuthSession; onUpdate?: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [fulfillmentTab, setFulfillmentTab] = useState<FulfillmentTab>('FBA');
  const product: any = data.product ?? {};

  const [editValues, setEditValues] = useState({
    cost: product.cost ?? '',
    weight: product.weight ?? '',
    length: product.dimensions?.length ?? product.length ?? '',
    width: product.dimensions?.width ?? product.width ?? '',
    height: product.dimensions?.height ?? product.height ?? '',
    material: product.material ?? '',
    thickness: product.thickness ?? '',
    packQty: product.packQty ?? '',
  });

  const handleSave = async () => {
    if (!session || !onUpdate) return;
    setIsSaving(true);
    setError('');
    try {
      await authApi.updateProduct(session.accessToken, data.sku, {
        cost: editValues.cost === '' ? null : Number(editValues.cost),
        weight: editValues.weight === '' ? null : Number(editValues.weight),
        length: editValues.length === '' ? null : Number(editValues.length),
        width: editValues.width === '' ? null : Number(editValues.width),
        height: editValues.height === '' ? null : Number(editValues.height),
        material: editValues.material === '' ? null : editValues.material,
        thickness: editValues.thickness === '' ? null : editValues.thickness,
        packQty: editValues.packQty === '' ? null : Number(editValues.packQty),
      });
      setIsEditing(false);
      onUpdate();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update product details. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError('');
    setEditValues({
      cost: product.cost ?? '',
      weight: product.weight ?? '',
      length: product.dimensions?.length ?? product.length ?? '',
      width: product.dimensions?.width ?? product.width ?? '',
      height: product.dimensions?.height ?? product.height ?? '',
      material: product.material ?? '',
      thickness: product.thickness ?? '',
      packQty: product.packQty ?? '',
    });
  };

  const amazonUs = findChannel(data, 'AMAZON', 'US');
  const amazonCa = findChannel(data, 'AMAZON', 'CA');
  const ebay = findChannel(data, 'EBAY');
  const website = findChannel(data, 'WEBSITE');
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

  const salesRows = getSalesRowsForTab(fulfillmentTab);

  const stockSummaryRows = [
    { label: 'DEFAULT', value: formatNumber(stockQuantity(data, { fba: false })) },
    { label: 'USFBA (includes inbound)', value: formatNumber(stockQuantity(data, { country: 'US', fba: true, includeInbound: true })) },
    { label: 'CAFBA (includes inbound)', value: formatNumber(stockQuantity(data, { country: 'CA', fba: true, includeInbound: true })) },
  ];

  const sellingPriceRows = [
    { label: 'AZ CA', value: formatCurrency(amazonCa?.mfnPrice ?? amazonCa?.price ?? amazonCa?.fbaPrice) },
    { label: 'CAFBA', value: formatCurrency(amazonCa?.fbaPrice ?? amazonCa?.price) },
    { label: 'AZ US', value: formatCurrency(amazonUs?.mfnPrice ?? amazonUs?.price ?? amazonUs?.fbaPrice) },
    { label: 'USFBA', value: formatCurrency(amazonUs?.fbaPrice ?? amazonUs?.price) },
    { label: 'EBAY', value: formatCurrency(ebay?.price ?? ebay?.mfnPrice ?? ebay?.fbaPrice) },
    { label: 'D&U', value: formatCurrency(website?.price ?? website?.mfnPrice ?? website?.fbaPrice) },
  ];

  const asinRows = [
    { label: 'AZ US', asin: amazonUs?.asin ?? '-', url: getMarketplaceUrl('AMAZON', 'US', amazonUs?.asin ?? null, amazonUs?.listingId ?? null) },
    { label: 'AZ CA', asin: amazonCa?.asin ?? '-', url: getMarketplaceUrl('AMAZON', 'CA', amazonCa?.asin ?? null, amazonCa?.listingId ?? null) },
  ];

  const saleWindows = [7, 30, 90, 365];
  const salesSections = [
    {
      title: 'SALES ALL SITES combined',
      rows: saleWindows.map((days) => ({
        label: `${days} Days Sales`,
        value: formatNumber(sumSales(data, { days })),
      })),
    },
    {
      title: 'SALES Amazon.ca',
      rows: saleWindows.flatMap((days) => [
        {
          label: `${days} Days MFN Sales`,
          value: formatNumber(sumSales(data, { channel: 'AMAZON', country: 'CA', fulfillmentType: 'MFN', days })),
        },
        {
          label: `${days} Days FBA Sales`,
          value: formatNumber(sumSales(data, { channel: 'AMAZON', country: 'CA', fulfillmentType: 'FBA', days })),
        },
      ]),
    },
    {
      title: 'SALES Amazon.com',
      rows: saleWindows.flatMap((days) => [
        {
          label: `${days} Days MFN Sales`,
          value: formatNumber(sumSales(data, { channel: 'AMAZON', country: 'US', fulfillmentType: 'MFN', days })),
        },
        {
          label: `${days} Days FBA Sales`,
          value: formatNumber(sumSales(data, { channel: 'AMAZON', country: 'US', fulfillmentType: 'FBA', days })),
        },
      ]),
    },
    {
      title: 'SALES Ebay',
      rows: saleWindows.map((days) => ({
        label: `${days} Days Sales`,
        value: formatNumber(sumSales(data, { channel: 'EBAY', days })),
      })),
    },
    {
      title: 'SALES DistinctAndUnique',
      rows: saleWindows.map((days) => ({
        label: `${days} Days Sales`,
        value: formatNumber(sumSales(data, { channel: 'WEBSITE', days })),
      })),
    },
  ];

  const attrValues: Record<string, string> = {
    'CATEGORY': product.category ?? 'N/A',
    'COST': formatCurrency(product.cost),
    'WEIGHT (oz / lb / kg)': formatWeight(product.weight),
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
  const requiredSections = [
    { title: 'STOCK QUANTITY', rows: stockSummaryRows },
    { title: 'SELLING PRICE', rows: sellingPriceRows },
    {
      title: 'ASIN',
      rows: asinRows.map((row) => ({
        label: row.label,
        value: <ClickableValue value={row.asin} url={row.url} />,
      })),
    },
    ...salesSections,
  ];
  const productRows = data.product ? [data.product as UnknownRecord] : [];
  const stockRows = data.stock as UnknownRecord[];
  const channelRows = data.channels as UnknownRecord[];
  const allSalesRows = data.salesMetrics as UnknownRecord[];

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-sm text-sm">
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-xs font-semibold text-red-800 flex items-center justify-between">
          <span>Error: {error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold text-base line-height-1">×</button>
        </div>
      )}

      <div className="border-b border-slate-200 px-4 pt-3">
        <div className="flex gap-1">
          <button
            onClick={() => setFulfillmentTab('FBA')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-t-lg transition ${
              fulfillmentTab === 'FBA'
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            FBA (Fulfilled by Amazon)
          </button>
          <button
            onClick={() => setFulfillmentTab('MFN')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-t-lg transition ${
              fulfillmentTab === 'MFN'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            MFN (Merchant Fulfilled)
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="bg-slate-50">
              <th className={`${th} bg-slate-100 text-slate-600 w-52`}>SKU</th>
              <td className={`${td} text-left font-mono text-emerald-700 font-bold`}>{data.sku}</td>
              <td className={`${td} text-left font-medium text-slate-900`} colSpan={channels.length - 1}>
                {product.title ?? 'N/A'}
              </td>
            </tr>
            <tr>
              <th className={`${th} bg-slate-100 text-slate-600`}>
                <div className="flex justify-between items-center">
                  <span>Product Info</span>
                  {session && onUpdate && (
                    !isEditing ? (
                      <button onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-300 transition">
                        <Pencil className="size-3" /> Edit
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 transition">
                          {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Save
                        </button>
                        <button onClick={handleCancel} disabled={isSaving} className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-200 transition">
                          <X className="size-3" /> Cancel
                        </button>
                      </div>
                    )
                  )}
                </div>
              </th>
              {channels.map((channel) => (
                <th key={channel.name} className={`${th} bg-emerald-700 text-white text-center`}>
                  {channel.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
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
              {channels.map((channel) => (
                <td key={channel.name} className={td}>
                  <span className="block text-[10px] uppercase tracking-wider text-slate-400">Listing ID / ASIN</span>
                  <ClickableValue value={channel.data.asin} url={channel.data.url} />
                </td>
              ))}
            </tr>
            <tr className="bg-slate-50">
              {channels.map((channel) => (
                <td key={channel.name} className={td}>
                  <span className="block text-[10px] uppercase tracking-wider text-slate-400">FBA Stock</span>
                  <span className="font-semibold text-slate-800">{channel.data.fbaQty}</span>
                </td>
              ))}
            </tr>
            <tr>
              {channels.map((channel) => (
                <td key={channel.name} className={td}>
                  <span className="block text-[10px] uppercase tracking-wider text-slate-400">MFN Stock</span>
                  <span className="font-semibold text-slate-800">{channel.data.mfnQty}</span>
                </td>
              ))}
            </tr>
            <tr className="bg-slate-50">
              {channels.map((channel) => (
                <td key={channel.name} className={td}>
                  <span className="block text-[10px] uppercase tracking-wider text-slate-400">FBA Price</span>
                  <span className="font-bold text-emerald-700">{channel.data.fbaPrice}</span>
                </td>
              ))}
            </tr>
            <tr>
              {channels.map((channel) => (
                <td key={channel.name} className={td}>
                  <span className="block text-[10px] uppercase tracking-wider text-slate-400">MFN Price</span>
                  <span className="font-bold text-slate-700">{channel.data.mfnPrice}</span>
                </td>
              ))}
            </tr>

            {ATTRIBUTE_ROWS.map((row, i) => {
              const salesRow = salesRows[i];
              let editContent = <span className="font-semibold text-slate-900">{attrValues[row.label] ?? 'N/A'}</span>;

              if (isEditing) {
                if (row.label === 'COST') {
                  editContent = <input type="number" step="0.01" className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right font-semibold outline-none focus:border-emerald-500" value={editValues.cost} onChange={e => setEditValues({ ...editValues, cost: e.target.value })} />;
                } else if (row.label === 'WEIGHT (oz / lb / kg)') {
                  editContent = <input type="number" step="0.01" className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right font-semibold outline-none focus:border-emerald-500" value={editValues.weight} onChange={e => setEditValues({ ...editValues, weight: e.target.value })} />;
                } else if (row.label === 'LENGTH (in)') {
                  editContent = <input type="number" step="0.01" className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right font-semibold outline-none focus:border-emerald-500" value={editValues.length} onChange={e => setEditValues({ ...editValues, length: e.target.value })} />;
                } else if (row.label === 'WIDTH (in)') {
                  editContent = <input type="number" step="0.01" className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right font-semibold outline-none focus:border-emerald-500" value={editValues.width} onChange={e => setEditValues({ ...editValues, width: e.target.value })} />;
                } else if (row.label === 'HEIGHT (in)') {
                  editContent = <input type="number" step="0.01" className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right font-semibold outline-none focus:border-emerald-500" value={editValues.height} onChange={e => setEditValues({ ...editValues, height: e.target.value })} />;
                } else if (row.label === 'MATERIAL') {
                  editContent = <input type="text" className="w-24 rounded border border-slate-300 px-1 py-0.5 text-right font-semibold outline-none focus:border-emerald-500" value={editValues.material} onChange={e => setEditValues({ ...editValues, material: e.target.value })} />;
                } else if (row.label === 'THICKNESS') {
                  editContent = <input type="text" className="w-24 rounded border border-slate-300 px-1 py-0.5 text-right font-semibold outline-none focus:border-emerald-500" value={editValues.thickness} onChange={e => setEditValues({ ...editValues, thickness: e.target.value })} />;
                } else if (row.label === 'PACK QTY') {
                  editContent = <input type="number" step="1" className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right font-semibold outline-none focus:border-emerald-500" value={editValues.packQty} onChange={e => setEditValues({ ...editValues, packQty: e.target.value })} />;
                }
              }

              return (
                <tr key={row.label} className={i % 2 === 0 ? 'bg-slate-50 hover:bg-slate-100 transition-colors' : 'hover:bg-slate-50 transition-colors'}>
                  <td className={tdLeft}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{row.label}</span>
                      {editContent}
                    </div>
                  </td>
                  {channels.map((channel) => (
                    <td key={channel.name} className={td}>
                      {salesRow ? (
                        <>
                          <span className="block text-[10px] uppercase tracking-wider text-slate-400">{salesRow.label}</span>
                          <span className="font-semibold text-slate-800">{(channel.data as any)[salesRow.key]}</span>
                        </>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="border-t border-slate-200 p-4">
        <h4 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">SKU Required Fields</h4>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {requiredSections.map((section) => (
            <div key={section.title} className="overflow-hidden rounded-lg border border-slate-200">
              <div className="bg-slate-100 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-600">
                {section.title}
              </div>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {section.rows.map((row, index) => (
                    <tr key={`${section.title}-${row.label}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border-t border-r border-slate-100 px-3 py-2 font-bold text-slate-500">{row.label}</td>
                      <td className="border-t border-slate-100 px-3 py-2 text-right font-black text-slate-900">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <DetailTable
        title="All Product Data"
        rows={productRows}
        preferredColumns={['id', 'sku', 'title', 'brand', 'category', 'status', 'cost', 'currency', 'weight', 'length', 'width', 'height', 'material', 'thickness', 'packQty', 'imageUrl', 'productUrl', 'lastSyncedAt', 'createdAt', 'updatedAt']}
      />
      <DetailTable
        title="All Stock Data"
        rows={stockRows}
        preferredColumns={['id', 'productId', 'country', 'locationType', 'warehouse', 'quantity', 'reserved', 'inbound', 'available', 'updatedAt']}
      />
      <DetailTable
        title="All Pricing and Channel Data"
        rows={channelRows}
        preferredColumns={['id', 'productId', 'channel', 'country', 'asin', 'listingId', 'price', 'fbaPrice', 'mfnPrice', 'currency', 'isActive', 'updatedAt']}
      />
      <DetailTable
        title="All Sales Data"
        rows={allSalesRows}
        preferredColumns={['id', 'productId', 'productChannelId', 'channel', 'country', 'fulfillmentType', 'periodStart', 'periodEnd', 'unitsSold', 'revenue', 'velocity', 'currency', 'createdAt', 'updatedAt']}
      />
    </div>
  );
}
