import { useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Download, Upload } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney } from '../auth.jsx';
import { CancelButton, Modal, SubmitButton } from './ui.jsx';
import { fileToCsv, downloadProductsTemplate } from '../spreadsheet.js';

export default function ProductImportModal({ isOpen, onClose, onDone }) {
  const { can } = useAuth();
  const money = useMoney();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [csv, setCsv] = useState('');
  const [mode, setMode] = useState('skip');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setCsv('');
    setPreview(null);
    setMode('skip');
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => {
    reset();
    onClose();
  };

  const run = async (text, m, dryRun) => {
    const blob = new Blob([text], { type: 'text/csv' });
    return api.send('POST', `/products/import?mode=${m}${dryRun ? '&dryRun=1' : ''}`, blob);
  };

  const check = async (f, m = mode) => {
    setBusy(true);
    setPreview(null);
    try {
      const text = f === file && csv ? csv : await fileToCsv(f);
      setCsv(text);
      const res = await run(text, m, true);
      setPreview(res.data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await run(csv, mode, false);
      toast.success(r.message);
      if (onDone) onDone();
      close();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const willWrite = preview ? preview.created + preview.updated : 0;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Import Products" size="3xl">
      <div className="space-y-4 text-sm text-gray-700">
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-md space-y-1">
          <p>
            Upload a <b>CSV</b> or <b>Excel (.xlsx)</b> file. The first row must be column headings. Recognised columns:{' '}
            <b>Product Name</b> (required), Category, Barcode, Cost, Selling Price, Top Customer Price, Jobber Price, Quantity, Description, Status.
          </p>
          <p>
            New categories in your file will be created automatically. Existing products are matched by Barcode or Product Name. Up to 5,000 rows per file.
          </p>
          <button
            type="button"
            onClick={downloadProductsTemplate}
            className="text-purple-600 hover:underline cursor-pointer inline-flex items-center gap-1 font-medium mt-1"
          >
            <Download size={14} /> Download sample template (.csv)
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setFile(f || null);
            setCsv('');
            if (f) check(f);
          }}
          className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-purple-600 file:text-white file:cursor-pointer"
        />

        <fieldset className="space-y-1">
          <legend className="font-medium text-gray-600 mb-1">If the product already exists</legend>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="prod-imp-mode"
              checked={mode === 'skip'}
              onChange={() => {
                setMode('skip');
                if (file) check(file, 'skip');
              }}
            />
            <span>Skip it (keep the existing product unchanged)</span>
          </label>
          <label className={`flex items-center gap-2 ${can('products', 'edit') ? 'cursor-pointer' : 'opacity-50'}`}>
            <input
              type="radio"
              name="prod-imp-mode"
              disabled={!can('products', 'edit')}
              checked={mode === 'update'}
              onChange={() => {
                setMode('update');
                if (file) check(file, 'update');
              }}
            />
            <span>Update it with the file's values (blank cells keep the current value)</span>
          </label>
        </fieldset>

        {busy && !preview && <p className="text-gray-500">Checking file…</p>}

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['New', preview.created, 'text-emerald-700'],
                ['Update', preview.updated, 'text-blue-700'],
                ['Skip', preview.skipped, 'text-gray-600'],
                ['Errors', preview.failed, preview.failed ? 'text-red-600' : 'text-gray-600'],
              ].map(([l, n, c]) => (
                <div key={l} className="border border-gray-200 rounded-md p-2 text-center bg-white shadow-xs">
                  <p className={`text-xl font-bold ${c}`}>{n}</p>
                  <p className="text-xs text-gray-500">{l}</p>
                </div>
              ))}
            </div>

            {preview.ignoredColumns && preview.ignoredColumns.length > 0 && (
              <p className="text-xs text-amber-700">Ignored columns (not recognised): {preview.ignoredColumns.join(', ')}</p>
            )}

            {preview.preview && preview.preview.length > 0 && (
              <div className="overflow-x-auto border border-gray-200 rounded-md">
                <p className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-50">First rows as they will be saved</p>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      {['Product Name', 'Category', 'Barcode', 'Cost', 'Selling', 'Qty', 'Status'].map((h) => (
                        <th key={h} className="text-left px-2 py-1 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((p, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1 font-medium">{p.name}</td>
                        <td className="px-2 py-1">{p.category || 'General'}</td>
                        <td className="px-2 py-1 text-gray-500">{p.barcode || '—'}</td>
                        <td className="px-2 py-1">{money(p.cost)}</td>
                        <td className="px-2 py-1">{money(p.sellingPrice)}</td>
                        <td className="px-2 py-1">{p.quantity}</td>
                        <td className="px-2 py-1">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${p.status ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                            {p.status ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {preview.errors && preview.errors.length > 0 && (
              <div className="border border-red-200 rounded-md max-h-48 overflow-y-auto">
                <p className="px-2 py-1 text-xs font-semibold text-red-700 bg-red-50">
                  These rows will be skipped{preview.failed > preview.errors.length ? ` (first ${preview.errors.length} of ${preview.failed} shown)` : ''}
                </p>
                <table className="w-full text-xs">
                  <tbody>
                    {preview.errors.map((e) => (
                      <tr key={e.row} className="border-t border-red-100">
                        <td className="px-2 py-1 whitespace-nowrap text-gray-500 font-mono">Row {e.row}</td>
                        <td className="px-2 py-1 font-medium">{e.name || '—'}</td>
                        <td className="px-2 py-1 text-red-700">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <CancelButton onClick={close} />
          <SubmitButton
            type="button"
            mode="create"
            isLoading={busy && Boolean(preview)}
            isDisabled={!preview || !willWrite || busy}
            onClick={confirm}
            icon={<Upload size={14} />}
          >
            {preview ? `Import ${willWrite} product${willWrite === 1 ? '' : 's'}` : 'Import'}
          </SubmitButton>
        </div>
      </div>
    </Modal>
  );
}
