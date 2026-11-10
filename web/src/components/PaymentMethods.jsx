import { Banknote, CreditCard, FileCheck, Landmark, Layers, Smartphone } from 'lucide-react';

// Payment method picker: big click buttons (same style as Pay Vendor), not a dropdown.
export const CUSTOMER_METHODS = [
  { id: 'cash', label: 'Cash', icon: <Banknote size={16} />, ref: '' },
  { id: 'check', label: 'Check', icon: <FileCheck size={16} />, ref: 'Check Number', ph: 'e.g. 1049' },
  { id: 'zelle', label: 'Zelle', icon: <Smartphone size={16} />, ref: 'Zelle Confirmation #', ph: 'e.g. ZL-55210' },
  { id: 'bank_transfer', label: 'Bank / Wire', icon: <Landmark size={16} />, ref: 'Bank / Wire Reference', ph: 'e.g. WIRE-884920' },
  { id: 'card', label: 'Credit / Debit', icon: <CreditCard size={16} />, ref: 'Card Auth / Last 4', ph: 'e.g. Auth #8832' },
  { id: 'other', label: 'Other', icon: <Layers size={16} />, ref: 'Description', ph: 'What was it paid with?' },
];

export const VENDOR_METHODS = [
  { id: 'check', label: 'Check', icon: <FileCheck size={16} />, ref: 'Check Number', ph: 'e.g. CHK-100452' },
  { id: 'cash', label: 'Cash', icon: <Banknote size={16} />, ref: 'Reference / Memo', ph: 'e.g. Counter cash' },
  { id: 'zelle', label: 'Zelle', icon: <Smartphone size={16} />, ref: 'Zelle Confirmation #', ph: 'e.g. ZL-55210' },
  { id: 'wire', label: 'Wire Transfer', icon: <Landmark size={16} />, ref: 'Wire Transfer / Bank Ref #', ph: 'e.g. WIRE-884920' },
  { id: 'card', label: 'Credit / Debit', icon: <CreditCard size={16} />, ref: 'Card Auth / Ref #', ph: 'e.g. Auth #8832' },
  { id: 'other', label: 'Other', icon: <Layers size={16} />, ref: 'Reference / Memo', ph: 'e.g. Store credit' },
];

export function MethodButtons({ methods, value, onChange }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5" role="radiogroup" aria-label="Payment method">
      {methods.map((m) => (
        <button
          type="button"
          key={m.id}
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
            value === m.id
              ? 'border-purple-600 bg-purple-50 text-purple-700 ring-1 ring-purple-600 font-semibold'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <span className="mb-1">{m.icon}</span>
          <span className="text-[11px] leading-tight text-center">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

// Toast text after a payment: which bills it cleared and what went to credit.
export function paymentSummary(data, money) {
  const parts = (data?.clearedInvoices || data?.clearedReceivings || []).map(
    (c) => `${c.invoiceNumber || c.receivingNumber} ${c.status === 'paid' ? 'paid' : `−${money(c.applied)}`}`,
  );
  if (data?.creditAdded > 0) parts.push(`${money(data.creditAdded)} kept as credit for the next bill`);
  return parts.join(' · ');
}
