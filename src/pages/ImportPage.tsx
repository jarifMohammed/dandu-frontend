import { ChangeEvent, useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, Upload, XCircle } from 'lucide-react';
import { InlineError, Panel } from '../components/ui';
import { authApi, AuthSession } from '../lib/authApi';

type ImportResult = {
  batchId: string;
  totalRows: number;
  importedRows: number;
  failedRows: number;
};

export function ImportPage({ session }: { session: AuthSession }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const readFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a CSV file (.csv)');
      return;
    }
    setFileName(file.name);
    setResult(null);
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => setFileContent(e.target?.result as string ?? '');
    reader.readAsText(file);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const submit = async () => {
    if (!fileName || !fileContent) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await authApi.importSkuReport(session.accessToken, {
        fileName,
        content: fileContent,
      });
      setResult(response.data as ImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFileName(null);
    setFileContent(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      <Panel title="Historical CSV Import">
        <p className="mb-4 text-sm text-slate-500">
          Upload a Linnworks export CSV (My Inventory, Stock Level Report, or any standard export).
          The system will automatically map columns and upsert products, stock levels, and channel listings.
        </p>

        {/* Drop Zone */}
        <div
          className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 transition-colors ${
            dragging
              ? 'border-emerald-500 bg-emerald-50'
              : fileName
                ? 'border-emerald-300 bg-emerald-50/40'
                : 'border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/30'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={onFileChange}
          />

          {fileName ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
                <CheckCircle2 className="size-7 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-900">{fileName}</p>
                <p className="text-sm text-slate-500">
                  {fileContent
                    ? `${(fileContent.split('\n').length - 1).toLocaleString()} data rows detected`
                    : 'Reading file…'}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); reset(); }}
                className="text-xs font-semibold text-slate-400 hover:text-red-500 transition"
              >
                Remove file
              </button>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <Upload className="size-7 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700">Drop your CSV here</p>
                <p className="text-sm text-slate-400">or click to browse</p>
              </div>
              <p className="text-[11px] text-slate-400">Supports .csv files from Linnworks My Inventory export</p>
            </>
          )}
        </div>

        {/* Submit button */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={!fileName || !fileContent || loading}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><Loader2 className="size-4 animate-spin" /> Importing…</>
            ) : (
              <><FileUp className="size-4" /> Import Report</>
            )}
          </button>

          {fileName && !loading && (
            <button
              onClick={reset}
              className="text-sm font-semibold text-slate-400 hover:text-slate-700 transition"
            >
              Clear
            </button>
          )}
        </div>

        {error && (
          <InlineError text={error} />
        )}
      </Panel>

      {/* Result card */}
      {result && (
        <Panel title="Import Result">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Rows"
              value={result.totalRows.toLocaleString()}
              colour="slate"
            />
            <StatCard
              label="Imported"
              value={result.importedRows.toLocaleString()}
              colour="emerald"
              icon={<CheckCircle2 className="size-5" />}
            />
            <StatCard
              label="Failed"
              value={result.failedRows.toLocaleString()}
              colour={result.failedRows > 0 ? 'red' : 'slate'}
              icon={result.failedRows > 0 ? <XCircle className="size-5" /> : undefined}
            />
            <StatCard
              label="Batch ID"
              value={result.batchId.slice(0, 8) + '…'}
              colour="slate"
              mono
            />
          </div>

          {result.failedRows > 0 && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>{result.failedRows}</strong> rows could not be imported.
              Check that your CSV has a <strong>SKU</strong> / <strong>ItemNumber</strong> column.
            </p>
          )}

          {result.importedRows > 0 && result.failedRows === 0 && (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              ✓ All {result.importedRows.toLocaleString()} rows imported successfully.
              Go to the <strong>SKU Catalog</strong> tab to search your inventory.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  colour,
  icon,
  mono = false,
}: {
  label: string;
  value: string;
  colour: 'slate' | 'emerald' | 'red';
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  const colourMap = {
    slate:   'bg-slate-50 border-slate-200 text-slate-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red:     'bg-red-50 border-red-200 text-red-700',
  };

  return (
    <div className={`flex flex-col gap-1 rounded-xl border p-4 ${colourMap[colour]}`}>
      <span className="text-xs font-black uppercase tracking-wide opacity-60">{label}</span>
      <div className="flex items-center gap-2">
        {icon}
        <span className={`text-2xl font-black ${mono ? 'font-mono text-base' : ''}`}>{value}</span>
      </div>
    </div>
  );
}
