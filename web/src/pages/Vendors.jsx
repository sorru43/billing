import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { PackagePlus, ReceiptText, SquarePen, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney } from '../auth.jsx';
import {
  Avatar, CancelButton, ConfirmModal, Field, ListToolbar, Modal, PageHeader, Pagination, Row, SubmitButton, Table, TableState, Toggle, inputCls,
} from '../components/ui.jsx';
import { useList } from '../components/useList.js';

const EMPTY = { name: '', company: '', email: '', phone: '', address: '', notes: '', status: true };

export default function Vendors() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const money = useMoney();
  const list = useList('/vendors', 'vendors');
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const actions = [
    { label: 'Receivings', icon: <ReceiptText size={14} />, onClick: (v) => navigate(`/admin/receiving?vendorId=${v.id}`) },
    can('receiving', 'create') && { label: 'Receive Stock', icon: <PackagePlus size={14} />, onClick: (v) => navigate(`/admin/receiving/new?vendorId=${v.id}`) },
    can('receiving', 'edit') && { label: 'Edit', icon: <SquarePen size={14} />, onClick: (v) => (setErrors({}), setEditing({ ...EMPTY, ...v })) },
    can('receiving', 'delete') && { label: 'Delete', icon: <Trash2 size={14} />, onClick: setToDelete },
  ].filter(Boolean);
  const headers = ['#', 'Vendor', 'Contact', 'Total Received', 'Owed to Vendor', 'Status', 'Actions'];
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
                <span className="text-gray-950">{money(v.totals?.bought || 0)}</span>,
                <span className={v.totals?.owed > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}>{money(v.totals?.owed || 0)}</span>,
                <Toggle name={`vend-${v.id}`} checked={v.status} onChange={(s) => toggle(v, s)} disabled={!can('receiving', 'edit')} />,
              ]}
              actions={actions}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No vendors yet." />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />

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
