import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'react-toastify';
import {
  ArrowRight,
  Box,
  CheckCircle2,
  Contact,
  Download,
  FileSpreadsheet,
  Info,
  RefreshCw,
  Upload,
  AlertCircle,
  X,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney } from '../auth.jsx';
import { CancelButton, SubmitButton } from '../components/ui.jsx';
import { fileToCsv, downloadProductsTemplate, downloadCustomersTemplate } from '../spreadsheet.js';

export default function ImportExport() {
  const { can } = useAuth();
  const money = useMoney();

  const canProductsView = can('products', 'view') && can('import_export', 'view');
  const canProductsCreate = can('products', 'create') && can('import_export', 'create');
  const canProductsEdit = can('products', 'edit') && can('import_export', 'create');

  const canCustomersView = can('customers', 'view') && can('import_export', 'view');
  const canCustomersCreate = can('customers', 'create') && can('import_export', 'create');
  const canCustomersEdit = can('customers', 'edit') && can('import_export', 'create');

  const initialTab = canProductsView ? 'products' : 'customers';
  const [tab, setTab] = useState(initialTab);

  // Counts
  const [productCount, setProductCount] = useState(null);
  const [customerCount, setCustomerCount] = useState(null);
  const [loadingCounts, setLoadingCounts] = useState(true);

  // Import State for Products
  const prodFileRef = useRef(null);
  const [prodFile, setProdFile] = useState(null);
  const [prodCsv, setProdCsv] = useState('');
  const [prodMode, setProdMode] = useState('skip');
  const [prodPreview, setProdPreview] = useState(null);
  const [prodBusy, setProdBusy] = useState(false);

  // Import State for Customers
  const custFileRef = useRef(null);
  const [custFile, setCustFile] = useState(null);
  const [custCsv, setCustCsv] = useState('');
  const [custMode, setCustMode] = useState('skip');
  const [custPreview, setCustPreview] = useState(null);
  const [custBusy, setCustBusy] = useState(false);

  const fetchCounts = async () => {
    setLoadingCounts(true);
    try {
      if (canProductsView) {
        const res = await api.get('/products', { limit: 1 });
        setProductCount(res.data?.pagination?.total ?? 0);
      }
      if (canCustomersView) {
        const res = await api.get('/customers', { limit: 1 });
        setCustomerCount(res.data?.pagination?.total ?? 0);
      }
    } catch {
      /* ignore count error */
    } finally {
      setLoadingCounts(false);
    }
  };

  useEffect(() => {
    fetchCounts();
  }, [canProductsView, canCustomersView]);

  // Product Import Handlers
  const runProdImport = async (text, m, dryRun) => {
    const blob = new Blob([text], { type: 'text/csv' });
    return api.send('POST', `/products/import?mode=${m}${dryRun ? '&dryRun=1' : ''}`, blob);
  };

  const checkProdFile = async (f, m = prodMode) => {
    setProdBusy(true);
    setProdPreview(null);
    try {
      const text = f === prodFile && prodCsv ? prodCsv : await fileToCsv(f);
      setProdCsv(text);
      const res = await runProdImport(text, m, true);
      setProdPreview(res.data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setProdBusy(false);
    }
  };

  const confirmProdImport = async () => {
    setProdBusy(true);
    try {
      const r = await runProdImport(prodCsv, prodMode, false);
      toast.success(r.message);
      resetProd();
      fetchCounts();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setProdBusy(false);
    }
  };

  const resetProd = () => {
    setProdFile(null);
    setProdCsv('');
    setProdPreview(null);
    setProdMode('skip');
    if (prodFileRef.current) prodFileRef.current.value = '';
  };

  // Customer Import Handlers
  const runCustImport = async (text, m, dryRun) => {
    const blob = new Blob([text], { type: 'text/csv' });
    return api.send('POST', `/customers/import?mode=${m}${dryRun ? '&dryRun=1' : ''}`, blob);
  };

  const checkCustFile = async (f, m = custMode) => {
    setCustBusy(true);
    setCustPreview(null);
    try {
      const text = f === custFile && custCsv ? custCsv : await fileToCsv(f);
      setCustCsv(text);
      const res = await runCustImport(text, m, true);
      setCustPreview(res.data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCustBusy(false);
    }
  };

  const confirmCustImport = async () => {
    setCustBusy(true);
    try {
      const r = await runCustImport(custCsv, custMode, false);
      toast.success(r.message);
      resetCust();
      fetchCounts();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCustBusy(false);
    }
  };

  const resetCust = () => {
    setCustFile(null);
    setCustCsv('');
    setCustPreview(null);
    setCustMode('skip');
    if (custFileRef.current) custFileRef.current.value = '';
  };

  const prodWillWrite = prodPreview ? prodPreview.created + prodPreview.updated : 0;
  const custWillWrite = custPreview ? custPreview.created + custPreview.updated : 0;

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">Import & Export Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Bulk export and import products and customer accounts via CSV or Excel spreadsheets
          </p>
        </div>
        <button
          onClick={fetchCounts}
          disabled={loadingCounts}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 shadow-xs cursor-pointer"
        >
          <RefreshCw size={12} className={loadingCounts ? 'animate-spin' : ''} />
          <span>Refresh stats</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-2">
        {canProductsView && (
          <button
            type="button"
            onClick={() => setTab('products')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'products'
                ? 'border-purple-600 text-purple-600 bg-purple-50/50 rounded-t-md'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Box size={18} />
            <span>Products</span>
            {productCount !== null && (
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 font-normal">
                {productCount}
              </span>
            )}
          </button>
        )}
        {canCustomersView && (
          <button
            type="button"
            onClick={() => setTab('customers')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'customers'
                ? 'border-purple-600 text-purple-600 bg-purple-50/50 rounded-t-md'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Contact size={18} />
            <span>Customers</span>
            {customerCount !== null && (
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 font-normal">
                {customerCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* TAB 1: PRODUCTS */}
      {tab === 'products' && canProductsView && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Export Card */}
          <div className="lg:col-span-5 bg-white border border-gray-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Export Products</h2>
                  <p className="text-xs text-gray-500">Download complete catalog to CSV</p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2 text-xs text-gray-600">
                <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
                  <span className="font-medium text-gray-700">Total Products:</span>
                  <span className="font-bold text-gray-900 text-sm">
                    {productCount !== null ? productCount : '…'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
                  <span className="font-medium text-gray-700">Export Format:</span>
                  <span className="font-mono bg-white px-2 py-0.5 border border-gray-200 rounded text-gray-700">
                    CSV (UTF-8)
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="font-medium text-gray-700">Included Fields:</span>
                  <span className="text-gray-500">Name, Category, Barcode, Prices, Qty, Status</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                The exported CSV can be opened directly in Microsoft Excel, Google Sheets, or Apple Numbers.
                It can also be edited and re-imported to perform bulk catalog updates.
              </p>
            </div>

            <div className="pt-6 mt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-2">
              <a
                href="/api/products/export"
                download
                className="flex-1 inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors text-sm text-center"
              >
                <Download size={16} />
                <span>Export Products (CSV)</span>
              </a>
              <Link
                to="/admin/products"
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                <span>View Products</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {/* Import Card */}
          <div className="lg:col-span-7 bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
                  <Upload size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Import Products</h2>
                  <p className="text-xs text-gray-500">Upload CSV or Excel (.xlsx) spreadsheet</p>
                </div>
              </div>
              <button
                type="button"
                onClick={downloadProductsTemplate}
                className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 hover:underline font-medium cursor-pointer"
              >
                <Download size={13} /> Sample Template
              </button>
            </div>

            {/* Instruction box */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
              <p className="flex items-center gap-1 text-blue-900 font-semibold">
                <Info size={14} /> Spreadsheet Columns
              </p>
              <p>
                <b>Product Name</b> (required), <b>Category</b> (auto-created if new), <b>Barcode</b>, <b>Cost</b>,{' '}
                <b>Selling Price</b>, <b>Top Customer Price</b>, <b>Jobber Price</b>, <b>Quantity</b>, <b>Description</b>,{' '}
                <b>Status</b>.
              </p>
              <p className="text-gray-500">
                Products are matched by <b>Barcode</b> or <b>Product Name</b>. Up to 5,000 items per file.
              </p>
            </div>

            {canProductsCreate ? (
              <div className="space-y-4 pt-1">
                {/* File picker */}
                <div className="border-2 border-dashed border-gray-300 hover:border-purple-400 rounded-lg p-4 transition-colors bg-gray-50/50">
                  <input
                    ref={prodFileRef}
                    type="file"
                    id="prod-file-input"
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setProdFile(f || null);
                      setProdCsv('');
                      if (f) checkProdFile(f);
                    }}
                    className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white file:cursor-pointer hover:file:bg-purple-700 cursor-pointer"
                  />
                  {prodFile && (
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-600 bg-white p-2 rounded border border-gray-200">
                      <span className="font-medium truncate max-w-xs">{prodFile.name}</span>
                      <button
                        type="button"
                        onClick={resetProd}
                        className="text-gray-400 hover:text-red-500 p-0.5 cursor-pointer"
                        title="Remove file"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Import Mode */}
                <fieldset className="space-y-1.5 text-xs text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <legend className="font-semibold text-gray-800 mb-1">Duplicate Handling Mode</legend>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="prod-mode-full"
                      checked={prodMode === 'skip'}
                      onChange={() => {
                        setProdMode('skip');
                        if (prodFile) checkProdFile(prodFile, 'skip');
                      }}
                    />
                    <span>
                      <b>Skip existing</b>: Keep current catalog products untouched
                    </span>
                  </label>
                  <label className={`flex items-center gap-2 ${canProductsEdit ? 'cursor-pointer' : 'opacity-50'}`}>
                    <input
                      type="radio"
                      name="prod-mode-full"
                      disabled={!canProductsEdit}
                      checked={prodMode === 'update'}
                      onChange={() => {
                        setProdMode('update');
                        if (prodFile) checkProdFile(prodFile, 'update');
                      }}
                    />
                    <span>
                      <b>Update existing</b>: Overwrite prices, stock and details (blank cells keep current value)
                    </span>
                  </label>
                </fieldset>

                {prodBusy && !prodPreview && (
                  <p className="text-xs text-purple-600 flex items-center gap-1.5 font-medium">
                    <RefreshCw size={13} className="animate-spin" /> Analyzing spreadsheet…
                  </p>
                )}

                {/* Preview & Stats */}
                {prodPreview && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        ['New Products', prodPreview.created, 'text-emerald-700 bg-emerald-50 border-emerald-200'],
                        ['Updates', prodPreview.updated, 'text-blue-700 bg-blue-50 border-blue-200'],
                        ['Skipped', prodPreview.skipped, 'text-gray-700 bg-gray-50 border-gray-200'],
                        ['Errors', prodPreview.failed, prodPreview.failed ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-700 bg-gray-50 border-gray-200'],
                      ].map(([label, count, cls]) => (
                        <div key={label} className={`border rounded-lg p-2.5 text-center ${cls}`}>
                          <p className="text-xl font-bold">{count}</p>
                          <p className="text-[11px] font-medium opacity-80">{label}</p>
                        </div>
                      ))}
                    </div>

                    {prodPreview.ignoredColumns && prodPreview.ignoredColumns.length > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                        <b>Ignored columns:</b> {prodPreview.ignoredColumns.join(', ')}
                      </p>
                    )}

                    {/* Preview Table */}
                    {prodPreview.preview && prodPreview.preview.length > 0 && (
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50 border-b border-gray-200 flex justify-between">
                          <span>Sample preview (first {prodPreview.preview.length} rows)</span>
                          <span className="text-gray-400 font-normal">Ready to write</span>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 text-gray-600 font-semibold">
                            <tr>
                              {['Product Name', 'Category', 'Barcode', 'Cost', 'Selling', 'Qty', 'Status'].map((h) => (
                                <th key={h} className="text-left px-2.5 py-1.5">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {prodPreview.preview.map((p, i) => (
                              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50/50">
                                <td className="px-2.5 py-1.5 font-medium text-gray-900">{p.name}</td>
                                <td className="px-2.5 py-1.5 text-gray-600">{p.category || 'General'}</td>
                                <td className="px-2.5 py-1.5 text-gray-500 font-mono text-[11px]">{p.barcode || '—'}</td>
                                <td className="px-2.5 py-1.5 text-gray-700">{money(p.cost)}</td>
                                <td className="px-2.5 py-1.5 font-medium text-purple-700">{money(p.sellingPrice)}</td>
                                <td className="px-2.5 py-1.5 text-gray-700">{p.quantity}</td>
                                <td className="px-2.5 py-1.5">
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

                    {/* Errors List */}
                    {prodPreview.errors && prodPreview.errors.length > 0 && (
                      <div className="border border-red-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-1.5">
                          <AlertCircle size={14} />
                          <span>Rows with issues ({prodPreview.errors.length} will be skipped)</span>
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          <table className="w-full text-xs">
                            <tbody>
                              {prodPreview.errors.map((e, idx) => (
                                <tr key={idx} className="border-t border-red-100 hover:bg-red-50/30">
                                  <td className="px-2.5 py-1 whitespace-nowrap text-gray-500 font-mono text-[11px]">Row {e.row}</td>
                                  <td className="px-2.5 py-1 font-medium text-gray-800">{e.name || '—'}</td>
                                  <td className="px-2.5 py-1 text-red-600">{e.message}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                      <CancelButton onClick={resetProd} />
                      <SubmitButton
                        type="button"
                        mode="create"
                        isLoading={prodBusy}
                        isDisabled={!prodPreview || !prodWillWrite || prodBusy}
                        onClick={confirmProdImport}
                        icon={<Upload size={14} />}
                      >
                        {prodPreview ? `Execute Import (${prodWillWrite} products)` : 'Import Products'}
                      </SubmitButton>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 text-center">
                You do not have permission to import new products. Contact your administrator.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMERS */}
      {tab === 'customers' && canCustomersView && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Customer Export Card */}
          <div className="lg:col-span-5 bg-white border border-gray-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Export Customers</h2>
                  <p className="text-xs text-gray-500">Download customer directory to CSV</p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2 text-xs text-gray-600">
                <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
                  <span className="font-medium text-gray-700">Total Customers:</span>
                  <span className="font-bold text-gray-900 text-sm">
                    {customerCount !== null ? customerCount : '…'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
                  <span className="font-medium text-gray-700">Export Format:</span>
                  <span className="font-mono bg-white px-2 py-0.5 border border-gray-200 rounded text-gray-700">
                    CSV (UTF-8)
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="font-medium text-gray-700">Included Fields:</span>
                  <span className="text-gray-500">Name, Company, Email, Phone, Address, TRN, Price Tier</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                The customer export contains complete contact and invoicing details.
                Useful for client list backups, external marketing tools, or wholesale accounting.
              </p>
            </div>

            <div className="pt-6 mt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-2">
              <a
                href="/api/customers/export"
                download
                className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-colors text-sm text-center"
              >
                <Download size={16} />
                <span>Export Customers (CSV)</span>
              </a>
              <Link
                to="/admin/customers"
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                <span>View Customers</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {/* Customer Import Card */}
          <div className="lg:col-span-7 bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-teal-50 text-teal-600">
                  <Upload size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Import Customers</h2>
                  <p className="text-xs text-gray-500">Upload CSV or Excel (.xlsx) spreadsheet</p>
                </div>
              </div>
              <button
                type="button"
                onClick={downloadCustomersTemplate}
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 hover:underline font-medium cursor-pointer"
              >
                <Download size={13} /> Sample Template
              </button>
            </div>

            {/* Instruction box */}
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3 text-xs text-gray-600 space-y-1.5">
              <p className="flex items-center gap-1 text-emerald-900 font-semibold">
                <Info size={14} /> Spreadsheet Columns
              </p>
              <p>
                <b>Name</b> (required, or First Name + Last Name), <b>Company</b>, <b>Email</b>, <b>Phone</b>,{' '}
                <b>Address</b>, <b>Tax Number (TRN/VAT)</b>, <b>Price Level</b> (Selling / Top Customer / Jobber), <b>Notes</b>, <b>Status</b>.
              </p>
              <p className="text-gray-500">
                Customers are matched by <b>Email</b> (or Name + Phone if email is empty). Up to 5,000 items per file.
              </p>
            </div>

            {canCustomersCreate ? (
              <div className="space-y-4 pt-1">
                {/* File picker */}
                <div className="border-2 border-dashed border-gray-300 hover:border-emerald-400 rounded-lg p-4 transition-colors bg-gray-50/50">
                  <input
                    ref={custFileRef}
                    type="file"
                    id="cust-file-input"
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setCustFile(f || null);
                      setCustCsv('');
                      if (f) checkCustFile(f);
                    }}
                    className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white file:cursor-pointer hover:file:bg-emerald-700 cursor-pointer"
                  />
                  {custFile && (
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-600 bg-white p-2 rounded border border-gray-200">
                      <span className="font-medium truncate max-w-xs">{custFile.name}</span>
                      <button
                        type="button"
                        onClick={resetCust}
                        className="text-gray-400 hover:text-red-500 p-0.5 cursor-pointer"
                        title="Remove file"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Import Mode */}
                <fieldset className="space-y-1.5 text-xs text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <legend className="font-semibold text-gray-800 mb-1">Duplicate Handling Mode</legend>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cust-mode-full"
                      checked={custMode === 'skip'}
                      onChange={() => {
                        setCustMode('skip');
                        if (custFile) checkCustFile(custFile, 'skip');
                      }}
                    />
                    <span>
                      <b>Skip existing</b>: Keep current customer records untouched
                    </span>
                  </label>
                  <label className={`flex items-center gap-2 ${canCustomersEdit ? 'cursor-pointer' : 'opacity-50'}`}>
                    <input
                      type="radio"
                      name="cust-mode-full"
                      disabled={!canCustomersEdit}
                      checked={custMode === 'update'}
                      onChange={() => {
                        setCustMode('update');
                        if (custFile) checkCustFile(custFile, 'update');
                      }}
                    />
                    <span>
                      <b>Update existing</b>: Overwrite customer fields with spreadsheet values
                    </span>
                  </label>
                </fieldset>

                {custBusy && !custPreview && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1.5 font-medium">
                    <RefreshCw size={13} className="animate-spin" /> Analyzing spreadsheet…
                  </p>
                )}

                {/* Preview & Stats */}
                {custPreview && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        ['New Customers', custPreview.created, 'text-emerald-700 bg-emerald-50 border-emerald-200'],
                        ['Updates', custPreview.updated, 'text-blue-700 bg-blue-50 border-blue-200'],
                        ['Skipped', custPreview.skipped, 'text-gray-700 bg-gray-50 border-gray-200'],
                        ['Errors', custPreview.failed, custPreview.failed ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-700 bg-gray-50 border-gray-200'],
                      ].map(([label, count, cls]) => (
                        <div key={label} className={`border rounded-lg p-2.5 text-center ${cls}`}>
                          <p className="text-xl font-bold">{count}</p>
                          <p className="text-[11px] font-medium opacity-80">{label}</p>
                        </div>
                      ))}
                    </div>

                    {custPreview.ignoredColumns && custPreview.ignoredColumns.length > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                        <b>Ignored columns:</b> {custPreview.ignoredColumns.join(', ')}
                      </p>
                    )}

                    {/* Preview Table */}
                    {custPreview.preview && custPreview.preview.length > 0 && (
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50 border-b border-gray-200 flex justify-between">
                          <span>Sample preview (first {custPreview.preview.length} rows)</span>
                          <span className="text-gray-400 font-normal">Ready to write</span>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 text-gray-600 font-semibold">
                            <tr>
                              {['Name', 'Company', 'Email', 'Phone', 'Price Level'].map((h) => (
                                <th key={h} className="text-left px-2.5 py-1.5">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {custPreview.preview.map((c, i) => (
                              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50/50">
                                <td className="px-2.5 py-1.5 font-medium text-gray-900">{c.name}</td>
                                <td className="px-2.5 py-1.5 text-gray-600">{c.company || '—'}</td>
                                <td className="px-2.5 py-1.5 text-gray-600">{c.email || '—'}</td>
                                <td className="px-2.5 py-1.5 text-gray-600">{c.phone || '—'}</td>
                                <td className="px-2.5 py-1.5 capitalize text-gray-700">{c.priceLevel?.replace('_', ' ')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Errors List */}
                    {custPreview.errors && custPreview.errors.length > 0 && (
                      <div className="border border-red-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-1.5">
                          <AlertCircle size={14} />
                          <span>Rows with issues ({custPreview.errors.length} will be skipped)</span>
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          <table className="w-full text-xs">
                            <tbody>
                              {custPreview.errors.map((e, idx) => (
                                <tr key={idx} className="border-t border-red-100 hover:bg-red-50/30">
                                  <td className="px-2.5 py-1 whitespace-nowrap text-gray-500 font-mono text-[11px]">Row {e.row}</td>
                                  <td className="px-2.5 py-1 font-medium text-gray-800">{e.name || '—'}</td>
                                  <td className="px-2.5 py-1 text-red-600">{e.message}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                      <CancelButton onClick={resetCust} />
                      <SubmitButton
                        type="button"
                        mode="create"
                        isLoading={custBusy}
                        isDisabled={!custPreview || !custWillWrite || custBusy}
                        onClick={confirmCustImport}
                        icon={<Upload size={14} />}
                      >
                        {custPreview ? `Execute Import (${custWillWrite} customers)` : 'Import Customers'}
                      </SubmitButton>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 text-center">
                You do not have permission to import new customers. Contact your administrator.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
