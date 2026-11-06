import { useState } from 'react';
import { toast } from 'react-toastify';
import { Banknote, Building2, CheckSquare, CreditCard, HelpCircle } from 'lucide-react';
import { api } from '../api.js';
import { useMoney } from '../auth.jsx';
import { CancelButton, Field, Modal, inputCls } from './ui.jsx';

const round2 = (n) => Math.round(n * 100) / 100;

export default function MarkPaidModal({ isOpen, onClose, invoice, onDone }) {
  const money = useMoney();
  const total = Number(invoice?.total) || 0;
  const currentPaid = Number(invoice?.paidAmount) || 0;
  const remaining = Math.max(0, round2(total - currentPaid));

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amount, setAmount] = useState(String(remaining > 0 ? remaining : total));
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!invoice) return null;

  const numAmount = Number(amount) || 0;
  const balanceAfter = Math.max(0, round2(remaining - numAmount));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a payment amount greater than 0');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/invoices/${invoice.id}/status`, {
        status: 'paid',
        amount: numAmount,
        paymentMethod,
        reference,
        paymentDate,
        notes,
      });
      toast.success(`Invoice ${invoice.invoiceNumber} payment of ${money(numAmount)} confirmed!`);
      if (onDone) onDone();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update invoice status');
    } finally {
      setSaving(false);
    }
  };

  const getRefLabel = () => {
    switch (paymentMethod) {
      case 'cheque':
        return 'Cheque Number';
      case 'bank':
        return 'Bank / Transfer Reference';
      case 'card':
        return 'Card / Transaction Ref';
      case 'other':
        return 'Description / Reference';
      default:
        return 'Reference (optional)';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Mark Invoice as Paid · ${invoice.invoiceNumber}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Invoice Summary Card */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold text-gray-900">{invoice.customerName}</p>
              <p className="text-xs text-gray-500">Invoice: {invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-gray-500 block">Balance Due</span>
              <span className="text-lg font-bold text-red-600">{money(remaining)}</span>
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 pt-2 border-t border-gray-200">
            <span>Invoice Total: <strong>{money(total)}</strong></span>
            <span>Already Paid: <strong className="text-emerald-700">{money(currentPaid)}</strong></span>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-red-600 bg-red-50 p-2.5 rounded border border-red-200">{error}</p>}

        {/* Payment Method Selector: Cash, Cheque, Bank, Credit / Debit, Others */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">Payment Method</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: 'cash', label: 'Cash', icon: <Banknote size={16} className="text-emerald-600" /> },
              { id: 'cheque', label: 'Cheque', icon: <CheckSquare size={16} className="text-blue-600" /> },
              { id: 'bank', label: 'Bank', icon: <Building2 size={16} className="text-indigo-600" /> },
              { id: 'card', label: 'Credit / Debit', icon: <CreditCard size={16} className="text-violet-600" /> },
              { id: 'other', label: 'Others', icon: <HelpCircle size={16} className="text-gray-600" /> },
            ].map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => setPaymentMethod(m.id)}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                  paymentMethod === m.id
                    ? 'border-purple-600 bg-purple-50 text-purple-900 ring-2 ring-purple-600/20'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {m.icon}
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Amount Input */}
        <Field label="Amount Paid" required>
          <div className="space-y-1.5">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${inputCls} pl-8 pr-28 text-base font-semibold text-gray-900`}
              />
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(remaining))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded cursor-pointer transition-colors"
                >
                  Full ({money(remaining)})
                </button>
              )}
            </div>
            {numAmount > 0 && (
              <p className="text-xs text-gray-600">
                Remaining due after this payment:{' '}
                <strong className={balanceAfter > 0 ? 'text-red-600' : 'text-emerald-600'}>
                  {money(balanceAfter)}
                </strong>
                {balanceAfter === 0 && <span className="text-emerald-600 font-semibold ml-1">· Paid in Full</span>}
              </p>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {paymentMethod !== 'cash' && (
            <Field label={getRefLabel()}>
              <input
                type="text"
                placeholder={
                  paymentMethod === 'cheque'
                    ? 'e.g. Cheque #1049'
                    : paymentMethod === 'bank'
                    ? 'e.g. Wire / Transfer Ref'
                    : paymentMethod === 'card'
                    ? 'e.g. Auth Code / Last 4'
                    : 'Description / Reference'
                }
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={inputCls}
              />
            </Field>
          )}
          <Field label="Payment Date">
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <input
            type="text"
            placeholder="Additional notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
          />
        </Field>

        {/* Footer Actions with confirmation */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <CancelButton onClick={onClose} />
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow cursor-pointer disabled:opacity-70 transition-colors flex items-center gap-1.5"
          >
            {saving ? 'Processing...' : 'Confirm & Mark Paid'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
