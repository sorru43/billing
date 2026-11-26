import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import { ArrowLeft, ArrowRight, Banknote, Building2, CheckSquare, CirclePlus, CreditCard, FileCheck, Grid3x3, HelpCircle, Maximize2, Minimize2, Printer, Send, Smartphone, Trash2, XCircle } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, Logo } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { CancelButton, Modal, SubmitButton, useDebounced } from '../components/ui.jsx';
import MatrixGridModal from '../components/MatrixGridModal.jsx';
import { ScanBar, ScanProblemModal, beep, useScannerKeys, useStoredFlag } from '../components/BarcodeScan.jsx';
import { ChromeContext } from '../components/Layout.jsx';

const LEVELS = [
  { value: 'selling', label: 'Selling Price', field: 'selling_price' },
  { value: 'top_customer', label: 'Top Customer Price', field: 'top_customer_price' },
  { value: 'jobber', label: 'Jobber Price', field: 'jobber_price' },
];
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
const newRow = () => ({ key: crypto.randomUUID(), product: null, description: '', quantity: 1, rate: 0 });
const round2 = (n) => Math.round(n * 100) / 100;

const fieldCls =
  'border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600';
const smallCls =
  'p-2 h-10 w-full border text-gray-700 text-sm border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600';

// hideMatrix: list only sellable rows (variants by name), e.g. when receiving stock.
export function ProductPicker({ value, onPick, error, hideMatrix = false }) {
  const { t } = useI18n();
  const [q, setQ] = useState(value?.name || '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  // A barcode that is no product but is on the store's barcode list: what the item is.
  const [listed, setListed] = useState(null);
  const debounced = useDebounced(q, 200);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const money = useMoney();
  // The list is position:fixed so the table's horizontal-scroll wrapper cannot clip it.
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => setQ(value?.name || ''), [value]);
  // A matrix pick opens the grid and may leave this row's product unchanged (top-up or cancel),
  // so the box would keep showing the search text: put the row's own product name back.
  // The same goes for a product merged into an existing line (onPick returns true): this row is unchanged.
  const pick = (p) => {
    const merged = onPick(p);
    setOpen(false);
    setListed(null);
    if (p.isMatrix || merged) setQ(value?.name || '');
  };
  useEffect(() => {
    if (!open) return;
    api.get('/products/search', { q: debounced })
      .then((r) => setResults(hideMatrix ? r.data.filter((p) => !p.isMatrix) : r.data))
      .catch(() => setResults([]));
  }, [debounced, open]);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative w-full" ref={ref}>
      <input
        ref={inputRef}
        className={`${smallCls} ${error ? 'border-red-500' : ''}`}
        placeholder="Search name or scan barcode..."
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setListed(null);
        }}
        onKeyDown={async (e) => {
          // Barcode scanners type the code and press Enter: pick an exact match straight away.
          if (e.key === 'Enter') {
            e.preventDefault();
            const code = q.trim();
            const r = await api.get('/products/search', { q }).catch(() => null);
            const found = (r?.data || []).filter((p) => !hideMatrix || !p.isMatrix);
            const exact = found.find((p) => p.barcode && p.barcode === code) || (found.length === 1 ? found[0] : null);
            if (exact) pick(exact);
            else if (!found.length && /^[0-9]{6,14}$/.test(code)) {
              // Not a product: the barcode list may still know it. Users without scan access just get nothing.
              const s = await api.get('/products/scan', { code }).catch(() => null);
              setListed(s?.data?.listed || null);
              if (s?.data?.listed) setOpen(false); // the empty "No products found" list would cover the note
            }
          }
        }}
      />
      {listed && (
        <p className="mt-1 text-xs text-purple-700">
          {t('scan.not_in_products', 'Not in your products')}: <span className="font-semibold">{listed.name}</span>
          {[listed.brand, listed.size].filter(Boolean).length > 0 && <span className="text-gray-500"> · {[listed.brand, listed.size].filter(Boolean).join(' · ')}</span>}
          <span className="text-gray-500"> ({t('scan.from_list', 'from your barcode list')})</span>
        </p>
      )}
      {open && pos && (
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-30 w-[min(28rem,90vw)] bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto"
        >
          {results.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No products found</p>}
          {results.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => pick(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex justify-between gap-3 cursor-pointer"
            >
              <span>
                <span className="text-gray-950 font-medium">{p.name}</span>
                {p.isMatrix && <span className="block text-xs text-gray-500">Matrix · {p.attributes.join(' × ')}</span>}
                {p.barcode && <span className="block text-xs text-gray-500">{p.barcode}</span>}
              </span>
              {p.isMatrix ? (
                <span className="text-xs whitespace-nowrap text-purple-600 font-semibold flex items-center gap-1">
                  <Grid3x3 size={12} /> {p.variantCount} variants · {p.quantity} in stock
                </span>
              ) : (
                <span className={`text-xs whitespace-nowrap ${p.quantity <= 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {p.quantity} in stock · {money(p.selling_price)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

// Search saved customers and fill the Bill To block (and their default price level) in one click.
function CustomerPicker({ onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const debounced = useDebounced(q, 200);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    api.get('/customers/options', { search: debounced }).then((r) => setResults(r.data)).catch(() => setResults([]));
  }, [debounced, open]);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative sm:col-span-2" ref={ref}>
      <input
        className={smallCls}
        placeholder="Search saved customers by name, company, email or phone..."
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {results.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No saved customers found — type the details below</p>}
          {results.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => (onPick(c), setQ(''), setOpen(false))}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
            >
              <span className="text-gray-950 font-medium">{c.name}</span>
              {c.company && <span className="text-gray-500"> · {c.company}</span>}
              {(c.email || c.phone) && <span className="block text-xs text-gray-500">{[c.email, c.phone].filter(Boolean).join(' · ')}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// customerId: the saved customer picked for this invoice, if any. Money above the total is then kept
// on their account (older bills, then credit) instead of being change, and the footer says so.
export function InvoicePaymentSection({ total, payment, setPayment, money, customerId }) {
  const { t } = useI18n();
  const cashVal = Number(payment.cash) || 0;
  const checkVal = Number(payment.check) || Number(payment.cheque) || 0;
  const zelleVal = Number(payment.zelle) || Number(payment.bank) || 0;
  const cardVal = Number(payment.card) || 0;
  const otherVal = Number(payment.other) || 0;
  const totalPaid = payment.isNotPaid ? 0 : round2(cashVal + checkVal + zelleVal + cardVal + otherVal);
  const remaining = Math.max(0, round2(total - totalPaid));

  const handleFull = (method) => {
    const currentMethodVal = Number(payment[method]) || 0;
    const amountToPut = remaining > 0 ? round2(currentMethodVal + remaining) : total;
    setPayment((p) => ({
      ...p,
      isNotPaid: false,
      [method]: String(amountToPut),
    }));
  };

  const handleNotPaid = () => {
    setPayment({
      isNotPaid: true,
      cash: '',
      cheque: '',
      chequeNumber: '',
      check: '',
      checkNumber: '',
      bank: '',
      bankReference: '',
      zelle: '',
      card: '',
      cardReference: '',
      other: '',
      otherNote: '',
    });
  };

  const isUnpaid = payment.isNotPaid || (totalPaid === 0 && !cashVal && !checkVal && !zelleVal && !cardVal && !otherVal);

  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
      {/* Header matching handwritten sketch: Payment and [Not Paid] */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
        <div>
          <span className="text-base font-bold text-gray-900">{t('inv.payment', 'Payment')}</span>
          <span className="text-xs text-gray-500 ml-2 hidden sm:inline">(Select method & amount)</span>
        </div>
        <button
          type="button"
          onClick={handleNotPaid}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
            isUnpaid
              ? 'bg-amber-100 border-amber-400 text-amber-900 ring-2 ring-amber-400 font-bold'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
          }`}
        >
          <XCircle size={14} className={isUnpaid ? 'text-amber-700' : 'text-gray-400'} />
          {t('inv.not_paid', 'Not Paid')}
        </button>
      </div>

      <div className="space-y-2">
        {/* Cash */}
        <div className={`p-2.5 rounded-lg border transition-all ${cashVal > 0 ? 'bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-300' : 'bg-gray-50/70 border-gray-200'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <Banknote size={15} className="text-emerald-600" /> {t('inv.cash', 'Cash')}
            </span>
            <button
              type="button"
              onClick={() => handleFull('cash')}
              className="text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
            >
              {t('inv.full', 'Full')} ({money(remaining > 0 ? remaining : total)})
            </button>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={payment.cash}
              onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, cash: e.target.value }))}
              className="w-full pl-7 pr-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600"
            />
          </div>
        </div>

        {/* Check */}
        <div className={`p-2.5 rounded-lg border transition-all ${checkVal > 0 ? 'bg-blue-50/50 border-blue-300 ring-1 ring-blue-300' : 'bg-gray-50/70 border-gray-200'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <FileCheck size={15} className="text-blue-600" /> {t('inv.check', 'Check')}
            </span>
            <button
              type="button"
              onClick={() => handleFull('check')}
              className="text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
            >
              {t('inv.full', 'Full')} ({money(remaining > 0 ? remaining : total)})
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder={t('inv.check_num', 'Check # (optional)')}
              value={payment.checkNumber || payment.chequeNumber || ''}
              onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, checkNumber: e.target.value, chequeNumber: e.target.value }))}
              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-md text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600"
            />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={payment.check || payment.cheque || ''}
                onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, check: e.target.value, cheque: e.target.value }))}
                className="w-full pl-7 pr-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600"
              />
            </div>
          </div>
        </div>

        {/* Zelle */}
        <div className={`p-2.5 rounded-lg border transition-all ${zelleVal > 0 ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-300' : 'bg-gray-50/70 border-gray-200'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <Smartphone size={15} className="text-indigo-600" /> {t('inv.zelle', 'Zelle')}
            </span>
            <button
              type="button"
              onClick={() => handleFull('zelle')}
              className="text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
            >
              {t('inv.full', 'Full')} ({money(remaining > 0 ? remaining : total)})
            </button>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={payment.zelle || payment.bank || ''}
              onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, zelle: e.target.value, bank: e.target.value }))}
              className="w-full pl-7 pr-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600"
            />
          </div>
        </div>

        {/* Card */}
        <div className={`p-2.5 rounded-lg border transition-all ${cardVal > 0 ? 'bg-violet-50/50 border-violet-300 ring-1 ring-violet-300' : 'bg-gray-50/70 border-gray-200'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <CreditCard size={15} className="text-violet-600" /> {t('inv.card', 'Card')}
            </span>
            <button
              type="button"
              onClick={() => handleFull('card')}
              className="text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
            >
              {t('inv.full', 'Full')} ({money(remaining > 0 ? remaining : total)})
            </button>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={payment.card}
              onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, card: e.target.value }))}
              className="w-full pl-7 pr-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600"
            />
          </div>
        </div>
      </div>

      {/* Live Calculation Footer */}
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-1 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-gray-600 font-medium">{t('inv.total_paid', 'Total Paid')}:</span>
          <span className="font-bold text-emerald-700 text-sm">{money(totalPaid)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 font-medium">{t('inv.balance_due', 'Balance Due')}:</span>
          <span className={`font-bold text-sm ${remaining > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
            {money(remaining)}
          </span>
        </div>
        {totalPaid > total && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">{customerId ? t('inv.extra_kept', 'Extra (kept on their account)') : t('inv.change', 'Change')}:</span>
            <span className="font-bold text-purple-700">{money(round2(totalPaid - total))}</span>
          </div>
        )}
        {totalPaid > total && customerId && (
          <p className="text-[11px] text-purple-800 bg-purple-50 border border-purple-200 rounded p-1.5">
            {t('inv.extra_kept_note', "Not change: it pays this customer's older unpaid invoices first, and the rest stays as credit for their next invoice.")}
          </p>
        )}
        <div className="flex justify-between items-center pt-1.5 border-t border-gray-200">
          <span className="text-gray-500 font-medium">{t('inv.status', 'Payment Status')}:</span>
          <span className={`font-bold text-xs px-2 py-0.5 rounded-full ${
            isUnpaid
              ? 'bg-amber-100 text-amber-800'
              : remaining === 0
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-blue-100 text-blue-800'
          }`}>
            {isUnpaid ? t('inv.status_unpaid', 'Unpaid') : remaining === 0 ? t('inv.status_paid', 'Paid in Full') : t('inv.status_partial', 'Partial Payment')}
          </span>
        </div>
      </div>
    </div>
  );
}

export function InvoicePaymentModal({
  isOpen,
  onClose,
  total,
  payment,
  setPayment,
  onConfirm,
  saving,
  customerName,
  customerId,
}) {
  const money = useMoney();
  const cashVal = Number(payment.cash) || 0;
  const chequeVal = Number(payment.cheque) || Number(payment.check) || 0;
  const bankVal = Number(payment.bank) || Number(payment.zelle) || 0;
  const cardVal = Number(payment.card) || 0;
  const otherVal = Number(payment.other) || 0;
  const totalPaid = payment.isNotPaid ? 0 : round2(cashVal + chequeVal + bankVal + cardVal + otherVal);
  const remaining = Math.max(0, round2(total - totalPaid));

  const handleFull = (method) => {
    const currentMethodVal = Number(payment[method]) || 0;
    const amountToPut = remaining > 0 ? round2(currentMethodVal + remaining) : total;
    setPayment((p) => ({
      ...p,
      isNotPaid: false,
      [method]: String(amountToPut),
    }));
  };

  const handleNotPaid = () => {
    setPayment({
      isNotPaid: true,
      cash: '',
      cheque: '',
      chequeNumber: '',
      check: '',
      checkNumber: '',
      bank: '',
      bankReference: '',
      zelle: '',
      card: '',
      cardReference: '',
      other: '',
      otherNote: '',
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Payment Options">
      <div className="space-y-4">
        {/* Top Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-lg">
          <div>
            <p className="text-xs text-gray-500 font-medium">Customer: <strong className="text-gray-900">{customerName || 'Customer'}</strong></p>
            <p className="text-xl font-bold text-gray-950">
              Invoice Total: <span className="text-purple-700">{money(total)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleNotPaid}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md border transition-all cursor-pointer flex items-center gap-1.5 ${
              payment.isNotPaid || (totalPaid === 0 && !cashVal && !chequeVal && !bankVal && !cardVal && !otherVal)
                ? 'bg-yellow-100 border-yellow-400 text-yellow-900 ring-2 ring-yellow-400'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <XCircle size={14} className="text-yellow-700" />
            Not Paid (Credit / Owed)
          </button>
        </div>

        {/* Payment Methods: Cash, Cheque, Bank, Credit / Debit, Others */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Enter Payment Received
          </p>

          {/* Cash */}
          <div className="p-3 border border-gray-200 rounded-lg bg-white space-y-1 hover:border-purple-300 transition-colors">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Banknote size={16} className="text-emerald-600" /> Cash
              </label>
              <button
                type="button"
                onClick={() => handleFull('cash')}
                className="text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
              >
                Full ({money(remaining > 0 ? remaining : total)})
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={payment.cash}
                disabled={payment.isNotPaid}
                onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, cash: e.target.value }))}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md text-base font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:bg-gray-100"
              />
            </div>
          </div>

          {/* Cheque */}
          <div className="p-3 border border-gray-200 rounded-lg bg-white space-y-1 hover:border-purple-300 transition-colors">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <CheckSquare size={16} className="text-blue-600" /> Cheque
              </label>
              <button
                type="button"
                onClick={() => handleFull('cheque')}
                className="text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
              >
                Full ({money(remaining > 0 ? remaining : total)})
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Cheque # (optional)"
                value={payment.chequeNumber || payment.checkNumber || ''}
                disabled={payment.isNotPaid}
                onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, chequeNumber: e.target.value, checkNumber: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:bg-gray-100"
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={payment.cheque || payment.check || ''}
                  disabled={payment.isNotPaid}
                  onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, cheque: e.target.value, check: e.target.value }))}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md text-base font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Bank */}
          <div className="p-3 border border-gray-200 rounded-lg bg-white space-y-1 hover:border-purple-300 transition-colors">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Building2 size={16} className="text-indigo-600" /> Bank Transfer
              </label>
              <button
                type="button"
                onClick={() => handleFull('bank')}
                className="text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
              >
                Full ({money(remaining > 0 ? remaining : total)})
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Bank / Transfer Ref (optional)"
                value={payment.bankReference || ''}
                disabled={payment.isNotPaid}
                onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, bankReference: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:bg-gray-100"
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={payment.bank || payment.zelle || ''}
                  disabled={payment.isNotPaid}
                  onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, bank: e.target.value, zelle: e.target.value }))}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md text-base font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Credit / Debit Card */}
          <div className="p-3 border border-gray-200 rounded-lg bg-white space-y-1 hover:border-purple-300 transition-colors">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <CreditCard size={16} className="text-violet-600" /> Credit / Debit Card
              </label>
              <button
                type="button"
                onClick={() => handleFull('card')}
                className="text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
              >
                Full ({money(remaining > 0 ? remaining : total)})
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Card Ref / Last 4 (optional)"
                value={payment.cardReference || ''}
                disabled={payment.isNotPaid}
                onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, cardReference: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:bg-gray-100"
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={payment.card || ''}
                  disabled={payment.isNotPaid}
                  onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, card: e.target.value }))}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md text-base font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Others */}
          <div className="p-3 border border-gray-200 rounded-lg bg-white space-y-1 hover:border-purple-300 transition-colors">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <HelpCircle size={16} className="text-gray-600" /> Others
              </label>
              <button
                type="button"
                onClick={() => handleFull('other')}
                className="text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
              >
                Full ({money(remaining > 0 ? remaining : total)})
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Description / Reference"
                value={payment.otherNote || ''}
                disabled={payment.isNotPaid}
                onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, otherNote: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:bg-gray-100"
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={payment.other || ''}
                  disabled={payment.isNotPaid}
                  onChange={(e) => setPayment((p) => ({ ...p, isNotPaid: false, other: e.target.value }))}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md text-base font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Calculation Card */}
        <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Amount Received:</span>
            <span className="font-bold text-emerald-700">{money(totalPaid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Remaining Balance Due:</span>
            <span className={`font-bold ${remaining > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {money(remaining)}
            </span>
          </div>
          {totalPaid > total && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">{customerId ? 'Extra (pays older bills, rest kept as credit):' : 'Change to give back:'}</span>
              <span className="font-bold text-purple-700">{money(round2(totalPaid - total))}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 border-t border-gray-200 text-xs">
            <span className="text-gray-500 font-medium">Invoice Status:</span>
            <span className={`font-bold capitalize ${
              payment.isNotPaid || totalPaid === 0 ? 'text-yellow-700' : remaining === 0 ? 'text-emerald-700' : 'text-blue-700'
            }`}>
              {payment.isNotPaid || totalPaid === 0 ? 'Unpaid' : remaining === 0 ? 'Paid in Full' : 'Partial Payment'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-md cursor-pointer"
          >
            Back to Invoice
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onConfirm}
            className="px-5 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-gray-950 rounded-md shadow cursor-pointer disabled:opacity-70 transition-colors flex items-center gap-1.5"
          >
            {saving ? 'Saving...' : 'Complete & Save Invoice'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Shown to staff who can make invoices but not open the invoice list: print it here, then start the next one.
// The PDF opens only while the creator's window on the invoice is open (it closes after printing).
function SavedInvoiceModal({ saved, money, onNext }) {
  const { t } = useI18n();
  if (!saved) return null;
  return (
    <Modal isOpen onClose={onNext} title={t('inv.saved_title', 'Invoice saved')} size="md">
      <div className="space-y-4 text-center">
        <FileCheck size={40} className="mx-auto text-emerald-600" />
        <div>
          <p className="text-lg font-bold text-gray-950">{saved.invoiceNumber}</p>
          <p className="text-sm text-gray-600">
            {saved.customerName} · {money(saved.total)}
          </p>
        </div>
        <p className="text-xs text-gray-500">
          {t('inv.saved_print_once', 'Print it now. After printing, an admin has to approve access to open it again.')}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <a
            href={`/api/invoices/${saved.id}/pdf`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-gray-950"
          >
            <Printer size={16} /> {t('inv.print_pdf', 'Print / PDF')}
          </a>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100 cursor-pointer"
          >
            <CirclePlus size={16} /> {t('inv.start_next', 'Start next invoice')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const EMPTY_PAYMENT = {
  isNotPaid: false,
  cash: '',
  cheque: '',
  chequeNumber: '',
  bank: '',
  bankReference: '',
  card: '',
  cardReference: '',
  other: '',
  otherNote: '',
};
const EMPTY_FORM = {
  invoiceDate: '',
  dueDate: '',
  customerId: '',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerAddress: '',
  priceLevel: 'selling',
  notes: '',
  status: 'unpaid',
};
// rise: product/matrix id -> % their price went up with the cost since it was given
const NO_PRICES = { products: new Map(), matrices: new Map(), rise: new Map() };

// New invoice, or (with :id) editing a saved one. Each line's price comes from the customer's own
// price for that product (or its matrix item) when there is one, else from the price level; a price
// typed by hand ("manual") or kept from the saved invoice ("saved") is never re-priced automatically.
// A price typed for a saved customer becomes their own price (unless "Keep as their price" is unticked).
// A new invoice has two steps: the items, then "Next" to the payment (cash, check, Zelle, card).
// Role permissions (modules.js): without "Change prices on invoices" the price can't be typed over;
// without "Choose the price level on invoices" there is no level choice: the customer's own level, else
// Selling. The server applies the same rules (invoices.js, applyPriceRules).
export default function InvoiceCreate() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const editing = Boolean(editId);
  const { company, can } = useAuth();
  const money = useMoney();
  const { t } = useI18n();
  const canPrice = can('invoice_prices', 'view');
  const canLevel = can('invoice_price_level', 'view');
  const [step, setStep] = useState('items'); // 'items' | 'payment' (new invoices only)
  const onItems = editing || step === 'items';
  const topRef = useRef(null);
  const goStep = (s) => {
    setStep(s);
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  // Full screen: no sidebar or top bar, only the invoice (and the browser's own full screen when it allows).
  const [fullScreen, setFullScreen] = useState(false);
  const { setHideChrome } = useContext(ChromeContext);
  useEffect(() => {
    setHideChrome(fullScreen);
    return () => setHideChrome(false);
  }, [fullScreen, setHideChrome]);
  useEffect(
    () => () => {
      // Leaving the page (e.g. to the saved invoice) brings the browser out of full screen too.
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    },
    [],
  );
  const toggleFullScreen = () => {
    const next = !fullScreen;
    setFullScreen(next);
    try {
      if (next && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      if (!next && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } catch {
      /* the browser doesn't allow it: the sidebar and top bar are still hidden */
    }
  };
  const fullScreenButton = (
    <button
      type="button"
      onClick={toggleFullScreen}
      className="no-print inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 cursor-pointer"
      title={fullScreen ? t('inv.exit_full_screen', 'Exit full screen') : t('inv.full_screen', 'Full screen')}
    >
      {fullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      <span className="hidden sm:inline">{fullScreen ? t('inv.exit_full_screen', 'Exit full screen') : t('inv.full_screen', 'Full screen')}</span>
    </button>
  );
  const [number, setNumber] = useState('');
  const [payment, setPayment] = useState(EMPTY_PAYMENT);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, invoiceDate: today() }));
  const [rows, setRows] = useState([newRow()]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [grid, setGrid] = useState(null); // { matrixId, rowKey } while the matrix grid is open
  const [allowOversell, setAllowOversell] = useState(false); // admin setting: sell more than is in stock
  const [custPrices, setCustPrices] = useState(NO_PRICES);
  const [saved, setSaved] = useState(null); // create-only staff: the invoice just made, to print
  const [editInfo, setEditInfo] = useState(null); // { paidAmount, status } of the invoice being edited
  const [loadError, setLoadError] = useState('');
  // Editing: the invoice's own quantities count as available stock for its lines.
  const origQty = useRef(new Map());
  const stockOf = (p) => Number(p.quantity) + (origQty.current.get(p.id) || 0);
  useEffect(() => {
    api.get('/settings/inventory').then((r) => setAllowOversell(r.data.allowOutOfStockSales)).catch(() => {});
  }, []);

  // The picked customer's own prices.
  useEffect(() => {
    if (!form.customerId) return setCustPrices(NO_PRICES);
    let live = true;
    api
      .get(`/customers/${form.customerId}/prices`)
      .then((r) => {
        if (!live) return;
        const products = new Map();
        const matrices = new Map();
        const rise = new Map();
        for (const x of r.data) {
          (x.productId ? products : matrices).set(x.productId || x.matrixId, Number(x.price));
          if (x.price > x.givenPrice && x.costBasis > 0) rise.set(x.productId || x.matrixId, Math.round((x.cost / x.costBasis - 1) * 1000) / 10);
        }
        setCustPrices({ products, matrices, rise });
      })
      .catch(() => live && setCustPrices(NO_PRICES));
    return () => {
      live = false;
    };
  }, [form.customerId]);

  // Editing: load the invoice into the form.
  useEffect(() => {
    if (!editing) return;
    api
      .get(`/invoices/${editId}/edit`)
      .then(({ data }) => {
        const byId = new Map(data.products.map((p) => [p.id, p]));
        origQty.current = new Map();
        for (const it of data.items) origQty.current.set(it.productId, (origQty.current.get(it.productId) || 0) + Number(it.quantity));
        setNumber(data.invoiceNumber);
        setForm({
          invoiceDate: String(data.invoiceDate).slice(0, 10),
          dueDate: data.dueDate ? String(data.dueDate).slice(0, 10) : '',
          customerId: data.customerId || '',
          customerName: data.customerName || '',
          customerEmail: data.customerEmail || '',
          customerPhone: data.customerPhone || '',
          customerAddress: data.customerAddress || '',
          priceLevel: data.priceLevel || 'selling',
          notes: data.notes || '',
          status: data.status,
        });
        setRows(
          data.items.map((it) => {
            const p = byId.get(it.productId) || { id: it.productId, name: it.name, barcode: it.barcode, quantity: 0, missing: true };
            return { ...newRow(), product: p, matrixId: p.matrix?.id, description: it.description || '', quantity: it.quantity, rate: it.rate, source: 'saved' };
          }),
        );
        setEditInfo({ paidAmount: Number(data.paidAmount) || 0, status: data.status });
      })
      .catch((e) => setLoadError(e.message));
  }, [editing, editId]);

  // Barcode scanning (see BarcodeScan.jsx): each scan adds 1 of the item, or a popup says why it couldn't.
  const [scanMode, setScanMode] = useStoredFlag('billing_scan_mode', true);
  const [scanSound, setScanSound] = useStoredFlag('billing_scan_sound', true);
  const [scanStatus, setScanStatus] = useState(null); // { ok, text } for the last scan
  const [scanProblem, setScanProblem] = useState(null); // the popup's contents
  const [scanBusy, setScanBusy] = useState(false);
  const scanBoxRef = useRef(null);
  const scanQueue = useRef(Promise.resolve()); // scans are handled one at a time, in order
  const scanCache = useRef(new Map()); // barcode -> product, so repeat scans are instant
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // Back to the scan box once the popup closes (or the items step is back), so the next scan goes in.
  useEffect(() => {
    if (scanMode && !scanProblem && step === 'items') scanBoxRef.current?.focus();
  }, [scanMode, scanProblem, step]);
  // A scan on the payment step must not type a barcode into a payment amount: it goes back to the
  // items and adds the item there.
  const noBoxRef = useRef(null);
  useScannerKeys(scanMode && step === 'payment', (code) => {
    setStep('items');
    handleScan(code);
  }, noBoxRef);

  const loadNextNumber = () =>
    api.get('/invoices/next-number').then((r) => {
      setNumber(r.data.invoiceNumber);
    }).catch(() => {});
  useEffect(() => {
    if (!editing) loadNextNumber();
  }, [editing]);

  const level = LEVELS.find((l) => l.value === form.priceLevel);
  // Payments belong to the invoice's customer, so after one the customer stays.
  const customerLocked = editing && (editInfo?.paidAmount || 0) > 0;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // The price for a product on this invoice: the customer's own (product, then its matrix item), else the level's.
  const priceOf = (p, matrixId = p.matrix?.id, field = level.field, prices = custPrices) => {
    const ownId = prices.products.has(p.id) ? p.id : matrixId && prices.matrices.has(matrixId) ? matrixId : null;
    if (!ownId) return { rate: Number(p[field]), source: 'level', rise: 0 };
    return { rate: prices.products.get(ownId) ?? prices.matrices.get(ownId), source: 'customer', rise: prices.rise.get(ownId) || 0 };
  };

  // New customer prices (customer picked or cleared): re-price the lines that were priced automatically.
  useEffect(() => {
    setRows((rs) => rs.map((r) => (r.product && (r.source === 'level' || r.source === 'customer') ? { ...r, ...priceOf(r.product, r.matrixId) } : r)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custPrices]);

  // Changing the price level re-prices the lines (the customer's own prices still win), except a
  // price typed by hand on this screen: picking a customer with another level must not wipe it.
  const changeLevel = (value) => {
    const field = LEVELS.find((l) => l.value === value).field;
    setForm((f) => ({ ...f, priceLevel: value }));
    setRows((rs) => rs.map((r) => (r.product && r.source !== 'manual' ? { ...r, ...priceOf(r.product, r.matrixId, field) } : r)));
  };

  const pickCustomer = (c) => {
    const address = [c.company, c.address, c.taxNumber && `Tax No: ${c.taxNumber}`].filter(Boolean).join('\n');
    setForm((f) => ({ ...f, customerId: c.id, customerName: c.name, customerEmail: c.email, customerPhone: c.phone, customerAddress: address }));
    const own = c.priceLevel || 'selling';
    if (own !== form.priceLevel) changeLevel(own);
  };
  // Typing another name unlinks the saved customer. Staff who can't choose the level go back to Selling.
  const typeCustomerName = (e) => {
    const name = e.target.value;
    setForm((f) => ({ ...f, customerName: name, customerId: '' }));
    if (!canLevel && form.customerId && form.priceLevel !== 'selling') changeLevel('selling');
  };

  // Picking a product fills the row; picking a matrix item opens its variant grid instead.
  // A product already on another line (same item, name or barcode) adds 1 to that line's quantity
  // instead of becoming a second row; returns true when it merged so the picker can reset itself.
  const pickProduct = (key, p) => {
    if (p.isMatrix) {
      setGrid({ matrixId: p.id, rowKey: key });
      return false;
    }
    const name = (p.name || '').trim().toLowerCase();
    const barcode = (p.barcode || '').trim();
    const same = rows.find(
      (r) =>
        r.key !== key &&
        r.product &&
        (r.product.id === p.id ||
          (name && (r.product.name || '').trim().toLowerCase() === name) ||
          (barcode && (r.product.barcode || '').trim() === barcode)),
    );
    if (same) {
      setRows((rs) => rs.map((r) => (r.key === same.key ? { ...r, quantity: (Number(r.quantity) || 0) + 1 } : r)));
      toast.info(`${same.product.name}: quantity +1`, { autoClose: 1200 });
      return true;
    }
    setRow(key, { product: p, matrixId: p.matrix?.id, ...priceOf(p), description: p.description || '' });
    return false;
  };

  // Grid lines: a variant already on the invoice (same item, name or barcode) gets its quantity topped up, others become new rows
  // (the row the grid was opened from is reused if it is still empty).
  const addFromGrid = (picked) => {
    setRows((rs) => {
      let next = [...rs];
      const fresh = [];
      for (const { product, quantity } of picked) {
        const name = (product.name || '').trim().toLowerCase();
        const i = next.findIndex(
          (r) =>
            r.product &&
            (r.product.id === product.id ||
              (name && (r.product.name || '').trim().toLowerCase() === name) ||
              (product.barcode && r.product.barcode === product.barcode)),
        );
        if (i >= 0) next[i] = { ...next[i], quantity: (Number(next[i].quantity) || 0) + quantity };
        else fresh.push({ ...newRow(), product, quantity, matrixId: grid.matrixId, ...priceOf(product, grid.matrixId), description: product.description || '' });
      }
      const at = next.findIndex((r) => r.key === grid.rowKey);
      if (at >= 0 && !next[at].product && fresh.length) next.splice(at, 1, ...fresh);
      else next = [...next.filter((r) => r.product), ...fresh];
      return next.length ? next : [newRow()];
    });
  };

  // Same merge rule as pickProduct: same item, name or barcode means the same line.
  const isSameItem = (r, p) => {
    if (!r.product) return false;
    const name = (p.name || '').trim().toLowerCase();
    const barcode = (p.barcode || '').trim();
    return (
      r.product.id === p.id ||
      Boolean(name && (r.product.name || '').trim().toLowerCase() === name) ||
      Boolean(barcode && (r.product.barcode || '').trim() === barcode)
    );
  };

  const scanFailed = (problem, text) => {
    if (scanSound) beep(false);
    setScanStatus({ ok: false, text });
    setScanProblem(problem);
  };

  // One scan = 1 more of the item: tops up its line, else fills the first empty line, else adds a line.
  const addScanned = (p) => {
    const line = rowsRef.current.find((r) => isSameItem(r, p));
    const qty = (line ? Number(line.quantity) || 0 : 0) + 1;
    const stock = stockOf(line?.product || p);
    if (!allowOversell && qty > stock) {
      scanFailed({ kind: 'noStock', code: p.barcode, name: p.name, stock }, `${p.name}: ${t('scan.only', 'only')} ${stock} ${t('scan.in_stock', 'in stock')}`);
      return;
    }
    const apply = (rs) => {
      const i = rs.findIndex((r) => isSameItem(r, p));
      if (i >= 0) return rs.map((r, j) => (j === i ? { ...r, quantity: (Number(r.quantity) || 0) + 1 } : r));
      const added = { ...newRow(), product: p, matrixId: p.matrix?.id, ...priceOf(p), description: p.description || '' };
      const empty = rs.findIndex((r) => !r.product);
      if (empty >= 0) return rs.map((r, j) => (j === empty ? { ...added, key: r.key } : r));
      return [...rs, added];
    };
    rowsRef.current = apply(rowsRef.current); // a fast second scan must see this one before React re-renders
    setRows(apply);
    if (scanSound) beep(true);
    setScanStatus({ ok: true, text: `✓ ${p.name} × ${qty} · ${money(line ? line.rate : priceOf(p).rate)}` });
  };

  const lookupScan = async (code) => {
    const cached = scanCache.current.get(code);
    if (cached) return addScanned(cached);
    setScanBusy(true);
    try {
      const { data } = await api.get('/products/scan', { code });
      if (data.product) {
        scanCache.current.set(code, data.product);
        addScanned(data.product);
      } else if (data.inactive) {
        scanFailed({ kind: 'inactive', code, name: data.name }, `${data.name}: ${t('scan.inactive', 'Product is turned off')}`);
      } else if (data.listed) {
        // On the store's barcode list (reference only): say what the item is.
        scanFailed({ kind: 'notFound', code, listed: data.listed }, `${t('scan.not_in_products', 'Not in your products')}: ${data.listed.name} (${code})`);
      } else {
        scanFailed({ kind: 'notFound', code }, `${t('scan.not_found', 'Product not found')}: ${code}`);
      }
    } catch (err) {
      scanFailed({ kind: 'error', code, message: err.message }, err.message);
    } finally {
      setScanBusy(false);
    }
  };

  const handleScan = (raw) => {
    const code = String(raw || '').trim();
    if (!code) return;
    setScanProblem(null); // the next scan closes the last popup
    scanQueue.current = scanQueue.current.then(() => lookupScan(code)).catch(() => {});
  };

  const addCreatedProduct = (p) => {
    setScanProblem(null);
    scanCache.current.set(p.barcode, p);
    toast.success(`${p.name}: ${t('scan.created', 'product added to the catalog')}`);
    addScanned(p);
  };

  const lines = useMemo(
    () =>
      rows.map((r) => {
        return { ...r, amount: round2((Number(r.quantity) || 0) * (Number(r.rate) || 0)) };
      }),
    [rows],
  );
  // Lines here have no discount or tax, so the subtotal is the total (the server recomputes both on save).
  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0));
  const total = subtotal;

  const validateInvoice = () => {
    setErrors({});
    const filled = lines.filter((l) => l.product);
    if (!filled.length) {
      setErrors({ items: 'Add at least one product' });
      return null;
    }
    if (!form.customerName.trim()) {
      setErrors({ customerName: 'Customer name is required' });
      return null;
    }
    return filled;
  };

  // Step 1 → 2: the items are checked here; stock and prices are checked by the server on save.
  const goToPayment = () => {
    if (!validateInvoice()) return;
    goStep('payment');
  };

  const handleSave = async (overridePayment) => {
    const filled = validateInvoice();
    if (!filled) {
      if (step !== 'items') goStep('items'); // show what's missing
      return;
    }
    setSaving(true);
    const activePayment = overridePayment !== undefined ? overridePayment : payment;
    const items = filled.map((l) => ({
      productId: l.product.id,
      description: l.description,
      quantity: Number(l.quantity),
      rate: Number(l.rate),
      remember: Boolean(form.customerId) && l.source === 'manual' && l.remember !== false,
    }));
    try {
      if (editing) {
        // Payments are not part of an edit: they are recorded on the invoice page.
        const r = await api.put(`/invoices/${editId}`, { ...form, items });
        toast.success(r.message || `Invoice ${number} updated`);
        navigate(`/admin/invoices/view/${editId}`);
        return;
      }
      const { data } = await api.post('/invoices', { ...form, payment: activePayment, items });
      const kept = data.pricesRemembered;
      toast.success(`Invoice ${data.invoiceNumber} created${kept ? `. ${kept} price${kept === 1 ? '' : 's'} saved as ${data.customerName}'s own` : ''}`);
      setPaymentModalOpen(false);
      // Staff who can make invoices but not open the invoice list print it from here.
      if (can('invoices', 'view')) navigate(`/admin/invoices/view/${data.id}`);
      else setSaved({ id: data.id, invoiceNumber: data.invoiceNumber, total: Number(data.total), customerName: data.customerName });
    } catch (err) {
      const mapped = {};
      let onItems = false; // an error the items step shows (a line, the customer)
      for (const [k, v] of Object.entries(err.errors || {})) {
        const m = k.match(/^items\.(\d+)\.(\w+)$/);
        if (m && filled[Number(m[1])]) mapped[`${filled[Number(m[1])].key}.${m[2]}`] = v;
        else mapped[k] = v;
        if (m || k === 'items' || k.startsWith('customer')) onItems = true;
      }
      setErrors(mapped);
      if (onItems && step !== 'items') goStep('items');
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Enter in a field, or the main button: a new invoice goes from the items to the payment, then saves.
  const handleDone = (e) => {
    if (e) e.preventDefault();
    if (!editing && step === 'items') return goToPayment();
    const filled = validateInvoice();
    if (!filled) return;
    handleSave();
  };

  // After a create-only cashier's invoice: a clean form for the next customer.
  const startNext = () => {
    setSaved(null);
    setForm({ ...EMPTY_FORM, invoiceDate: today() });
    setRows([newRow()]);
    setPayment(EMPTY_PAYMENT);
    setErrors({});
    setScanStatus(null);
    goStep('items');
    loadNextNumber();
  };

  const handleSaveUnpaid = (e) => {
    if (e) e.preventDefault();
    handleSave({
      isNotPaid: true,
      cash: '',
      cheque: '',
      chequeNumber: '',
      check: '',
      checkNumber: '',
      bank: '',
      bankReference: '',
      zelle: '',
      card: '',
      cardReference: '',
      other: '',
      otherNote: '',
    });
  };

  if (loadError) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 font-semibold">{loadError}</p>
        <button type="button" onClick={() => navigate(`/admin/invoices/view/${editId}`)} className="text-purple-600 text-sm mt-2 cursor-pointer">
          ← Back to the invoice
        </button>
      </div>
    );
  }

  return (
    <div ref={topRef} className="md:p-4 min-h-screen border border-gray-200 rounded">
      <form onSubmit={handleDone}>
        <div className="max-w-7xl mx-auto space-y-4 p-2">
          <div className="flex justify-between items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-gray-950 ">
              {editing ? `${t('inv.edit_invoice', 'Edit Invoice')} ${number}` : t('inv.new_invoice', 'New Invoice')}
              {!editing && step === 'payment' && <span className="text-gray-400 font-semibold"> · {t('inv.payment', 'Payment')}</span>}
            </h1>
            <div className="flex items-center gap-3">
              {fullScreenButton}
              <Logo kind="invoice" alt="" />
            </div>
          </div>
          {onItems && (
          <>
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${canLevel ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 w-full`}>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t('inv.invoice_number', 'Invoice Number')}</label>
              <input readOnly value={number} className={`${fieldCls} mt-1 bg-gray-50`} title={editing ? 'The invoice number stays the same' : 'Assigned automatically when saved'} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('inv.invoice_date', 'Invoice Date')} <span className="text-red-500">*</span>
              </label>
              <input type="date" required value={form.invoiceDate} onChange={set('invoiceDate')} className={`${fieldCls} mt-1`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('inv.due_date', 'Due Date')}</label>
              <input type="date" min={form.invoiceDate} value={form.dueDate} onChange={set('dueDate')} className={`${fieldCls} mt-1`} />
            </div>
            {canLevel && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('inv.price_level', 'Price Level')} <span className="text-red-500">*</span>
              </label>
              <select value={form.priceLevel} onChange={(e) => changeLevel(e.target.value)} className={`${fieldCls} mt-1 bg-white`}>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="font-bold text-gray-950 ">Bill From</h3>
              <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700 space-y-0.5">
                <p className="font-semibold text-gray-950">{company.companyName || 'Your company'}</p>
                {company.address && <p className="whitespace-pre-line">{company.address}</p>}
                {company.email && <p>{company.email}</p>}
                {company.phone && <p>{company.phone}</p>}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="font-bold text-gray-950 ">
                Bill To <span className="text-red-500">*</span>
              </h3>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {customerLocked ? (
                  <p className="sm:col-span-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                    {money(editInfo.paidAmount)} has been paid on this invoice, so its customer can&apos;t be changed. You can still correct the
                    contact details.
                  </p>
                ) : (
                  (can('customers', 'view') || can('invoices', 'create')) && <CustomerPicker onPick={pickCustomer} />
                )}
                <div className="sm:col-span-2">
                  <input
                    required
                    maxLength={200}
                    placeholder="Customer name *"
                    value={form.customerName}
                    readOnly={customerLocked}
                    onChange={typeCustomerName}
                    className={`${smallCls} ${customerLocked ? 'bg-gray-50' : ''}`}
                  />
                  {form.customerId && custPrices.products.size + custPrices.matrices.size > 0 && (
                    <p className="text-xs text-emerald-700 mt-1">
                      {custPrices.products.size + custPrices.matrices.size} custom price(s) for this customer are applied to matching items
                    </p>
                  )}
                  {errors.customerName && <p className="text-xs text-red-600 mt-1">{errors.customerName}</p>}
                </div>
                <div>
                  <input type="email" maxLength={200} placeholder="Customer email" value={form.customerEmail} onChange={set('customerEmail')} className={smallCls} />
                  {errors.customerEmail && <p className="text-xs text-red-600 mt-1">{errors.customerEmail}</p>}
                </div>
                <input maxLength={30} placeholder="Phone" value={form.customerPhone} onChange={set('customerPhone')} className={smallCls} />
                <textarea
                  rows={2}
                  maxLength={1000}
                  placeholder="Address"
                  value={form.customerAddress}
                  onChange={set('customerAddress')}
                  className="sm:col-span-2 p-2 w-full border text-gray-700 text-sm border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <ScanBar
              enabled={scanMode}
              onToggle={setScanMode}
              onScan={handleScan}
              status={scanStatus}
              boxRef={scanBoxRef}
              sound={scanSound}
              onSound={setScanSound}
              busy={scanBusy}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="bg-black text-white text-left">
                    <th className="px-3 py-3 rounded-l-md w-64">{t('inv.item', 'Item')}</th>
                    <th className="px-3 py-3">{t('inv.description', 'Description')}</th>
                    <th className="px-3 py-3 w-24">{t('inv.quantity', 'Quantity')}</th>
                    <th className="px-3 py-3 w-32">{t('inv.price', 'Price ($)')}</th>
                    <th className="px-3 py-3 w-32 text-right">{t('inv.total', 'Total')}</th>
                    <th className="px-3 py-3 w-16 rounded-r-md">{t('action.actions', 'Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="align-top">
                      <td className="px-3 py-3">
                        <ProductPicker
                          value={l.product}
                          error={errors[`${l.key}.productId`]}
                          onPick={(p) => pickProduct(l.key, p)}
                        />
                        {l.product && (
                          <p className={`text-xs mt-1 ${Number(l.quantity) > stockOf(l.product) ? (allowOversell ? 'text-amber-700' : 'text-red-600') : 'text-gray-500'}`}>
                            {stockOf(l.product)} {editing ? t('inv.available', 'available') : t('prod.in_stock', 'in stock')}
                            {Number(l.quantity) > stockOf(l.product) && (allowOversell ? ' · selling more than in stock' : ' · not enough stock')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <textarea
                          rows={1}
                          maxLength={1000}
                          placeholder={t('inv.description', 'Description')}
                          value={l.description}
                          onChange={(e) => setRow(l.key, { description: e.target.value })}
                          className="p-2 min-h-10 w-full border text-gray-700 text-sm border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={l.quantity}
                          onChange={(e) => setRow(l.key, { quantity: e.target.value })}
                          className={`${smallCls} ${errors[`${l.key}.quantity`] ? 'border-red-500' : ''}`}
                        />
                        {errors[`${l.key}.quantity`] && <p className="text-xs text-red-600 mt-1">{errors[`${l.key}.quantity`]}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.rate}
                          readOnly={!canPrice}
                          title={canPrice ? undefined : t('inv.price_locked', "Your role can't change prices")}
                          onChange={(e) => canPrice && setRow(l.key, { rate: e.target.value, source: 'manual' })}
                          className={`${smallCls} ${!canPrice ? 'bg-gray-50 cursor-not-allowed' : ''} ${l.source === 'customer' ? 'border-emerald-400 bg-emerald-50/40' : ''} ${errors[`${l.key}.rate`] ? 'border-red-500' : ''}`}
                        />
                        {errors[`${l.key}.rate`] && <p className="text-xs text-red-600 mt-1 max-w-[14rem]">{errors[`${l.key}.rate`]}</p>}
                        {l.product && l.source === 'customer' && (
                          <p className="text-[11px] text-emerald-700 mt-1 whitespace-nowrap">
                            {t('inv.customer_price', 'Customer price')}
                            {l.rise > 0 && ` · ${t('inv.cost_up', 'cost up')} ${l.rise}%`}
                          </p>
                        )}
                        {l.product && l.source === 'manual' && form.customerId && Number(l.rate) > 0 && (
                          <label className="mt-1 flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer select-none whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={l.remember !== false}
                              onChange={(e) => setRow(l.key, { remember: e.target.checked })}
                              className="h-3 w-3 accent-purple-600"
                            />
                            {t('inv.remember_price', 'Keep as their price')}
                          </label>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-gray-950 pt-5">{money(l.amount)}</td>
                      <td className="px-3 py-3 pt-5">
                        <button
                          type="button"
                          aria-label="Remove row"
                          onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== l.key) : [newRow()]))}
                          className="text-red-600 cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errors.items && <p className="text-xs text-red-600 px-3">{errors.items}</p>}
            <button type="button" onClick={() => setRows((rs) => [...rs, newRow()])} className="flex items-center gap-1 text-sm text-purple-600 font-semibold mt-3 px-3 cursor-pointer">
              <CirclePlus size={16} /> {t('action.add_row', 'Add New Row')}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7 space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-950 mb-2">{t('inv.extra_info', 'Extra Information')}</h2>
                <label className="block text-sm font-medium text-gray-700">{t('inv.notes', 'Additional Notes')}</label>
                <textarea
                  rows={4}
                  maxLength={5000}
                  placeholder="Enter Notes / Terms"
                  value={form.notes}
                  onChange={set('notes')}
                  className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600"
                />
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              {/* Total Card */}
              <div className="bg-gradient-to-br from-purple-50 to-white p-4 rounded-xl border border-purple-200 shadow-2xs">
                <p className="text-xs font-bold uppercase tracking-wider text-purple-700 mb-1">{t('inv.invoice_total', 'Invoice Total')}</p>
                <p className="text-3xl font-extrabold text-gray-950 tracking-tight">{money(total)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {lines.filter((l) => l.product).length} item(s) · Subtotal {money(subtotal)}
                </p>
              </div>
              {editing && (
                <div className="bg-white p-4 rounded-lg border border-gray-200 text-sm text-gray-700 space-y-1">
                  <p className="font-bold text-gray-950">{t('inv.payments', 'Payments')}</p>
                  <p>
                    Paid so far: <b>{money(editInfo?.paidAmount || 0)}</b>
                    {editInfo && total > editInfo.paidAmount && <> · still owed after this change: <b>{money(total - editInfo.paidAmount)}</b></>}
                  </p>
                  {editInfo && editInfo.paidAmount > total && (
                    <p className="text-amber-800">
                      The new total is {money(editInfo.paidAmount - total)} below what was paid.{' '}
                      {form.customerId ? 'That amount goes to the customer’s credit.' : 'For a walk-in customer this can’t be saved.'}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">Payments aren&apos;t changed here. Record them with “Mark as Paid” on the invoice page.</p>
                </div>
              )}
            </div>
          </div>
          </>
          )}

          {/* Step 2 of a new invoice: the payment (after "Next") */}
          {!editing && step === 'payment' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="bg-gradient-to-br from-purple-50 to-white p-4 rounded-xl border border-purple-200 shadow-2xs flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-purple-700 mb-1">{t('inv.invoice_total', 'Invoice Total')}</p>
                  <p className="text-3xl font-extrabold text-gray-950 tracking-tight">{money(total)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {number} · {form.customerName} · {lines.filter((l) => l.product).length} item(s)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => goStep('items')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-purple-700 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 cursor-pointer"
                >
                  <ArrowLeft size={16} /> {t('inv.back_to_items', 'Back to items')}
                </button>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200 flex flex-wrap items-center gap-4">
                <label className="text-sm font-medium text-gray-700">{t('inv.status', 'Payment Status')}</label>
                {['unpaid', 'paid'].map((s) => (
                  <label key={s} className="flex items-center cursor-pointer">
                    <input type="radio" name="status" value={s} checked={form.status === s} onChange={set('status')} className="h-4 w-4 accent-purple-600" />
                    <span className="ml-2 text-sm text-gray-700 capitalize">{s === 'unpaid' ? t('inv.status_unpaid', 'Unpaid') : t('inv.status_paid', 'Paid in Full')}</span>
                  </label>
                ))}
              </div>
              <InvoicePaymentSection total={total} payment={payment} setPayment={setPayment} money={money} customerId={form.customerId} />
            </div>
          )}

          {editing ? (
          <div className="flex justify-end items-center gap-3 pt-3 border-t border-gray-200">
            <CancelButton onClick={() => navigate(`/admin/invoices/view/${editId}`)} label={t('action.cancel', 'Cancel')} />
            <button
              type="button"
              disabled={saving || !editInfo}
              onClick={handleDone}
              className="px-8 py-2.5 text-base font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-gray-950 rounded-lg shadow-md cursor-pointer transition-colors disabled:opacity-60"
            >
              {saving ? t('action.saving', 'Saving...') : t('action.save_changes', 'Save Changes')}
            </button>
          </div>
          ) : step === 'items' ? (
          <div className="flex justify-end items-center gap-3 pt-3 border-t border-gray-200">
            <CancelButton onClick={() => navigate(can('invoices', 'view') ? '/admin/invoices' : '/admin')} label={t('action.cancel', 'Cancel')} />
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveUnpaid}
              className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg shadow-2xs cursor-pointer transition-colors"
            >
              {t('inv.save_unpaid', 'Save as Unpaid')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={goToPayment}
              className="px-8 py-2.5 text-base font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-gray-950 rounded-lg shadow-md cursor-pointer transition-colors flex items-center gap-2"
            >
              {t('inv.next', 'Next')} <ArrowRight size={18} />
            </button>
          </div>
          ) : (
          <div className="max-w-3xl mx-auto flex justify-end items-center gap-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              disabled={saving}
              onClick={() => goStep('items')}
              className="mr-auto inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg shadow-2xs cursor-pointer transition-colors"
            >
              <ArrowLeft size={16} /> {t('inv.back', 'Back')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleDone}
              className="px-8 py-2.5 text-base font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-gray-950 rounded-lg shadow-md cursor-pointer transition-colors flex items-center gap-2"
            >
              {saving ? t('action.saving', 'Saving...') : t('action.done', 'Done')}
            </button>
          </div>
          )}
        </div>
      </form>
      <MatrixGridModal
        matrixId={grid?.matrixId}
        priceField={level.field}
        priceOf={(v) => priceOf(v, grid?.matrixId).rate}
        onClose={() => setGrid(null)}
        onAdd={addFromGrid}
        allowOversell={allowOversell}
      />
      <SavedInvoiceModal saved={saved} money={money} onNext={startNext} />
      <ScanProblemModal problem={scanProblem} onClose={() => setScanProblem(null)} canCreate={can('products', 'create')} onCreated={addCreatedProduct} />
    </div>
  );
}
