import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { api } from '../api.js';
import { useLocation } from 'react-router';
import { useAuth, logoUrl } from '../auth.jsx';
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
    <div className="space-y-4">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LogoCard
          kind="dashboard"
          title="Dashboard Logo"
          hint="Shown in the sidebar and on the sign-in page. PNG, JPG or WebP, up to 1 MB."
          accept="image/png,image/jpeg,image/webp"
          editable={editable}
        />
        <LogoCard
          kind="invoice"
          title="Invoice Logo"
          hint="Shown on invoices, invoice PDFs and emailed report PDFs. PNG or JPG, up to 1 MB."
          accept="image/png,image/jpeg"
          editable={editable}
        />
      </div>
      <InventorySettings editable={editable} />
      <BarcodeLookupSettings editable={editable} />
    </div>
  );
}

// Admin switch: allow invoices to sell more than is in stock (stock goes below zero until it is received).
function InventorySettings({ editable }) {
  const [allow, setAllow] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get('/settings/inventory').then((r) => setAllow(r.data.allowOutOfStockSales)).catch((e) => toast.error(e.message));
  }, []);
  const change = async (v) => {
    setSaving(true);
    try {
      const r = await api.put('/settings/inventory', { allowOutOfStockSales: v });
      setAllow(v);
      toast.success(r.message);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h3 className="text-xl font-bold text-gray-950 mb-4">Inventory</h3>
      {allow === null ? (
        <Loader className="h-16" />
      ) : (
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-semibold text-gray-950">Allow selling products that are out of stock</p>
            <p className="text-sm text-gray-500 mt-1">
              Turn on when you sometimes sell items before their delivery is entered in the system. Invoices will then accept any quantity and the
              stock goes below zero (shown in red) until you receive the stock. When off, an invoice cannot sell more than is in stock.
            </p>
          </div>
          <Toggle name="allow-oversell" checked={allow} disabled={!editable || saving} onChange={change} />
        </div>
      )}
    </div>
  );
}

function BarcodeLookupSettings({ editable }) {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/settings/barcode-lookup')
      .then((r) => {
        setHasKey(r.data.hasKey);
        if (r.data.apiKey) setApiKey(r.data.apiKey);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put('/settings/barcode-lookup', { apiKey });
      setHasKey(r.data.hasKey);
      setApiKey(r.data.apiKey || '');
      toast.success(r.message || 'Barcode Lookup API key saved');
    } catch (e) {
      toast.error(e.message || 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const testKey = async () => {
    setTesting(true);
    try {
      const r = await api.post('/settings/barcode-lookup/test', { apiKey });
      toast.success(r.data?.message || 'Connection successful! Barcode Lookup API is working.');
    } catch (e) {
      toast.error(e.message || 'Test failed. Please check the API key.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-gray-950">Barcode Lookup API</h3>
            {hasKey && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Connected
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Connect your <a href="https://www.barcodelookup.com/api" target="_blank" rel="noreferrer" className="text-purple-600 underline font-medium hover:text-purple-800">barcodelookup.com</a> API key to automatically autofill product names, categories, descriptions, and photos when scanning barcodes.
          </p>
        </div>
      </div>

      {loading ? (
        <Loader className="h-12" />
      ) : (
        <div className="space-y-3 max-w-xl">
          <Field label="API Key">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter your Barcode Lookup API key"
                value={apiKey}
                disabled={!editable}
                onChange={(e) => setApiKey(e.target.value)}
                className={inputCls}
              />
              <button
                type="button"
                onClick={testKey}
                disabled={testing || (!apiKey && !hasKey)}
                className="px-3.5 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md border border-gray-300 disabled:opacity-50 cursor-pointer whitespace-nowrap transition-colors"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </Field>

          {editable && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-md disabled:opacity-50 cursor-pointer shadow-xs transition-colors"
              >
                {saving ? 'Saving...' : 'Save API Key'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LogoCard({ kind, title, hint, accept, editable }) {
  const { logos, refreshLogos } = useAuth();
  const v = logos?.[kind];
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) return toast.error('Logo must be 1 MB or smaller');
    setBusy('upload');
    try {
      await api.upload(`/settings/logo/${kind}`, file);
      await refreshLogos();
      toast.success(`${title} updated`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };
  const reset = async () => {
    if (!window.confirm(`Reset the ${title.toLowerCase()} to the default?`)) return;
    setBusy('reset');
    try {
      await api.del(`/settings/logo/${kind}`);
      await refreshLogos();
      toast.success(`${title} reset to default`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-950">{title}</h3>
        <span className="text-xs text-gray-500">{v ? 'Custom' : 'Default'}</span>
      </div>
      <div className="flex items-center justify-center h-28 rounded-md border border-dashed border-gray-300 bg-gray-50 p-4">
        <img src={logoUrl(kind, v)} alt={`${title} preview`} className="max-h-20 max-w-full object-contain" />
      </div>
      <p className="text-xs text-gray-500">{hint}</p>
      {editable && (
        <div className="flex justify-end gap-2">
          {v && (
            <button
              type="button"
              onClick={reset}
              disabled={!!busy}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === 'reset' ? 'Resetting...' : 'Reset to Default'}
            </button>
          )}
          <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={upload} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {busy === 'upload' ? 'Uploading...' : v ? 'Change Logo' : 'Upload Logo'}
          </button>
        </div>
      )}
    </div>
  );
}

export function Profile() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [login, setLogin] = useState({ email: user.email, currentPassword: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState('');
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#change-login') {
      const el = document.getElementById('change-login');
      el?.scrollIntoView({ behavior: 'smooth' });
      document.getElementById('l-email')?.focus({ preventScroll: true });
    }
  }, [hash]);

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
  const saveEmail = async (e) => {
    e.preventDefault();
    setErrors({});
    setSaving('email');
    try {
      await api.put('/auth/email', login);
      toast.success('Login email updated. Use the new email next time you sign in.');
      setLogin((l) => ({ ...l, currentPassword: '' }));
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
          <Field label="Phone" htmlFor="p-phone">
            <input id="p-phone" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end">
          <SubmitButton isLoading={saving === 'profile'} mode="edit" />
        </div>
      </form>
      <form id="change-login" onSubmit={saveEmail} className="bg-white p-6 rounded-lg border border-gray-200 space-y-4 scroll-mt-4">
        <h3 className="text-xl font-bold text-gray-950">Change Login Email</h3>
        <Field label="Login Email" required htmlFor="l-email" error={errors.email}>
          <input id="l-email" type="email" required maxLength={200} autoComplete="username" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Current Password" required htmlFor="l-cur" error={errors.emailPassword || errors.currentPassword}>
          <input id="l-cur" type="password" required autoComplete="current-password" value={login.currentPassword} onChange={(e) => setLogin({ ...login, currentPassword: e.target.value })} className={inputCls} />
        </Field>
        <div className="flex justify-end">
          <SubmitButton isLoading={saving === 'email'}>{saving === 'email' ? 'Saving...' : 'Update Email'}</SubmitButton>
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
