import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Send } from 'lucide-react';
import { api } from '../api.js';
import { CancelButton, Field, Modal, SubmitButton, inputCls } from './ui.jsx';

// Email one purchase order (PDF attached) to its vendor. `po` needs id, poNumber, vendorName, vendorEmail.
export default function EmailPoModal({ po, onClose, onSent }) {
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => setTo(po?.vendorEmail || ''), [po]);

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const r = await api.post(`/purchase-orders/${po.id}/email`, { to });
      toast.success(r.message);
      onSent?.(po, r.data);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={Boolean(po)} onClose={onClose} title={`Email ${po?.poNumber || 'Purchase Order'} to ${po?.vendorName || 'vendor'}`} size="md">
      <form onSubmit={send} className="space-y-4">
        <Field label="Send To" required htmlFor="po-email-to">
          <input id="po-email-to" type="email" required value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
        <p className="text-xs text-gray-500">The purchase order PDF is attached. Saving an email on the vendor fills this in next time.</p>
        <div className="flex justify-end gap-2">
          <CancelButton onClick={onClose} />
          <SubmitButton isLoading={sending} icon={<Send size={16} />}>{sending ? 'Sending...' : 'Send Email'}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
