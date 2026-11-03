import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Checkbox, FullPageLoader, SubmitButton } from '../components/ui.jsx';

const ACTIONS = ['create', 'edit', 'delete', 'view'];
const blank = { view: false, create: false, edit: false, delete: false };
const allOn = (p) => ACTIONS.every((a) => p[a]);

// Same layout as the original Role Permissions screen: one card per module group,
// CREATE / EDIT / DELETE / VIEW / ALLOW ALL per module.
export default function RolePermissions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, refresh } = useAuth();
  const [role, setRole] = useState(null);
  const [modules, setModules] = useState([]);
  const [perms, setPerms] = useState({});
  const [saving, setSaving] = useState(false);
  const editable = can('roles', 'edit');

  useEffect(() => {
    api
      .get(`/roles/${id}/permissions`)
      .then(({ data }) => {
        setRole(data.role);
        setModules(data.modules);
        setPerms(data.permissions);
      })
      .catch((e) => toast.error(e.message));
  }, [id]);

  const get = (slug) => perms[slug] || blank;
  const toggle = (slug, action) =>
    setPerms((p) => {
      const cur = { ...get(slug) };
      if (action === 'allowAll') {
        const v = !allOn(cur);
        ACTIONS.forEach((a) => (cur[a] = v));
      } else {
        cur[action] = !cur[action];
        if (action !== 'view' && cur[action]) cur.view = true; // can't act on what you can't see
        if (action === 'view' && !cur.view) ACTIONS.forEach((a) => (cur[a] = false));
      }
      return { ...p, [slug]: cur };
    });
  const toggleGroup = (group) =>
    setPerms((p) => {
      const v = !group.children.every((c) => allOn(get(c.slug)));
      const next = { ...p };
      group.children.forEach((c) => (next[c.slug] = { view: v, create: v, edit: v, delete: v }));
      return next;
    });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/roles/${id}/permissions`, { permissions: perms });
      toast.success('Permissions saved successfully.');
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!role) return <FullPageLoader />;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-950  mb-6">Role Permissions</h1>
      <div className="flex flex-1 bg-white shadow-sm rounded-xl border border-gray-200 mb-6">
        <p className="font-bold text-gray-950 p-4 flex-1">Role Name: {role.roleName}</p>
      </div>
      <form onSubmit={submit}>
        {modules.map((g) => (
          <div key={g.moduleName} className="permissions mb-6">
            <div className="bg-white shadow-sm rounded-xl border border-gray-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h2 className="font-bold text-gray-950">{g.moduleName}</h2>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <Checkbox checked={g.children.every((c) => allOn(get(c.slug)))} onChange={() => toggleGroup(g)} disabled={!editable} />
                  Allow All
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-sm text-gray-600 font-semibold text-left">
                      {['MODULE', 'CREATE', 'EDIT', 'DELETE', 'VIEW', 'ALLOW ALL'].map((h) => (
                        <th key={h} className="px-4 py-3 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.children.map((m) => {
                      const p = get(m.slug);
                      return (
                        <tr key={m.slug} className="border-t border-gray-200  text-sm text-left">
                          <td className="px-4 py-3 text-sm font-medium text-gray-950">{m.moduleName}</td>
                          {ACTIONS.map((a) => (
                            <td key={a} className="px-4 py-3">
                              <Checkbox checked={p[a]} onChange={() => toggle(m.slug, a)} disabled={!editable} />
                            </td>
                          ))}
                          <td className="px-4 py-3">
                            <Checkbox checked={allOn(p)} onChange={() => toggle(m.slug, 'allowAll')} disabled={!editable} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => navigate('/admin/roles')}
            className="bg-gray-200 hover:bg-gray-300 text-gray-600 font-semibold py-2 px-4 rounded cursor-pointer mr-2"
          >
            Cancel
          </button>
          {editable && <SubmitButton isLoading={saving} mode="edit" />}
        </div>
      </form>
    </div>
  );
}
