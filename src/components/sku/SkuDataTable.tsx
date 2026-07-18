import { Fragment, useState } from 'react';
import { Pencil, Check, X, Loader2, ExternalLink } from 'lucide-react';
import { authApi, AuthSession, SkuMetrics } from '../../lib/authApi';

type UnknownRecord = Record<string, unknown>;

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

function getMarketplaceUrl(channel: string, country: string | undefined, asin: string | null, listingId: string | null): string | null {
  if (channel === 'AMAZON' && asin && asin !== '-') {
    const domain = country === 'CA' ? 'amazon.ca' : 'amazon.com';
    return `https://www.${domain}/dp/${asin}`;
  }
  if (channel === 'EBAY') {
    const ebayId = (listingId && listingId !== '-') ? listingId : (asin && asin !== '-' ? asin : null);
    if (ebayId) return `https://www.ebay.com/itm/${ebayId}`;
  }
  return null;
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

export function SkuDataTable({ data, session, onUpdate }: { data: SkuMetrics; session?: AuthSession; onUpdate?: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="bg-slate-50">
              <th className={`${th} bg-slate-100 text-slate-600 w-60`}>SKU</th>
              <td className={`${td} text-left font-mono text-emerald-700 font-bold`}>{data.sku}</td>
              <td className={`${td} text-left font-medium text-slate-900`}>
                {product.title ?? 'N/A'}
              </td>
            </tr>
            <tr>
              <th className={`${th} bg-slate-100 text-slate-600`} colSpan={3}>
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
            </tr>
          </thead>

          <tbody>
            <tr>
              <td className={`${tdLeft} align-top`} rowSpan={ATTRIBUTE_ROWS.length + 1}>
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
              <td className={`${tdLeft} font-bold text-slate-900`}>TITLE</td>
              <td className={`${tdLeft} text-slate-700`}>{product.title ?? 'N/A'}</td>
            </tr>

            {ATTRIBUTE_ROWS.map((row, i) => {
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
                  <td className={`${tdLeft} text-[11px] font-bold uppercase tracking-wide text-slate-500`}>
                    {row.label}
                  </td>
                  <td className={tdLeft}>
                    {editContent}
                  </td>
                </tr>
              );
            })}

            <tr>
              <th className={`${th} bg-emerald-700 text-white`} colSpan={3}>STOCK QUANTITY</th>
            </tr>
            {stockSummaryRows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? 'bg-slate-50' : undefined}>
                <td className={`${tdLeft} font-bold text-slate-600`} colSpan={2}>{row.label}</td>
                <td className={`${td} font-black text-slate-900`}>{row.value}</td>
              </tr>
            ))}

            <tr>
              <th className={`${th} bg-emerald-700 text-white`} colSpan={3}>SELLING PRICE</th>
            </tr>
            {sellingPriceRows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? 'bg-slate-50' : undefined}>
                <td className={`${tdLeft} font-bold text-slate-600`} colSpan={2}>{row.label}</td>
                <td className={`${td} font-black text-emerald-700`}>{row.value}</td>
              </tr>
            ))}

            <tr>
              <th className={`${th} bg-emerald-700 text-white`} colSpan={3}>ASIN</th>
            </tr>
            {asinRows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? 'bg-slate-50' : undefined}>
                <td className={`${tdLeft} font-bold text-slate-600`} colSpan={2}>{row.label}</td>
                <td className={`${td} font-mono font-bold text-slate-900`}>
                  {row.url ? (
                    <a href={row.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1 text-emerald-700 hover:text-emerald-900 hover:underline">
                      {row.asin}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : row.asin}
                </td>
              </tr>
            ))}

            {salesSections.map((section) => (
              <Fragment key={section.title}>
                <tr>
                  <th className={`${th} bg-slate-800 text-white`} colSpan={3}>{section.title}</th>
                </tr>
                {section.rows.map((row, i) => (
                  <tr key={`${section.title}-${row.label}`} className={i % 2 === 0 ? 'bg-slate-50' : undefined}>
                    <td className={`${tdLeft} font-bold text-slate-600`} colSpan={2}>{row.label}</td>
                    <td className={`${td} font-black text-slate-900`}>{row.value}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

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
