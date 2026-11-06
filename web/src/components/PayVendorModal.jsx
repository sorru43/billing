import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Landmark, FileCheck, Banknote, CreditCard, Layers, DollarSign, Calendar, FileText } from 'lucide-react';
import { api } from '../api.js';
import { useMoney } from '../auth.jsx';

const METHODS = [
  { id: 'check', label: 'Check', icon: <FileCheck size={16} /> },
  { id: 'cash', label: 'Cash', icon: <Banknote size={16} /> },
  { id: 'wire', label: 'Wire Transfer', icon: <Landmark size={16} /> },
  { id: 'card', label: 'Credit / Debit', icon: <CreditCard size={16} /> },
  { id: 'other', label: 'Other', icon: <Layers size={16} /> },
];

export default function PayVendorModal({ isOpen, vendor, receiving, onClose, onDone }) {
  const money = useMoney();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('check');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [loading, setLoading] = useState(false);

  const totalOwed = receiving
    ? Math.max(0, Number(receiving.balance ?? (Number(receiving.total) - Number(receiving.paidAmount || 0))))
    : Math.max(0, Number(vendor?.totals?.owed || 0));

  const totalReceived = receiving ? Number(receiving.total) : Number(vendor?.totals?.bought || 0);
  const alreadyPaid = receiving ? Number(receiving.paidAmount || 0) : Number(vendor?.totals?.paid || 0);

  useEffect(() => {
    if (isOpen) {
      setAmount(totalOwed > 0 ? String(totalOwed) : '');
      setMethod('check');
      setReference('');
      setNotes('');
      setPaymentDate(new Date().toISOString().slice(0, 10));
    }
  }, [isOpen, vendor, receiving, totalOwed]);

  if (!isOpen || (!vendor && !receiving)) return null;

  const numAmount = parseFloat(amount) || 0;
  const remainingAfter = Math.max(0, Math.round((totalOwed - numAmount) * 100) / 100);

  const getRefLabel = () => {
    if (method === 'check') return 'Check Number';
    if (method === 'wire') return 'Wire Transfer / Bank Ref #';
    if (method === 'card') return 'Card Auth / Ref #';
    return 'Reference / Memo';
  };

  const getRefPlaceholder = () => {
    if (method === 'check') return 'e.g. CHK-100452';
    if (method === 'wire') return 'e.g. WIRE-884920';
    if (method === 'card') return 'e.g. Auth #8832';
    return 'e.g. Counter cash / transfer';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (numAmount <= 0) {
      toast.error('Please enter a payment portion greater than 0');
      return;
    }
    setLoading(true);
    try {
      if (receiving) {
        // Individual receiving invoice payment
        await api.patch(`/receivings/${receiving.id}/status`, {
          status: numAmount >= totalOwed ? 'paid' : 'partial',
          amount: numAmount,
          paymentMethod: method,
          reference,
          notes,
          paymentDate,
        });
        toast.success(`Payment of ${money(numAmount)} recorded via ${method.toUpperCase()}`);
      } else {
        // Vendor overall balance payment (FIFO across open receivings)
        await api.post(`/vendors/${vendor.id}/payments`, {
          amount: numAmount,
          paymentMethod: method,
          reference,
          notes,
          paymentDate,
        });
        toast.success(`Vendor payment of ${money(numAmount)} recorded via ${method.toUpperCase()}`);
      }
      onClose();
      if (onDone) onDone();
    } catch (err) {
      toast.error(err.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <DollarSign size={20} className="text-purple-600" />
              {receiving ? `Pay Receiving ${receiving.receivingNumber}` : `Pay Vendor: ${vendor?.name}`}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {receiving ? `Vendor: ${receiving.vendorName}` : vendor?.company ? `Company: ${vendor.company}` : 'Vendor Settlement'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Vendor Financial Summary Banner */}
        <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200 text-center">
          <div>
            <p className="text-[11px] font-semibold uppercase text-gray-500">Total Received</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{money(totalReceived)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-emerald-600">Total Paid</p>
            <p className="text-sm font-bold text-emerald-600 mt-0.5">{money(alreadyPaid)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-rose-600">Current Owed</p>
            <p className="text-sm font-bold text-rose-600 mt-0.5">{money(totalOwed)}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Payment Method</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {METHODS.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    method === m.id
                      ? 'border-purple-600 bg-purple-50 text-purple-700 ring-1 ring-purple-600 font-semibold'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="mb-1">{m.icon}</span>
                  <span className="text-[11px] leading-tight text-center">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount / Portion to Pay */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-gray-700">Portion / Amount to Pay ($)</label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAmount(String(totalOwed))}
                  className="text-[11px] text-purple-600 hover:underline font-semibold cursor-pointer"
                >
                  Pay Full ({money(totalOwed)})
                </button>
                {totalOwed > 0 && (
                  <>
                    <span className="text-gray-300">·</span>
                    <button
                      type="button"
                      onClick={() => setAmount(String(Math.round((totalOwed / 2) * 100) / 100))}
                      className="text-[11px] text-gray-500 hover:text-purple-600 cursor-pointer"
                    >
                      50% ({money(totalOwed / 2)})
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={totalOwed > 0 ? totalOwed * 2 : 1e7}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-base font-bold pl-8 pr-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>
          </div>

          {/* Reference & Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{getRefLabel()}</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={getRefPlaceholder()}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <Calendar size={13} /> Payment Date
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <FileText size={13} /> Notes / Memo
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Partial check payment for shipment"
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
            />
          </div>

          {/* Live Remaining Balance Calculation */}
          <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex justify-between items-center text-xs">
            <span className="text-gray-600 font-medium">Remaining Balance After Payment:</span>
            <span className={`text-sm font-bold ${remainingAfter > 0 ? 'text-purple-900' : 'text-emerald-600'}`}>
              {money(remainingAfter)}
              {remainingAfter === 0 && ' (Settled)'}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || numAmount <= 0}
              className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-60"
            >
              {loading ? 'Processing...' : `Confirm Payment of ${money(numAmount)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
