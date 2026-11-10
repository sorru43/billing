import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Info } from 'lucide-react';
import { api } from '../api.js';
import { useMoney } from '../auth.jsx';
import { CancelButton, Field, Modal, inputCls } from './ui.jsx';
import { CUSTOMER_METHODS, MethodButtons, paymentSummary } from './PaymentMethods.jsx';

const round2 = (n) => Math.round(n * 100) / 100;

// Take a payment against one invoice. For a saved customer the screen also shows the
// customer's TOTAL owed: anything over this invoice pays their older invoices, and anything
// over everything they owe is kept as credit for their next invoice (nothing is lost).
export default function MarkPaidModal({ isOpen, onClose, invoice, onDone }) {
  const money = useMoney();
  const total = Number(invoice?.total) || 0;
  const currentPaid = Number(invoice?.paidAmount) || 0;
  const remaining = Math.max(0, round2(total - currentPaid));
  const customerId = invoice?.customerId || null;

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [owed, setOwed] = useState(null); // customer's total owed across all invoices

  useEffect(() => {
    if (!isOpen || !invoice) return;
    setAmount(String(remaining));
    setPaymentMethod('cash');
    setReference('');
    setNotes('');
    setError('');
    setOwed(null);
    if (customerId) {
      api.get(`/customers/${customerId}/balance`).then((r) => setOwed(r.data.totals)).catch(() => setOwed(null));
    }
  }, [isOpen, invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!invoice) return null;

  const numAmount = Number(amount) || 0;
  const customerOwed = owed ? round2(owed.balance) : null;
  const balanceAfter = Math.max(0, round2(remaining - numAmount));
  const overInvoice = Math.max(0, round2(numAmount - remaining));
  const owedAfter = customerOwed != null ? Math.max(0, round2(customerOwed - numAmount)) : null;
  const toCredit = customerOwed != null ? Math.max(0, round2(numAmount - customerOwed)) : 0;
  const method = CUSTOMER_METHODS.find((m) => m.id === paymentMethod);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a payment amount greater than 0');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.patch(`/invoices/${invoice.id}/status`, {
        status: 'paid',
        amount: numAmount,
        paymentMethod,
        reference,
        paymentDate,
        notes,
      });
      const summary = data ? paymentSummary(data, money) : '';
      toast.success(`Payment of ${money(numAmount)} recorded${summary ? `. ${summary}` : ''}`);
      onDone?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Receive Payment · ${invoice.invoiceNumber}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={`grid ${customerId ? 'grid-cols-3' : 'grid-cols-2'} gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200 text-center`}>
          <div>
            <p className="text-[11px] font-semibold uppercase text-gray-500">Invoice Total</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{money(total)}</p>
            <p className="text-[11px] text-emerald-700">paid {money(currentPaid)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-rose-600">This Invoice Due</p>
            <p className="text-sm font-bold text-rose-600 mt-0.5">{money(remaining)}</p>
          </div>
          {customerId && (
            <div>
              <p className="text-[11px] font-semibold uppercase text-rose-700">Customer Total Owed</p>
              <p className="text-lg font-bold text-rose-700 leading-tight">{customerOwed != null ? money(customerOwed) : '…'}</p>
              <p className="text-[11px] text-gray-500 truncate">{invoice.customerName}</p>
            </div>
          )}
        </div>

        {error && <p className="text-sm font-medium text-red-600 bg-red-50 p-2.5 rounded border border-red-200">{error}</p>}

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Payment Method</label>
          <MethodButtons methods={CUSTOMER_METHODS} value={paymentMethod} onChange={setPaymentMethod} />
        </div>

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
                className={`${inputCls} pl-8 text-base font-semibold text-gray-900`}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {remaining > 0 && (
                <button type="button" onClick={() => setAmount(String(remaining))} className="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded cursor-pointer">
                  This invoice ({money(remaining)})
                </button>
              )}
              {customerOwed != null && customerOwed > remaining && (
                <button type="button" onClick={() => setAmount(String(customerOwed))} className="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded cursor-pointer">
                  Everything owed ({money(customerOwed)})
                </button>
              )}
            </div>
            {numAmount > 0 && (
              <p className="text-xs text-gray-600">
                This invoice after payment:{' '}
                <strong className={balanceAfter > 0 ? 'text-red-600' : 'text-emerald-600'}>{money(balanceAfter)}</strong>
                {owedAfter != null && (
                  <>
                    {' '}· Customer total owed after:{' '}
                    <strong className={owedAfter > 0 ? 'text-red-600' : 'text-emerald-600'}>{money(owedAfter)}</strong>
                  </>
                )}
                {customerId && toCredit > 0 && (
                  <span className="block text-purple-700 font-semibold">{money(toCredit)} extra will be kept as credit for the next invoice.</span>
                )}
                {!customerId && overInvoice > 0 && (
                  <span className="block text-amber-700 font-semibold">
                    Only {money(remaining)} is recorded: this invoice isn't linked to a saved customer, so there is nowhere to keep the extra {money(overInvoice)}.
                  </span>
                )}
              </p>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {method?.ref ? (
            <Field label={method.ref}>
              <input type="text" maxLength={200} placeholder={method.ph} value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
            </Field>
          ) : <div className="hidden sm:block" />}
          <Field label="Payment Date">
            <input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <input type="text" maxLength={500} placeholder="Additional notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </Field>

        {customerId && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 text-xs text-blue-800 flex items-start gap-2">
            <Info size={15} className="text-blue-600 shrink-0 mt-0.5" />
            <span>Pays this invoice first, then the customer's oldest unpaid invoices. Anything left over is kept as credit.</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <CancelButton onClick={onClose} />
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow cursor-pointer disabled:opacity-70 transition-colors flex items-center gap-1.5"
          >
            {saving ? 'Processing...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
