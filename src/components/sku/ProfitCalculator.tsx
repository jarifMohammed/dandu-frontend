import { useState } from 'react';
import { DollarSign, Info, TrendingUp } from 'lucide-react';
import { SkuMetrics } from '../../lib/authApi';

// Amazon FBA fee lookup by weight (simplified tiers — lbs)
function estimateFBAFee(weightLbs: number): number {
  if (weightLbs <= 0.25) return 3.22;
  if (weightLbs <= 0.5)  return 3.40;
  if (weightLbs <= 0.75) return 3.58;
  if (weightLbs <= 1)    return 3.77;
  if (weightLbs <= 1.5)  return 4.49;
  if (weightLbs <= 2)    return 4.75;
  if (weightLbs <= 3)    return 5.40;
  if (weightLbs <= 4)    return 5.69;
  return 5.69 + Math.ceil(weightLbs - 4) * 0.16;
}

interface ChannelMargin {
  channel: string;
  price: number;
  referralFee: number;
  fbaFee: number;
  cogs: number;
  pickFee: number;
  packFee: number;
  shippingFee: number;
  netProfit: number;
  marginPct: number;
  roiPct: number;
}

function calcMargins(
  metrics: SkuMetrics,
  referralPct: number,
  pickFee: number,
  packFee: number,
  shippingFee: number,
): ChannelMargin[] {
  const product: any = metrics.product || {};
  const cogs = parseFloat(product.cost || '0');
  // Convert weight from oz to lbs (product stores oz)
  const weightLbs = parseFloat(product.weight || '1') / 16;
  const fbaFee = estimateFBAFee(weightLbs);

  return metrics.channels
    .filter((c: any) => asPrice(c) > 0)
    .map((c: any) => {
      const price = asPrice(c);
      const referralFee = parseFloat(((price * referralPct) / 100).toFixed(2));
      const totalCosts = cogs + referralFee + fbaFee + pickFee + packFee + shippingFee;
      const netProfit = parseFloat((price - totalCosts).toFixed(2));
      const marginPct = price > 0 ? parseFloat(((netProfit / price) * 100).toFixed(1)) : 0;
      const roiPct = cogs > 0 ? parseFloat(((netProfit / cogs) * 100).toFixed(1)) : 0;

      const label =
        c.channel === 'AMAZON' && c.country === 'US'
          ? 'Amazon US'
          : c.channel === 'AMAZON' && c.country === 'CA'
          ? 'Amazon CA'
          : c.channel === 'EBAY'
          ? 'eBay'
          : 'DistinctAndUnique';

      return {
        channel: label,
        price,
        referralFee,
        fbaFee,
        cogs,
        pickFee,
        packFee,
        shippingFee,
        netProfit,
        marginPct,
        roiPct,
      };
    });
}

function asPrice(channel: any): number {
  return parseFloat(channel.price ?? channel.fbaPrice ?? channel.mfnPrice ?? '0') || 0;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function ProfitCalculator({ data }: { data: SkuMetrics }) {
  const [referralPct, setReferralPct] = useState(15);
  const [pickFee, setPickFee] = useState(0);
  const [packFee, setPackFee] = useState(0);
  const [shippingFee, setShippingFee] = useState(0);

  const margins = calcMargins(data, referralPct, pickFee, packFee, shippingFee);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-5 text-emerald-700" />
          <h3 className="text-base font-black text-slate-900">Profit Margin Calculator</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-slate-500">
            Referral
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={referralPct}
              onChange={(e) => setReferralPct(Number(e.target.value))}
              className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-600"
            />
            %
          </label>
          <label className="flex items-center gap-1.5 text-slate-500">
            Pick
            <input
              type="number"
              min={0}
              step={0.1}
              value={pickFee}
              onChange={(e) => setPickFee(Number(e.target.value))}
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-600"
            />
            $
          </label>
          <label className="flex items-center gap-1.5 text-slate-500">
            Pack
            <input
              type="number"
              min={0}
              step={0.1}
              value={packFee}
              onChange={(e) => setPackFee(Number(e.target.value))}
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-600"
            />
            $
          </label>
          <label className="flex items-center gap-1.5 text-slate-500">
            Shipping
            <input
              type="number"
              min={0}
              step={0.1}
              value={shippingFee}
              onChange={(e) => setShippingFee(Number(e.target.value))}
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-600"
            />
            $
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto p-4">
        {margins.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
            <Info className="size-4 shrink-0" />
            No channel prices available to calculate margin.
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Channel', 'Sale Price', 'COGS', 'Referral', 'FBA Fee', 'Pick', 'Pack', 'Shipping', 'Net Profit', 'Margin', 'ROI'].map((h) => (
                  <th key={h} className="py-2 pr-4 text-right first:text-left text-[11px] font-black uppercase tracking-wide text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {margins.map((m) => (
                <tr key={m.channel} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4">
                    <span className="font-semibold text-slate-900">{m.channel}</span>
                  </td>
                  <td className="py-3 pr-4 text-right font-bold text-slate-800">{fmt(m.price)}</td>
                  <td className="py-3 pr-4 text-right text-slate-600">-{fmt(m.cogs)}</td>
                  <td className="py-3 pr-4 text-right text-slate-600">-{fmt(m.referralFee)}</td>
                  <td className="py-3 pr-4 text-right text-slate-600">-{fmt(m.fbaFee)}</td>
                  <td className="py-3 pr-4 text-right text-slate-600">-{fmt(m.pickFee)}</td>
                  <td className="py-3 pr-4 text-right text-slate-600">-{fmt(m.packFee)}</td>
                  <td className="py-3 pr-4 text-right text-slate-600">-{fmt(m.shippingFee)}</td>
                  <td className="py-3 pr-4 text-right">
                    <span className={`font-black ${m.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {fmt(m.netProfit)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-black ${
                      m.marginPct >= 20 ? 'bg-emerald-100 text-emerald-700' :
                      m.marginPct >= 10 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-600'
                    }`}>
                      {m.marginPct}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <span className={`font-bold ${m.roiPct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {m.roiPct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 flex items-center gap-1 text-[11px] text-slate-400">
          <Info className="size-3 shrink-0" />
          FBA fees estimated from product weight. Referral, pick, pack, and shipping fees are configurable above. Excludes storage fees and PPC.
        </p>
      </div>
    </div>
  );
}
