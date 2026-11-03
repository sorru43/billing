import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, Loader, SubmitButton, inputCls } from '../components/ui.jsx';

export function CompanySettings() {
  const { can, refresh } = useAuth();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const editable = can('settings', 'edit');

  useEffect(() => {
    api.get('/settings/company').then((r) => setForm(r.data)).catch((e) => toast.error(e.message));
  }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api.put('/settings/company', form);
      toast.success('Company settings saved');
      refresh();
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <Loader className="h-64" />;
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h3 className="text-xl font-bold text-gray-950 mb-6">Company Settings</h3>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={!editable} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Company Name" required htmlFor="c-name" error={errors.companyName}>
            <input id="c-name" required maxLength={200} value={form.companyName || ''} onChange={set('companyName')} className={inputCls} />
          </Field>
          <Field label="Company Email" htmlFor="c-email" error={errors.email}>
            <input id="c-email" type="email" maxLength={200} value={form.email || ''} onChange={set('email')} className={inputCls} />
          </Field>
          <Field label="Phone" htmlFor="c-phone" error={errors.phone}>
            <input id="c-phone" maxLength={30} value={form.phone || ''} onChange={set('phone')} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Currency" htmlFor="c-cur">
              <input id="c-cur" readOnly value="US Dollar ($)" className={`${inputCls} bg-gray-50`} />
            </Field>
            <Field label="Invoice Prefix" required htmlFor="c-prefix" error={errors.invoicePrefix}>
              <input id="c-prefix" required maxLength={10} value={form.invoicePrefix || ''} onChange={set('invoicePrefix')} className={inputCls} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Address" htmlFor="c-addr" error={errors.address}>
              <textarea id="c-addr" rows={3} maxLength={1000} value={form.address || ''} onChange={set('address')} className={inputCls} />
            </Field>
          </div>
        </fieldset>
        <p className="text-xs text-gray-500">These details appear in the “Bill From” section of every invoice and on emailed reports.</p>
        {editable && (
          <div className="flex justify-end">
            <SubmitButton isLoading={saving} mode="edit" />
          </div>
        )}
      </form>
    </div>
  );
}

export function Profile() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState('');

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving('profile');
    setErrors({});
    try {
      await api.put('/auth/profile', form);
      toast.success('Profile updated');
      refresh();
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving('');
    }
  };
  const savePassword = async (e) => {
    e.preventDefault();
    setErrors({});
    if (pw.newPassword !== pw.confirm) {
      setErrors({ confirm: 'Passwords do not match' });
      return;
    }
    setSaving('password');
    try {
      await api.put('/auth/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success('Password changed. Other sessions have been signed out.');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <form onSubmit={saveProfile} className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
        <h3 className="text-xl font-bold text-gray-950">Profile</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="First Name" required htmlFor="p-first" error={errors.firstName}>
            <input id="p-first" required maxLength={100} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Last Name" htmlFor="p-last">
            <input id="p-last" maxLength={100} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Email" htmlFor="p-email">
            <input id="p-email" value={user.email} disabled className={`${inputCls} bg-gray-50`} />
          </Field>
          <Field label="Phone" htmlFor="p-phone">
            <input id="p-phone" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end">
          <SubmitButton isLoading={saving === 'profile'} mode="edit" />
        </div>
      </form>
      <form onSubmit={savePassword} className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
        <h3 className="text-xl font-bold text-gray-950">Change Password</h3>
        <Field label="Current Password" required htmlFor="p-cur" error={errors.currentPassword}>
          <input id="p-cur" type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} className={inputCls} />
        </Field>
        <Field label="New Password" required htmlFor="p-new" error={errors.newPassword}>
          <input id="p-new" type="password" required minLength={10} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Confirm New Password" required htmlFor="p-conf" error={errors.confirm}>
          <input id="p-conf" type="password" required minLength={10} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className={inputCls} />
        </Field>
        <div className="flex justify-end">
          <SubmitButton isLoading={saving === 'password'}>{saving === 'password' ? 'Saving...' : 'Update Password'}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
