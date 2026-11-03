import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, Loader, SubmitButton, Toggle, inputCls } from '../components/ui.jsx';

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

export function EmailSettings() {
  const { can, user } = useAuth();
  const [form, setForm] = useState(null);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const editable = can('settings', 'edit');

  useEffect(() => {
    api.get('/settings/email').then((r) => setForm(r.data)).catch((e) => toast.error(e.message));
    setTestTo(user?.email || '');
  }, [user]);

  const setSmtp = (k) => (e) => setForm((f) => ({ ...f, smtp: { ...f.smtp, [k]: e.target.value } }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api.put('/settings/email', {
        archiveEmail: form.archiveEmail,
        expiryAction: form.expiryAction,
        useCustomSmtp: form.useCustomSmtp,
        smtp: { ...form.smtp, port: Number(form.smtp.port), ...(password ? { password } : {}) },
      });
      toast.success('Email settings saved');
      setPassword('');
      const r = await api.get('/settings/email');
      setForm(r.data);
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api.post('/settings/email/test', { to: testTo });
      toast.success(r.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  if (!form) return <Loader className="h-64" />;
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-6">
      <h3 className="text-xl font-bold text-gray-950">Email Settings</h3>
      <form onSubmit={save} className="space-y-6">
        <fieldset disabled={!editable} className="space-y-6">
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <h2 className="font-semibold text-base text-gray-700">Invoices After {form.retentionHours} Hours</h2>
            <div className="space-y-2">
              {[
                ['delete', 'Delete (no saving)', 'The invoice is permanently removed from the app. No copy is kept anywhere.'],
                ['email', 'Send to private email, then delete', 'The invoice PDF is emailed automatically to the address below, then removed from the app.'],
              ].map(([value, label, hint]) => (
                <label key={value} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="expiryAction"
                    value={value}
                    checked={form.expiryAction === value}
                    onChange={() => setForm((f) => ({ ...f, expiryAction: value }))}
                    className="mt-1 accent-purple-600"
                  />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="block text-gray-500">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <h2 className="font-semibold text-base text-gray-700 pt-2">Private Archive Email</h2>
            <p className="text-sm text-gray-600">
              Used when invoices are sent to private email. Reports default to this address too. Use an inbox only you control.
            </p>
            <Field label="Archive Email" htmlFor="e-archive" error={errors.archiveEmail}>
              <input
                id="e-archive"
                type="email"
                maxLength={200}
                value={form.archiveEmail}
                onChange={(e) => setForm((f) => ({ ...f, archiveEmail: e.target.value }))}
                className={`${inputCls} md:w-1/2`}
                placeholder="private-archive@example.com"
              />
            </Field>
            {form.expiryAction === 'email' && !form.archiveEmail && (
              <p className="text-sm text-red-600 font-medium">Required: enter the address invoices are sent to.</p>
            )}
          </div>

          <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-100 p-2 rounded-md flex items-center justify-center">
                    <img alt="SMTP" className="w-6 h-6 object-contain" src="/static/smtp.svg" />
                  </div>
                  <h2 className="font-semibold text-base text-gray-700">Custom SMTP</h2>
                </div>
                <Toggle name="useCustomSmtp" checked={form.useCustomSmtp} onChange={(v) => setForm((f) => ({ ...f, useCustomSmtp: v }))} disabled={!editable} />
              </div>
              <p className="text-sm text-gray-600">
                {form.useCustomSmtp
                  ? 'Emails are sent through the SMTP server below.'
                  : `Off: emails are sent through the server's default mailbox (${form.defaultSmtp.from || form.defaultSmtp.host || 'not configured'}).`}
              </p>
              {form.useCustomSmtp && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="SMTP Host" required htmlFor="s-host" error={errors['smtp.host']}>
                    <input id="s-host" required value={form.smtp.host} onChange={setSmtp('host')} className={inputCls} placeholder="smtp.example.com" />
                  </Field>
                  <Field label="Port" required htmlFor="s-port" error={errors['smtp.port']}>
                    <input id="s-port" type="number" required value={form.smtp.port} onChange={setSmtp('port')} className={inputCls} />
                  </Field>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Use SSL/TLS (port 465)</label>
                    <div className="mt-3">
                      <Toggle name="s-secure" checked={form.smtp.secure} onChange={(v) => setForm((f) => ({ ...f, smtp: { ...f.smtp, secure: v } }))} />
                    </div>
                  </div>
                  <Field label="Username" required htmlFor="s-user" error={errors['smtp.user']}>
                    <input id="s-user" required value={form.smtp.user} onChange={setSmtp('user')} className={inputCls} autoComplete="off" />
                  </Field>
                  <Field label="Password" htmlFor="s-pass">
                    <input
                      id="s-pass"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputCls}
                      autoComplete="new-password"
                      placeholder={form.smtp.passwordSet ? '•••••••• (saved, leave blank to keep)' : ''}
                    />
                  </Field>
                  <Field label="From Email" htmlFor="s-from" error={errors['smtp.from']}>
                    <input id="s-from" type="email" value={form.smtp.from} onChange={setSmtp('from')} className={inputCls} />
                  </Field>
                </div>
              )}
            </div>
          </div>
        </fieldset>
        {editable && (
          <div className="flex justify-end">
            <SubmitButton isLoading={saving} mode="edit" />
          </div>
        )}
      </form>

      {editable && (
        <div className="border-t border-gray-200 pt-4 flex flex-col md:flex-row md:items-end gap-3">
          <Field label="Send a test email to" htmlFor="t-to">
            <input id="t-to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} className={inputCls} />
          </Field>
          <button
            type="button"
            onClick={test}
            disabled={testing}
            className="h-[42px] px-4 text-sm font-medium bg-gray-950 text-white rounded-md disabled:opacity-60 cursor-pointer"
          >
            {testing ? 'Sending...' : 'Send Test'}
          </button>
          <p className="text-xs text-gray-500 md:mb-3">Save first if you changed anything above.</p>
        </div>
      )}
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
