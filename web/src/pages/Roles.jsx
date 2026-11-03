import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { KeyRound, SquarePen, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, formatDate } from '../auth.jsx';
import { CancelButton, ConfirmModal, Field, ListToolbar, Modal, PageHeader, Pagination, Row, SubmitButton, Table, TableState, Toggle, inputCls } from '../components/ui.jsx';
import { useList } from '../components/useList.js';

export default function Roles() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const list = useList('/roles', 'roles');
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const actions = [
    can('roles', 'view') && { label: 'Permissions', icon: <KeyRound size={14} />, onClick: (r) => navigate(`/admin/roles/permissions/${r.id}`) },
    can('roles', 'edit') && { label: 'Edit', icon: <SquarePen size={14} />, onClick: (r) => (setErrors({}), setEditing(r)) },
    can('roles', 'delete') && { label: 'Delete', icon: <Trash2 size={14} />, onClick: setToDelete },
  ].filter(Boolean);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = { roleName: editing.roleName || '', status: editing.status ?? true };
      if (editing.id) {
        await api.put(`/roles/${editing.id}`, body);
        toast.success('Role updated successfully');
        setEditing(null);
        list.reload();
      } else {
        const { data } = await api.post('/roles', body);
        toast.success('Role created. Now choose what it can do.');
        navigate(`/admin/roles/permissions/${data.id}`);
      }
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/roles/${toDelete.id}`);
      toast.success('Role deleted successfully');
      setToDelete(null);
      list.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const headers = ['#', 'Role Name', 'Users', 'Status', 'Created On', 'Actions'];
  return (
    <div className="space-y-4">
      <PageHeader title="Roles" actionLabel={can('roles', 'create') && 'New Role'} onAction={() => (setErrors({}), setEditing({ status: true }))} />
      <ListToolbar search={list.search} onSearch={list.setSearch} limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((r, i) => (
            <Row
              key={r.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={r}
              columns={[
                <span className="text-gray-950">{r.roleName}</span>,
                r.userCount,
                <span className={`text-xs font-semibold ${r.status ? 'text-emerald-700' : 'text-gray-500'}`}>{r.status ? 'Active' : 'Inactive'}</span>,
                formatDate(r.createdAt),
              ]}
              actions={actions}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No Roles Found" />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit Role' : 'Add Role'} size="md">
        <form onSubmit={save} className="space-y-4">
          <Field label="Role Name" required htmlFor="role-name" error={errors.roleName}>
            <input
              id="role-name"
              autoFocus
              required
              maxLength={100}
              value={editing?.roleName || ''}
              onChange={(e) => setEditing((r) => ({ ...r, roleName: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">Active</span>
            <Toggle name="role-status" checked={editing?.status ?? true} onChange={(v) => setEditing((r) => ({ ...r, status: v }))} />
          </div>
          <p className="text-xs text-gray-500">Users with an inactive role lose all their permissions until it is turned back on.</p>
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
        message="Are you sure you want to delete this role?"
        isDeleting={deleting}
      />
    </div>
  );
}
