import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router';
import { toast } from 'react-toastify';
import {
  Calendar,
  ChartNoAxesColumn,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Mail,
  PackageX,
  ReceiptText,
  ShieldCheck,
  Tags,
  TriangleAlert,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { Field, Loader, StatusBadge, SubmitButton, inputCls } from '../components/ui.jsx';

const ICONS = {
  sales: <ReceiptText size={20} />,
  inventory: <ChartNoAxesColumn size={20} />,
  'low-stock': <TriangleAlert size={20} />,
  'out-of-stock': <PackageX size={20} />,
  'price-list': <Tags size={20} />,
};

const DESCRIPTIONS = {
  sales: 'Total sale value, paid and owed with today, 7-day, monthly & custom filters. Deleted invoice sales are permanently recorded.',
  inventory: 'Every product with quantity on hand and stock value at cost and selling price.',
  'low-stock': "Products at or below each product's own alert level (or one threshold you choose).",
  'out-of-stock': 'Products with no stock left.',
  'price-list': 'Active products with their Selling, Top Customer and Jobber prices.',
};

export default function Reports() {
  const { can } = useAuth();
  const money = useMoney();

  const [types, setTypes] = useState(null);
  const [categories, setCategories] = useState([]);
  const [reportType, setReportType] = useState('sales');

  // Sales report filter state (Today is default)
  const [period, setPeriod] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customUntil, setCustomUntil] = useState('');
  const [salesData, setSalesData] = useState(null);
  const [loadingSales, setLoadingSales] = useState(false);

  // Email sending modal / state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Non-sales report params
  const [otherParams, setOtherParams] = useState({ categoryId: '', threshold: '' });

  useEffect(() => {
    api
      .get('/reports/types')
      .then(({ data }) => {
        setTypes(data.types);
        setEmailTo(data.defaultRecipient || '');
      })
      .catch((e) => toast.error(e.message));
    api.get('/categories/options').then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  const getLocalDateStr = (d = new Date()) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // Fetch sales report data whenever period or custom dates change
  const fetchSales = (selectedPeriod = period, from = customFrom, until = customUntil) => {
    setLoadingSales(true);
    const params = new URLSearchParams({ period: selectedPeriod });
    const todayStr = getLocalDateStr();

    if (selectedPeriod === 'today') {
      params.set('from', todayStr);
      params.set('until', todayStr);
    } else if (selectedPeriod === '7') {
      const d7 = new Date();
      d7.setDate(d7.getDate() - 6);
      params.set('from', getLocalDateStr(d7));
      params.set('until', todayStr);
    } else if (selectedPeriod === 'month') {
      const now = new Date();
      const d1 = new Date(now.getFullYear(), now.getMonth(), 1);
      params.set('from', getLocalDateStr(d1));
      params.set('until', todayStr);
    } else if (selectedPeriod === 'custom') {
      if (from) params.set('from', from);
      if (until) params.set('until', until);
    }
    api
      .get(`/reports/sales?${params.toString()}`)
      .then(({ data }) => {
        setSalesData(data);
        if (selectedPeriod !== 'custom') {
          setCustomFrom(data.summary.from || '');
          setCustomUntil(data.summary.until || '');
        }
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoadingSales(false));
  };

  useEffect(() => {
    if (reportType === 'sales') {
      fetchSales(period, customFrom, customUntil);
    }
  }, [reportType, period]);

  const handlePeriodChange = (p) => {
    setPeriod(p);
    if (p !== 'custom') {
      fetchSales(p);
    }
  };

  const handleApplyCustom = (e) => {
    e.preventDefault();
    setPeriod('custom');
    fetchSales('custom', customFrom, customUntil);
  };

  // Export Sales Report to CSV directly in browser
  const exportCsv = () => {
    if (!salesData || !salesData.sales?.length) {
      toast.info('No sales data to export in selected period.');
      return;
    }
    const headers = ['Invoice Number', 'Date', 'Customer', 'Items', 'Total Sale', 'Paid Amount', 'Balance', 'Status', 'Invoice State'];
    const rows = salesData.sales.map((s) => [
      `"${s.invoiceNumber}"`,
      `"${s.invoiceDate}"`,
      `"${s.customerName.replace(/"/g, '""')}"`,
      s.itemsCount,
      s.total.toFixed(2),
      s.paidAmount.toFixed(2),
      s.balance.toFixed(2),
      `"${s.status}"`,
      `"${s.invoiceDeleted ? 'Deleted / Saved' : 'Active'}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Sales report exported to CSV');
  };

  // Send Email (for both sales and other reports)
  const sendEmail = async (e) => {
    e.preventDefault();
    if (!emailTo) {
      toast.error('Please enter an email address');
      return;
    }
    setSendingEmail(true);
    try {
      const payload = {
        type: reportType,
        to: emailTo,
        from: reportType === 'sales' ? salesData?.summary?.from || customFrom : customFrom,
        until: reportType === 'sales' ? salesData?.summary?.until || customUntil : customUntil,
        categoryId: otherParams.categoryId,
        threshold: otherParams.threshold,
      };
      const res = await api.post('/reports/send', payload);
      toast.success(res.message);
      setEmailModalOpen(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  if (!types) return <Loader className="h-64" />;

  const summary = salesData?.summary || {
    totalSales: 0,
    totalPaid: 0,
    totalOwed: 0,
    salesCount: 0,
    paidCount: 0,
    partialCount: 0,
    unpaidCount: 0,
    deletedInvoicesCount: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            View total sale values, track receivables, and generate permanent audit reports.
          </p>
        </div>
      </div>

      {/* Report Type Selector Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {Object.entries(types).map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => setReportType(key)}
            className={`text-left relative bg-white rounded-xl shadow-sm hover:shadow-md transition-all p-3.5 border cursor-pointer ${
              reportType === key ? 'border-purple-600 ring-2 ring-purple-600/20' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border ${
                  reportType === key ? 'border-purple-300 bg-purple-50 text-purple-600' : 'border-gray-200 bg-gray-50 text-gray-600'
                }`}
              >
                {ICONS[key]}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{DESCRIPTIONS[key]}</p>
          </button>
        ))}
      </div>

      {/* SALES REPORT VIEW */}
      {reportType === 'sales' && (
        <div className="space-y-5">
          {/* Filter Bar with Periods */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mr-1 flex items-center gap-1">
                <Calendar size={14} /> Period:
              </span>
              <button
                type="button"
                onClick={() => handlePeriodChange('today')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  period === 'today'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>Today</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full uppercase ${period === 'today' ? 'bg-purple-700 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  Default
                </span>
              </button>
              <button
                type="button"
                onClick={() => handlePeriodChange('7')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  period === '7' ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => handlePeriodChange('month')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  period === 'month' ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => handlePeriodChange('custom')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  period === 'custom' ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Custom Range
              </button>
            </div>

            {/* Actions: Export CSV & Email Report */}
            <div className="flex items-center gap-2 self-end lg:self-auto">
              <button
                type="button"
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 transition-colors cursor-pointer"
              >
                <Download size={14} /> Export CSV
              </button>
              {can('reports', 'create') && (
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  <Mail size={14} /> Email Report (PDF)
                </button>
              )}
            </div>
          </div>

          {/* Custom Date Pickers (Shown if period is custom or user wants custom dates) */}
          {period === 'custom' && (
            <form onSubmit={handleApplyCustom} className="bg-purple-50/50 p-4 rounded-xl border border-purple-200 flex flex-wrap items-end gap-3">
              <div className="w-44">
                <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-purple-600"
                  required
                />
              </div>
              <div className="w-44">
                <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
                <input
                  type="date"
                  min={customFrom}
                  value={customUntil}
                  onChange={(e) => setCustomUntil(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-purple-600"
                  required
                />
              </div>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all cursor-pointer h-[32px]"
              >
                Filter Sales
              </button>
            </form>
          )}

          {/* Reassurance Callout for Deleted Invoices */}
          <div className="p-3 text-xs bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-start gap-2 shadow-xs">
            <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.2" />
            <div>
              <span className="font-semibold">Permanent Sales Audit Ledger: </span>
              Even if an invoice is expired or deleted from active invoices, its <strong>Total Sale Value</strong>, items, and payments remain permanently recorded and saved in this report.
            </div>
          </div>

          {/* 4 Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. TOTAL SALE VALUE */}
            <div className="bg-gradient-to-br from-purple-900 to-indigo-900 text-white p-5 rounded-2xl shadow-md border border-purple-800 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-purple-200">Total Sale Value</p>
                  <h3 className="text-3xl font-extrabold mt-1 tracking-tight text-white">{money(summary.totalSales)}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-purple-200 backdrop-blur-xs">
                  <Wallet size={22} />
                </div>
              </div>
              <p className="text-xs text-purple-200/80 mt-3 flex items-center gap-1">
                <span>📅</span>
                <span>
                  {summary.from === summary.until ? summary.from : `${summary.from} → ${summary.until}`}
                </span>
              </p>
            </div>

            {/* 2. TOTAL PAID */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Total Paid</p>
                  <h3 className="text-2xl font-bold mt-1 text-gray-900">{money(summary.totalPaid)}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 size={20} />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 font-medium">
                {summary.paidCount} fully paid sale{summary.paidCount === 1 ? '' : 's'}
              </p>
            </div>

            {/* 3. TOTAL OWED / UNPAID */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">Total Owed / Balance</p>
                  <h3 className="text-2xl font-bold mt-1 text-rose-600">{money(summary.totalOwed)}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                  <Clock size={20} />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 font-medium">
                {summary.unpaidCount} unpaid · {summary.partialCount} partial
              </p>
            </div>

            {/* 4. TOTAL TRANSACTIONS / SAVED SALES */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Recorded Sales</p>
                  <h3 className="text-2xl font-bold mt-1 text-gray-900">{summary.salesCount} Sales</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <FileSpreadsheet size={20} />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 font-medium">
                {summary.deletedInvoicesCount > 0 ? (
                  <span className="text-amber-600 font-semibold">{summary.deletedInvoicesCount} purged invoice sales preserved</span>
                ) : (
                  'All active in system'
                )}
              </p>
            </div>
          </div>

          {/* Sales Transactions Breakdown Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <ReceiptText size={16} className="text-purple-600" />
                Sales Breakdown ({salesData?.sales?.length || 0} recorded)
              </h2>
              <span className="text-xs text-gray-500">
                Sorted by most recent sale date
              </span>
            </div>

            {loadingSales ? (
              <Loader className="h-48" />
            ) : !salesData?.sales?.length ? (
              <div className="p-12 text-center text-gray-500">
                <p className="text-base font-semibold text-gray-700">No sales recorded for this period</p>
                <p className="text-xs text-gray-400 mt-1">Try selecting another period like "This Month" or "Last 7 Days".</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100/70 text-xs font-semibold uppercase tracking-wider text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4 text-center">Items</th>
                      <th className="py-3 px-4 text-right">Sale Value</th>
                      <th className="py-3 px-4 text-right">Paid</th>
                      <th className="py-3 px-4 text-right">Owed</th>
                      <th className="py-3 px-4 text-center">Payment</th>
                      <th className="py-3 px-4 text-center">Invoice State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {salesData.sales.map((s, idx) => (
                      <tr key={s.id || idx} className="hover:bg-purple-50/20 transition-colors">
                        <td className="py-3 px-4 text-xs text-gray-400 font-mono">{idx + 1}</td>
                        <td className="py-3 px-4 font-medium">
                          {s.invoiceId && !s.invoiceDeleted ? (
                            <Link
                              to={`/admin/invoices/view/${s.invoiceId}`}
                              className="text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-1"
                            >
                              {s.invoiceNumber}
                              <ExternalLink size={12} className="opacity-60" />
                            </Link>
                          ) : (
                            <span className="font-mono text-gray-800">{s.invoiceNumber}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-600 whitespace-nowrap">{s.invoiceDate}</td>
                        <td className="py-3 px-4 font-medium text-gray-900">{s.customerName}</td>
                        <td className="py-3 px-4 text-center text-xs text-gray-600">{s.itemsCount}</td>
                        <td className="py-3 px-4 text-right font-bold text-gray-900">{money(s.total)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-emerald-600">{money(s.paidAmount)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-rose-600">{money(s.balance)}</td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={s.status} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          {s.invoiceDeleted ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                              Purged / Saved
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900 text-xs uppercase">
                    <tr>
                      <td colSpan={5} className="py-3 px-4 text-right">
                        Totals for Period:
                      </td>
                      <td className="py-3 px-4 text-right text-purple-700 text-sm">{money(summary.totalSales)}</td>
                      <td className="py-3 px-4 text-right text-emerald-600 text-sm">{money(summary.totalPaid)}</td>
                      <td className="py-3 px-4 text-right text-rose-600 text-sm">{money(summary.totalOwed)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OTHER REPORT TYPES (Inventory, Low Stock, Out of Stock, Price List) */}
      {reportType !== 'sales' && (
        <form onSubmit={sendEmail} className="p-6 bg-white border border-gray-200 rounded-xl space-y-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <FileText size={20} className="text-purple-600" />
            <h2 className="text-lg font-bold text-gray-900">{types[reportType]}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Category Filter" htmlFor="r-cat">
              <select
                id="r-cat"
                value={otherParams.categoryId}
                onChange={(e) => setOtherParams((p) => ({ ...p, categoryId: e.target.value }))}
                className={`${inputCls} bg-white h-[42px]`}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            {reportType === 'low-stock' && (
              <Field label="Low Stock Threshold (blank = each product's own alert level)" htmlFor="r-th">
                <input
                  id="r-th"
                  type="number"
                  min="0"
                  placeholder="Each product's alert level"
                  value={otherParams.threshold}
                  onChange={(e) => setOtherParams((p) => ({ ...p, threshold: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className={inputCls}
                />
              </Field>
            )}

            <Field label="Recipient Email Address" required htmlFor="r-to">
              <input
                id="r-to"
                type="email"
                required
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className={inputCls}
                placeholder="manager@store.com"
              />
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            {can('reports', 'create') ? (
              <SubmitButton isLoading={sendingEmail} icon={<Mail size={16} />}>
                {sendingEmail ? 'Generating & Emailing...' : 'Email PDF + CSV Report'}
              </SubmitButton>
            ) : (
              <p className="text-sm text-gray-500">Your role can view reports but cannot send emails.</p>
            )}
          </div>
        </form>
      )}

      {/* Email Report Modal for Sales Report */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Mail size={18} className="text-purple-600" />
                Email Sales Report
              </h3>
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-gray-600">
              The Sales Report for period <strong>{summary.from} → {summary.until}</strong> will be emailed as an attached PDF & CSV spreadsheet.
            </p>

            <form onSubmit={sendEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Recipient Email</label>
                <input
                  type="email"
                  required
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                  placeholder="manager@store.com"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEmail}
                  className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  {sendingEmail ? 'Sending...' : 'Send Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
