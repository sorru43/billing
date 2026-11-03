import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Eye, EyeOff, SquarePen, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, formatDate } from '../auth.jsx';
import { Avatar, CancelButton, ConfirmModal, Field, ListToolbar, Modal, PageHeader, Pagination, Row, SubmitButton, Table, TableState, Toggle, inputCls } from '../components/ui.jsx';
import { useList } from '../components/useList.js';

const EMPTY = { firstName: '', lastName: '', email: '', phone: '', roleId: '', password: '', status: true };

export default function Users() {
  const { can, user: me } = useAuth();
  const list = useList('/users', 'users');
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get('/roles/options').then((r) => setRoles(r.data)).catch(() => {});
  }, []);

  const actions = [
    can('users', 'edit') && { label: 'Edit', icon: <SquarePen size={14} />, onClick: (u) => (setErrors({}), setEditing({ ...EMPTY, ...u, password: '' })) },
    can('users', 'delete') && { label: 'Delete', icon: <Trash2 size={14} />, onClick: setToDelete },
  ].filter(Boolean);
  const headers = ['#', 'User Name', 'Phone', 'Role', 'Status', 'Created On'];
  if (actions.length) headers.push('Actions');

  const set = (k) => (e) => setEditing((u) => ({ ...u, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { firstName, lastName, email, phone, roleId, password, status } = editing;
      const body = { firstName, lastName, email, phone, roleId, password, status };
      if (editing.id) await api.put(`/users/${editing.id}`, body);
      else await api.post('/users', body);
      toast.success(editing.id ? 'User updated successfully' : 'User created successfully');
      setEditing(null);
      list.reload();
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
      await api.del(`/users/${toDelete.id}`);
      toast.success('User deleted successfully');
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
      <PageHeader title="Users" actionLabel={can('users', 'create') && 'New User'} onAction={() => (setErrors({}), setEditing({ ...EMPTY }))} />
      <ListToolbar search={list.search} onSearch={list.setSearch} limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((u, i) => (
            <Row
              key={u.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={u}
              columns={[
                <Avatar name={`${u.firstName} ${u.lastName}`.trim()} sub={u.email} />,
                u.phone || '-',
                u.roleName || <span className="text-red-600">No role</span>,
                <span className={`text-xs font-semibold ${u.status ? 'text-emerald-700' : 'text-gray-500'}`}>{u.status ? 'Active' : 'Disabled'}</span>,
                formatDate(u.createdAt),
              ]}
              actions={actions.filter((a) => !(a.label === 'Delete' && u.id === me?.id))}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No Users Found" />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit User' : 'Add User'}>
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="First Name" required htmlFor="u-first" error={errors.firstName}>
                <input id="u-first" required maxLength={100} value={editing.firstName} onChange={set('firstName')} className={inputCls} />
              </Field>
              <Field label="Last Name" htmlFor="u-last" error={errors.lastName}>
                <input id="u-last" maxLength={100} value={editing.lastName} onChange={set('lastName')} className={inputCls} />
              </Field>
              <Field label="Email" required htmlFor="u-email" error={errors.email}>
                <input id="u-email" type="email" required maxLength={200} value={editing.email} onChange={set('email')} className={inputCls} autoComplete="off" />
              </Field>
              <Field label="Phone" htmlFor="u-phone" error={errors.phone}>
                <input id="u-phone" maxLength={30} value={editing.phone} onChange={set('phone')} className={inputCls} />
              </Field>
              <Field label="Role" required htmlFor="u-role" error={errors.roleId}>
                <select id="u-role" required value={editing.roleId || ''} onChange={set('roleId')} className={`${inputCls} bg-white h-[42px]`}>
                  <option value="">Select role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roleName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={editing.id ? 'New Password (leave blank to keep)' : 'Password'} required={!editing.id} htmlFor="u-pass" error={errors.password}>
                <div className="relative">
                  <input
                    id="u-pass"
                    type={showPw ? 'text' : 'password'}
                    required={!editing.id}
                    minLength={10}
                    maxLength={200}
                    autoComplete="new-password"
                    value={editing.password}
                    onChange={set('password')}
                    className={`${inputCls} pr-10`}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute inset-y-0 right-0 top-1 px-3 text-gray-500" aria-label="Show password">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">At least 10 characters.</p>
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600">Active</span>
              <Toggle name="u-status" checked={editing.status} onChange={(v) => setEditing((u) => ({ ...u, status: v }))} />
            </div>
            {roles.length === 0 && <p className="text-sm text-red-600">Create a role first in Roles & Permissions.</p>}
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
        message={`Delete ${toDelete?.firstName || 'this user'}? They will no longer be able to sign in.`}
        isDeleting={deleting}
      />
    </div>
  );
}
