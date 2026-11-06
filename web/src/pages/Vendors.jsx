import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { DollarSign, PackagePlus, ReceiptText, SquarePen, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney } from '../auth.jsx';
import {
  Avatar, CancelButton, ConfirmModal, Field, ListToolbar, Modal, PageHeader, Pagination, Row, SubmitButton, Table, TableState, Toggle, inputCls,
} from '../components/ui.jsx';
import { useList } from '../components/useList.js';
import PayVendorModal from '../components/PayVendorModal.jsx';

const EMPTY = { name: '', company: '', email: '', phone: '', address: '', notes: '', status: true };

export default function Vendors() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const money = useMoney();
  const list = useList('/vendors', 'vendors');
  const [editing, setEditing] = useState(null);
  const [payingVendor, setPayingVendor] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const actions = [
    { label: 'Pay Vendor', icon: <DollarSign size={14} />, onClick: (v) => setPayingVendor(v) },
    { label: 'Receivings', icon: <ReceiptText size={14} />, onClick: (v) => navigate(`/admin/receiving?vendorId=${v.id}`) },
    can('receiving', 'create') && { label: 'Receive Stock', icon: <PackagePlus size={14} />, onClick: (v) => navigate(`/admin/receiving/new?vendorId=${v.id}`) },
    can('receiving', 'edit') && { label: 'Edit', icon: <SquarePen size={14} />, onClick: (v) => (setErrors({}), setEditing({ ...EMPTY, ...v })) },
    can('receiving', 'delete') && { label: 'Delete', icon: <Trash2 size={14} />, onClick: setToDelete },
  ].filter(Boolean);
  const headers = ['#', 'Vendor', 'Contact', 'Total Received', 'Total Paid', 'Owed to Vendor', 'Update Balance', 'Status', 'Actions'];
  const set = (k) => (e) => setEditing((v) => ({ ...v, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { id, createdAt, totals, ...body } = editing;
      if (id) await api.put(`/vendors/${id}`, body);
      else await api.post('/vendors', body);
      toast.success(id ? 'Vendor updated' : 'Vendor added');
      setEditing(null);
      list.reload();
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (v, status) => {
    try {
      const { id, createdAt, totals, ...body } = v;
      await api.put(`/vendors/${id}`, { ...body, status });
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/vendors/${toDelete.id}`);
      toast.success('Vendor deleted');
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
      <PageHeader title="Vendors" actionLabel={can('receiving', 'create') && 'New Vendor'} onAction={() => (setErrors({}), setEditing({ ...EMPTY }))} />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search by name, company, email or phone..." limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((v, i) => (
            <Row
              key={v.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={v}
              columns={[
                <Avatar name={v.name} sub={v.company} />,
                <span className="block">
                  {v.email && <span className="block">{v.email}</span>}
                  {v.phone && <span className="block text-xs">{v.phone}</span>}
                  {!v.email && !v.phone && '-'}
                </span>,
                <span className="text-gray-950 font-medium">{money(v.totals?.bought || 0)}</span>,
                <span className="text-emerald-600 font-semibold">{money(v.totals?.paid || 0)}</span>,
                <span className={v.totals?.owed > 0 ? 'text-red-600 font-bold' : 'text-gray-500'}>{money(v.totals?.owed || 0)}</span>,
                <button
                  type="button"
                  onClick={() => setPayingVendor(v)}
                  disabled={!v.totals?.owed || v.totals.owed <= 0}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    v.totals?.owed > 0
                      ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:border-purple-300 shadow-2xs'
                      : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                  }`}
                  title={v.totals?.owed > 0 ? 'Pay vendor portion via check, cash, or wire' : 'No balance owed'}
                >
                  Update Balance
                </button>,
                <Toggle name={`vend-${v.id}`} checked={v.status} onChange={(s) => toggle(v, s)} disabled={!can('receiving', 'edit')} />,
              ]}
              actions={actions}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No vendors yet." />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />

      <PayVendorModal
        isOpen={Boolean(payingVendor)}
        vendor={payingVendor}
        onClose={() => setPayingVendor(null)}
        onDone={list.reload}
      />

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit Vendor' : 'Add Vendor'}>
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Vendor Name" required htmlFor="v-name" error={errors.name}>
                <input id="v-name" autoFocus required maxLength={200} value={editing.name} onChange={set('name')} className={inputCls} />
              </Field>
              <Field label="Company" htmlFor="v-company" error={errors.company}>
                <input id="v-company" maxLength={200} value={editing.company} onChange={set('company')} className={inputCls} />
              </Field>
              <Field label="Email" htmlFor="v-email" error={errors.email}>
                <input id="v-email" type="email" maxLength={200} value={editing.email} onChange={set('email')} className={inputCls} autoComplete="off" />
              </Field>
              <Field label="Phone" htmlFor="v-phone" error={errors.phone}>
                <input id="v-phone" maxLength={30} value={editing.phone} onChange={set('phone')} className={inputCls} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Address" htmlFor="v-address" error={errors.address}>
                  <textarea id="v-address" rows={2} maxLength={1000} value={editing.address} onChange={set('address')} className={inputCls} />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Notes" htmlFor="v-notes" error={errors.notes}>
                  <textarea id="v-notes" rows={2} maxLength={5000} value={editing.notes} onChange={set('notes')} className={inputCls} />
                </Field>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <CancelButton onClick={() => setEditing(null)} />
              <SubmitButton isLoading={saving} mode={editing.id ? 'edit' : 'create'} />
            </div>
          </form>
        )}
      </Modal>
      <ConfirmModal
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        message="Delete this vendor? Past receivings keep the vendor's name."
        isDeleting={deleting}
      />
    </div>
  );
}
