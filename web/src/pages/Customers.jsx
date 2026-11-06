import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { Check, CreditCard, Download, Eye, FileSpreadsheet, Info, SquarePen, Trash2, Upload } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney } from '../auth.jsx';
import {
  Avatar, CancelButton, ConfirmModal, Field, ListToolbar, Modal, PageHeader, Pagination, Row, SubmitButton, Table, TableState, Toggle, inputCls,
} from '../components/ui.jsx';
import { useList } from '../components/useList.js';
import { fileToCsv, downloadCustomersTemplate } from '../spreadsheet.js';

export const PRICE_LEVELS = [
  { value: 'selling', label: 'Selling Price' },
  { value: 'top_customer', label: 'Top Customer Price' },
  { value: 'jobber', label: 'Jobber Price' },
];
const levelLabel = (v) => PRICE_LEVELS.find((l) => l.value === v)?.label || v;
const EMPTY = { name: '', company: '', email: '', phone: '', address: '', taxNumber: '', priceLevel: 'selling', notes: '', status: true };
const round2 = (n) => Math.round(n * 100) / 100;
const btnCls =
  'border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 px-2 py-1 rounded-md shadow-sm cursor-pointer flex items-center gap-2 text-sm';

export function UpdateBalanceModal({ isOpen, onClose, customer, onDone }) {
  const money = useMoney();
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!customer) return null;
  const balance = customer.totals?.balance || 0;
  const numAmount = Number(amount) || 0;
  const remainingAfter = Math.max(0, round2(balance - numAmount));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!numAmount || numAmount <= 0) {
      setError('Please enter an amount greater than 0');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/customers/${customer.id}/payments`, {
        amount: numAmount,
        paymentMethod,
        paymentDate,
        notes,
      });
      toast.success(`Payment of ${money(numAmount)} recorded successfully!`);
      setAmount('');
      setNotes('');
      onDone();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update balance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Update Balance · ${customer.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Customer Balance Summary */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold text-gray-900">{customer.name}</p>
              {customer.company && <p className="text-xs text-gray-500">{customer.company}</p>}
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-gray-500 block">Pending Balance</span>
              <span className={`text-lg font-bold ${balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {money(balance)}
              </span>
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 pt-2 border-t border-gray-200">
            <span>Invoices Total: <strong>{money(customer.totals?.total || 0)}</strong></span>
            <span>Total Paid: <strong className="text-emerald-700">{money(customer.totals?.paid || 0)}</strong></span>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-red-600 bg-red-50 p-2.5 rounded border border-red-200">{error}</p>}

        <Field label="Amount Received" required error={error ? '' : undefined}>
          <div className="space-y-1.5">
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                placeholder="0.00"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(''); }}
                className={`${inputCls} pr-28 text-base font-semibold text-gray-900`}
              />
              {balance > 0 && (
                <button
                  type="button"
                  onClick={() => { setAmount(String(balance)); setError(''); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded cursor-pointer transition-colors"
                >
                  Pay Full ({money(balance)})
                </button>
              )}
            </div>
            {numAmount > 0 && balance > 0 && (
              <p className="text-xs text-gray-600">
                New pending balance after payment:{' '}
                <strong className={remainingAfter > 0 ? 'text-red-600' : 'text-emerald-600'}>
                  {money(remainingAfter)}
                </strong>
                {numAmount > balance && (
                  <span className="text-purple-600 ml-1">
                    (excess: {money(round2(numAmount - balance))})
                  </span>
                )}
              </p>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Payment Method">
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className={`${inputCls} bg-white h-[42px]`}
            >
              <option value="cash">Cash</option>
              <option value="card">Credit / Debit Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </Field>
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

        <Field label="Notes / Reference">
          <input
            type="text"
            maxLength={500}
            placeholder="Receipt #, cheque number, or notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
          />
        </Field>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 text-xs text-blue-800 flex items-start gap-2">
          <Info size={15} className="text-blue-600 shrink-0 mt-0.5" />
          <span>
            Payment will automatically be applied to clear older unpaid bills first (FIFO) and deduct from the customer's pending amount.
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <CancelButton onClick={onClose} />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-gray-950 rounded-md shadow-sm cursor-pointer disabled:opacity-70 transition-colors flex items-center gap-1.5"
          >
            {saving ? 'Processing...' : 'Deduct from Balance'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CustomerImportModal({ isOpen, onClose, onDone }) {
  const { can } = useAuth();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [csv, setCsv] = useState('');
  const [mode, setMode] = useState('skip');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null); setCsv(''); setPreview(null); setMode('skip');
    if (fileRef.current) fileRef.current.value = '';
  };
  const close = () => (reset(), onClose());

  const run = async (text, m, dryRun) => {
    const blob = new Blob([text], { type: 'text/csv' });
    return api.send('POST', `/customers/import?mode=${m}${dryRun ? '&dryRun=1' : ''}`, blob);
  };

  const check = async (f, m = mode) => {
    setBusy(true);
    setPreview(null);
    try {
      const text = f === file && csv ? csv : await fileToCsv(f);
      setCsv(text);
      setPreview((await run(text, m, true)).data);
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
      onDone();
      close();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const willWrite = preview ? preview.created + preview.updated : 0;
  return (
    <Modal isOpen={isOpen} onClose={close} title="Import Customers" size="3xl">
      <div className="space-y-4 text-sm text-gray-700">
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-md space-y-1">
          <p>
            Upload a <b>CSV</b> or <b>Excel (.xlsx)</b> file. The first row must be column headings. Recognised columns:{' '}
            <b>Name</b> (required, or First Name + Last Name), Company, Email, Phone, Address, Tax Number, Price Level (Selling / Top Customer / Jobber), Notes, Status.
          </p>
          <p>Existing customers are matched by email (or by name + phone when there is no email). Up to 5,000 rows per file.</p>
          <button type="button" onClick={downloadCustomersTemplate} className="text-purple-600 hover:underline cursor-pointer inline-flex items-center gap-1 font-medium mt-1">
            <Download size={14} /> Download template (.csv)
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
          <legend className="font-medium text-gray-600 mb-1">If the customer already exists</legend>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="imp-mode" checked={mode === 'skip'} onChange={() => (setMode('skip'), file && check(file, 'skip'))} />
            Skip it (keep the existing customer unchanged)
          </label>
          <label className={`flex items-center gap-2 ${can('customers', 'edit') ? 'cursor-pointer' : 'opacity-50'}`}>
            <input
              type="radio"
              name="imp-mode"
              disabled={!can('customers', 'edit')}
              checked={mode === 'update'}
              onChange={() => (setMode('update'), file && check(file, 'update'))}
            />
            Update it with the file's values (blank cells keep the current value)
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
                <div key={l} className="border border-gray-200 rounded-md p-2 text-center">
                  <p className={`text-xl font-bold ${c}`}>{n}</p>
                  <p className="text-xs text-gray-500">{l}</p>
                </div>
              ))}
            </div>
            {preview.ignoredColumns.length > 0 && (
              <p className="text-xs text-amber-700">Ignored columns (not recognised): {preview.ignoredColumns.join(', ')}</p>
            )}
            {preview.preview.length > 0 && (
              <div className="overflow-x-auto border border-gray-200 rounded-md">
                <p className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-50">First rows as they will be saved</p>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>{['Name', 'Company', 'Email', 'Phone', 'Price Level'].map((h) => <th key={h} className="text-left px-2 py-1">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((c, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1">{c.name}</td><td className="px-2 py-1">{c.company}</td><td className="px-2 py-1">{c.email}</td>
                        <td className="px-2 py-1">{c.phone}</td><td className="px-2 py-1">{levelLabel(c.priceLevel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.errors.length > 0 && (
              <div className="border border-red-200 rounded-md max-h-48 overflow-y-auto">
                <p className="px-2 py-1 text-xs font-semibold text-red-700 bg-red-50">
                  These rows will be skipped{preview.failed > preview.errors.length ? ` (first ${preview.errors.length} of ${preview.failed} shown)` : ''}
                </p>
                <table className="w-full text-xs">
                  <tbody>
                    {preview.errors.map((e) => (
                      <tr key={e.row} className="border-t border-red-100">
                        <td className="px-2 py-1 whitespace-nowrap text-gray-500">Row {e.row}</td>
                        <td className="px-2 py-1">{e.name || '—'}</td>
                        <td className="px-2 py-1 text-red-700">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <CancelButton onClick={close} />
          <SubmitButton type="button" mode="create" isLoading={busy && Boolean(preview)} isDisabled={!preview || !willWrite || busy} onClick={confirm} icon={<Upload size={14} />}>
            {preview ? `Import ${willWrite} customer${willWrite === 1 ? '' : 's'}` : 'Import'}
          </SubmitButton>
        </div>
      </div>
    </Modal>
  );
}

export default function Customers() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const money = useMoney();
  const list = useList('/customers', 'customers');
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [payingCustomer, setPayingCustomer] = useState(null);

  const actions = [
    { label: 'Update Balance', icon: <CreditCard size={14} />, onClick: (c) => setPayingCustomer(c) },
    can('invoices', 'view') && { label: 'View Invoices', icon: <Eye size={14} />, onClick: (c) => navigate(`/admin/customers/${c.id}`) },
    can('customers', 'edit') && { label: 'Edit', icon: <SquarePen size={14} />, onClick: (c) => (setErrors({}), setEditing({ ...EMPTY, ...c })) },
    can('customers', 'delete') && { label: 'Delete', icon: <Trash2 size={14} />, onClick: setToDelete },
  ].filter(Boolean);
  const headers = ['#', 'Customer', 'Contact', 'Price Level', 'Invoices Total', 'Paid', 'Owed', 'Update Balance', 'Status'];
  if (actions.length) headers.push('Actions');
  const set = (k) => (e) => setEditing((c) => ({ ...c, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { id, createdAt, totals, ...body } = editing;
      if (id) await api.put(`/customers/${id}`, body);
      else await api.post('/customers', body);
      toast.success(id ? 'Customer updated successfully' : 'Customer added successfully');
      setEditing(null);
      list.reload();
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c, status) => {
    try {
      await api.patch(`/customers/${c.id}/status`, { status });
      toast.success('Customer status updated successfully');
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/customers/${toDelete.id}`);
      toast.success('Customer deleted successfully');
      setToDelete(null);
      list.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Customers" actionLabel={can('customers', 'create') && 'New Customer'} onAction={() => (setErrors({}), setEditing({ ...EMPTY }))}>
        <a href="/api/customers/export" className={btnCls}>
          <FileSpreadsheet size={14} /> Export
        </a>
        {can('customers', 'create') && (
          <button type="button" onClick={() => setImporting(true)} className={btnCls}>
            <Upload size={14} /> Import
          </button>
        )}
      </PageHeader>
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search by name, company, email or phone..." limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((c, i) => (
            <Row
              key={c.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={c}
              columns={[
                <Link to={`/admin/customers/${c.id}`} className="hover:underline">
                  <Avatar name={c.name} sub={c.company} />
                </Link>,
                <span className="block">
                  {c.email && <span className="block">{c.email}</span>}
                  {c.phone && <span className="block text-xs">{c.phone}</span>}
                  {!c.email && !c.phone && '-'}
                </span>,
                levelLabel(c.priceLevel),
                <span className="text-gray-950">
                  {money(c.totals?.total || 0)}
                  <span className="block text-xs text-gray-500">{c.totals?.invoiceCount || 0} invoices</span>
                </span>,
                <span className="text-emerald-700">{money(c.totals?.paid || 0)}</span>,
                <span className={c.totals?.balance > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}>{money(c.totals?.balance || 0)}</span>,
                <div>
                  {c.totals?.balance > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPayingCustomer(c)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-purple-600 hover:bg-gray-950 text-white shadow-sm cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <CreditCard size={13} /> Update Balance
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPayingCustomer(c)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <Check size={12} className="text-emerald-600" /> Settled
                    </button>
                  )}
                </div>,
                <Toggle name={`cust-${c.id}`} checked={c.status} onChange={(v) => toggle(c, v)} disabled={!can('customers', 'edit')} />,
              ]}
              actions={actions}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No customers found." />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit Customer' : 'Add Customer'}>
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Customer Name" required htmlFor="c-name" error={errors.name}>
                <input id="c-name" autoFocus required maxLength={200} value={editing.name} onChange={set('name')} className={inputCls} />
              </Field>
              <Field label="Company" htmlFor="c-company" error={errors.company}>
                <input id="c-company" maxLength={200} value={editing.company} onChange={set('company')} className={inputCls} />
              </Field>
              <Field label="Email" htmlFor="c-email" error={errors.email}>
                <input id="c-email" type="email" maxLength={200} value={editing.email} onChange={set('email')} className={inputCls} autoComplete="off" />
              </Field>
              <Field label="Phone" htmlFor="c-phone" error={errors.phone}>
                <input id="c-phone" maxLength={30} value={editing.phone} onChange={set('phone')} className={inputCls} />
              </Field>
              <Field label="Tax Number (TRN / VAT)" htmlFor="c-tax" error={errors.taxNumber}>
                <input id="c-tax" maxLength={50} value={editing.taxNumber} onChange={set('taxNumber')} className={inputCls} />
              </Field>
              <Field label="Default Price Level" htmlFor="c-level" error={errors.priceLevel}>
                <select id="c-level" value={editing.priceLevel} onChange={set('priceLevel')} className={`${inputCls} bg-white h-[42px]`}>
                  {PRICE_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Address" htmlFor="c-address" error={errors.address}>
                  <textarea id="c-address" rows={2} maxLength={1000} value={editing.address} onChange={set('address')} className={inputCls} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Notes" htmlFor="c-notes" error={errors.notes}>
                  <textarea id="c-notes" rows={2} maxLength={5000} value={editing.notes} onChange={set('notes')} className={inputCls} />
                </Field>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600">Status</span>
              <Toggle name="c-status" checked={editing.status} onChange={(v) => setEditing((c) => ({ ...c, status: v }))} />
            </div>
            <div className="flex justify-end gap-2">
              <CancelButton onClick={() => setEditing(null)} />
              <SubmitButton isLoading={saving} mode={editing.id ? 'edit' : 'create'} />
            </div>
          </form>
        )}
      </Modal>
      <CustomerImportModal isOpen={importing} onClose={() => setImporting(false)} onDone={list.reload} />
      <UpdateBalanceModal
        isOpen={Boolean(payingCustomer)}
        customer={payingCustomer}
        onClose={() => setPayingCustomer(null)}
        onDone={list.reload}
      />
      <ConfirmModal
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        message="Are you sure you want to delete this customer?"
        isDeleting={deleting}
      />
    </div>
  );
}
