import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, Info, ScanBarcode, Trash2, Upload, X, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { CancelButton, ConfirmModal, SubmitButton } from './ui.jsx';
import { fileToCsv } from '../spreadsheet.js';

// Barcode list: reference data (barcode → name, brand, size, photo). It never creates products or
// changes stock. A scan that matches no product shows the item from here (see /products/scan).
export default function BarcodeListCard() {
  const { can } = useAuth();
  const canImport = can('import_export', 'create');
  const canClear = can('import_export', 'delete');
  const fileRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [file, setFile] = useState(null);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    api.get('/barcode-list').then((r) => setStats(r.data)).catch((e) => toast.error(e.message));
  }, []);

  const reset = () => {
    setFile(null);
    setCsv('');
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const send = (text, dryRun) => api.send('POST', `/barcode-list/import${dryRun ? '?dryRun=1' : ''}`, new Blob([text], { type: 'text/csv' }));

  const check = async (f) => {
    setBusy(true);
    setPreview(null);
    try {
      const text = await fileToCsv(f);
      setCsv(text);
      const r = await send(text, true);
      setPreview(r.data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await send(csv, false);
      setStats(r.data.list);
      toast.success(r.message);
      reset();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      const r = await api.del('/barcode-list');
      setStats(r.data);
      toast.success(r.message);
      setConfirmClear(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setClearing(false);
    }
  };

  const willWrite = preview ? preview.created + preview.updated : 0;
  const n = (v) => Number(v || 0).toLocaleString();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
            <ScanBarcode size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Barcode List</h2>
            <p className="text-xs text-gray-500">
              Reference only: shows what a scanned item is. It never adds products or changes stock.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span>
            In the list: <b className="text-gray-950 text-sm">{stats ? n(stats.count) : '…'}</b> barcodes
            {stats?.importedAt && <span className="text-gray-400"> · last import {new Date(stats.importedAt).toLocaleDateString()}</span>}
          </span>
          {canClear && stats?.count > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 cursor-pointer"
            >
              <Trash2 size={13} /> Clear list
            </button>
          )}
        </div>
      </div>

      <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
        <p className="flex items-center gap-1 text-blue-900 font-semibold">
          <Info size={14} /> How it is used
        </p>
        <p>
          When a scanned barcode is not one of your products, New Invoice shows the item from this list (name, brand, size, photo), and
          &ldquo;Fill in from barcode&rdquo; uses it before any outside lookup.
        </p>
        <p>
          Columns: <b>UPC</b> or <b>Barcode</b> (required), <b>Product Name</b> (required), Brand, Category, Size, Image URL. Other columns are
          ignored. A barcode already in the list gets the new details (blank cells keep the old ones). Up to 50,000 rows per file.
        </p>
      </div>

      {canImport ? (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 hover:border-purple-400 rounded-lg p-4 transition-colors bg-gray-50/50">
            <input
              ref={fileRef}
              type="file"
              aria-label="Barcode list file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFile(f || null);
                if (f) check(f);
              }}
              className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white file:cursor-pointer hover:file:bg-purple-700 cursor-pointer"
            />
            {file && (
              <div className="mt-2 flex items-center justify-between text-xs text-gray-600 bg-white p-2 rounded border border-gray-200">
                <span className="font-medium truncate max-w-xs">{file.name}</span>
                <button type="button" onClick={reset} className="text-gray-400 hover:text-red-500 p-0.5 cursor-pointer" title="Remove file">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {busy && !preview && (
            <p className="text-xs text-purple-600 flex items-center gap-1.5 font-medium">
              <RefreshCw size={13} className="animate-spin" /> Reading file…
            </p>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['New barcodes', preview.created, 'text-emerald-700 bg-emerald-50 border-emerald-200'],
                  ['Updates', preview.updated, 'text-blue-700 bg-blue-50 border-blue-200'],
                  ['Repeated in file', preview.duplicates, 'text-gray-700 bg-gray-50 border-gray-200'],
                  ['Errors', preview.skipped, preview.skipped ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-700 bg-gray-50 border-gray-200'],
                ].map(([label, count, cls]) => (
                  <div key={label} className={`border rounded-lg p-2.5 text-center ${cls}`}>
                    <p className="text-xl font-bold">{n(count)}</p>
                    <p className="text-[11px] font-medium opacity-80">{label}</p>
                  </div>
                ))}
              </div>

              {preview.sample?.length > 0 && (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50 border-b border-gray-200">
                    Sample (first {preview.sample.length} rows)
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-600 font-semibold">
                      <tr>
                        {['Barcode', 'Product Name', 'Brand', 'Size', 'Category'].map((h) => (
                          <th key={h} className="text-left px-2.5 py-1.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((p) => (
                        <tr key={p.barcode} className="border-t border-gray-100">
                          <td className="px-2.5 py-1.5 font-mono text-[11px] text-gray-500">{p.barcode}</td>
                          <td className="px-2.5 py-1.5 font-medium text-gray-900">{p.name}</td>
                          <td className="px-2.5 py-1.5 text-gray-600">{p.brand || '—'}</td>
                          <td className="px-2.5 py-1.5 text-gray-600">{p.size || '—'}</td>
                          <td className="px-2.5 py-1.5 text-gray-600 max-w-48 truncate">{p.category || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.errors?.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    <span>
                      Rows with issues ({n(preview.skipped)} will be skipped{preview.skipped > preview.errors.length ? `, first ${preview.errors.length} shown` : ''})
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {preview.errors.map((e) => (
                          <tr key={e.row} className="border-t border-red-100">
                            <td className="px-2.5 py-1 whitespace-nowrap text-gray-500 font-mono text-[11px]">Row {e.row}</td>
                            <td className="px-2.5 py-1 font-medium text-gray-800">{e.name}</td>
                            <td className="px-2.5 py-1 text-red-600">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <CancelButton onClick={reset} />
                <SubmitButton type="button" mode="create" isLoading={busy} isDisabled={!willWrite || busy} onClick={confirm} icon={<Upload size={14} />}>
                  {`Import ${n(willWrite)} barcodes`}
                </SubmitButton>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 text-center">
          You do not have permission to import. Contact your administrator.
        </div>
      )}

      <ConfirmModal
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clear}
        isDeleting={clearing}
        title="Clear the barcode list?"
        message={`All ${stats ? n(stats.count) : ''} barcodes in the list will be removed. Your products and stock are not affected. You can import the file again later.`}
        confirmLabel="Clear list"
      />
    </div>
  );
}
