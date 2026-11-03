import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Send } from 'lucide-react';
import { api } from '../api.js';
import { CancelButton, Field, Modal, SubmitButton, inputCls } from '../components/ui.jsx';

export default function EmailInvoiceModal({ invoice, onClose }) {
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => setTo(invoice?.customerEmail || ''), [invoice]);

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const r = await api.post(`/invoices/${invoice.id}/email`, { to });
      toast.success(r.message);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={Boolean(invoice)} onClose={onClose} title={`Email ${invoice?.invoiceNumber || 'Invoice'}`} size="md">
      <form onSubmit={send} className="space-y-4">
        <Field label="Send To" required htmlFor="email-to">
          <input id="email-to" type="email" required value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
        <p className="text-xs text-gray-500">The invoice PDF is attached to the email.</p>
        <div className="flex justify-end gap-2">
          <CancelButton onClick={onClose} />
          <SubmitButton isLoading={sending} icon={<Send size={16} />}>{sending ? 'Sending...' : 'Send Email'}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
