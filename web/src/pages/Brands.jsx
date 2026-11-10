import { useState } from 'react';
import { toast } from 'react-toastify';
import { SquarePen, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, formatDate } from '../auth.jsx';
import { CancelButton, ConfirmModal, Field, ListToolbar, Modal, PageHeader, Pagination, Row, SubmitButton, Table, TableState, Toggle, inputCls } from '../components/ui.jsx';
import { useList } from '../components/useList.js';

export default function Brands() {
  const { can } = useAuth();
  const list = useList('/brands', 'brands');
  const [editing, setEditing] = useState(null); // {} for new, row for edit
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const actions = [
    can('categories', 'edit') && { label: 'Edit', icon: <SquarePen size={14} />, onClick: (c) => (setErrors({}), setEditing(c)) },
    can('categories', 'delete') && {
      label: 'Delete',
      icon: <Trash2 size={14} />,
      onClick: (c) =>
        c.productCount
          ? toast.error(`This brand has ${c.productCount} product(s). Change their brand first.`)
          : setToDelete(c),
    },
  ].filter(Boolean);
  const headers = ['#', 'Brand Name', 'Products', 'Created On', 'Status'];
  if (actions.length) headers.push('Actions');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = { name: editing.name || '', status: editing.status ?? true };
      if (editing.id) await api.put(`/brands/${editing.id}`, body);
      else await api.post('/brands', body);
      toast.success(editing.id ? 'Brand updated successfully' : 'Brand added successfully');
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
      await api.put(`/brands/${c.id}`, { name: c.name, status });
      toast.success('Brand status updated successfully');
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/brands/${toDelete.id}`);
      toast.success('Brand deleted successfully');
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
      <PageHeader title="Brands" actionLabel={can('categories', 'create') && 'New Brand'} onAction={() => (setErrors({}), setEditing({ status: true }))} />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search by brand name..." limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((c, i) => (
            <Row
              key={c.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={c}
              columns={[
                <span className="text-gray-950">{c.name}</span>,
                c.productCount,
                formatDate(c.createdAt),
                <Toggle name={`brand-${c.id}`} checked={c.status} onChange={(v) => toggle(c, v)} disabled={!can('categories', 'edit')} />,
              ]}
              actions={actions}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No brands found. Add the brands (companies) you sell, then pick one on each product." />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit Brand' : 'Add Brand'} size="md">
        <form onSubmit={save} className="space-y-4">
          <Field label="Brand Name" required htmlFor="brand-name" error={errors.name}>
            <input
              id="brand-name"
              autoFocus
              required
              maxLength={100}
              value={editing?.name || ''}
              onChange={(e) => setEditing((c) => ({ ...c, name: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">Status</span>
            <Toggle name="brand-status" checked={editing?.status ?? true} onChange={(v) => setEditing((c) => ({ ...c, status: v }))} />
          </div>
          <div className="flex justify-end gap-2">
            <CancelButton onClick={() => setEditing(null)} />
            <SubmitButton isLoading={saving} mode={editing?.id ? 'edit' : 'create'} />
          </div>
        </form>
      </Modal>
      <ConfirmModal
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        message="Are you sure you want to delete this brand?"
        isDeleting={deleting}
      />
    </div>
  );
}
