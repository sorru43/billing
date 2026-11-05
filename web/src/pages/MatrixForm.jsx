import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import { X } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { CancelButton, ConfirmModal, Field, Loader, SubmitButton, Toggle, inputCls } from '../components/ui.jsx';

const PRICE_KEYS = ['cost', 'selling_price', 'top_customer_price', 'jobber_price'];
const EMPTY = {
  name: '', category_id: '', description: '', status: true,
  attr1_name: 'Flavor', attr1_values: [], attr2_name: '', attr2_values: [],
  cost: '', selling_price: '', top_customer_price: '', jobber_price: '',
};
const keyOf = (o1, o2) => `${o1.toLowerCase()}\u0000${(o2 || '').toLowerCase()}`;
const cellCls =
  'p-1.5 h-9 w-full border text-gray-700 text-sm border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600';

// Same EAN-13 generator as the product form, so codes scan on standard readers.
function generateEan13() {
  const digits = Array.from({ length: 12 }, (_, i) => (i === 0 ? 2 : Math.floor(Math.random() * 10)));
  const sum = digits.reduce((a, d, i) => a + d * (i % 2 ? 3 : 1), 0);
  return digits.join('') + ((10 - (sum % 10)) % 10);
}

// Chip input: Enter or comma adds a value; pasting "a, b, c" adds all three.
function ValuesInput({ values, onChange, placeholder, error }) {
  const [text, setText] = useState('');
  const add = (raw) => {
    const next = [...values];
    for (const part of raw.split(/[,\n\t]/)) {
      const v = part.trim().slice(0, 60);
      if (v && !next.some((x) => x.toLowerCase() === v.toLowerCase())) next.push(v);
    }
    onChange(next);
    setText('');
  };
  return (
    <div>
      <div className={`mt-1 flex flex-wrap gap-1.5 p-2 min-h-[42px] border rounded-md ${error ? 'border-red-500' : 'border-gray-200'} focus-within:ring-1 focus-within:ring-purple-600`}>
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-0.5 text-sm">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="cursor-pointer">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (text.trim()) add(text);
            } else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => text.trim() && add(text)}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (/[,\n\t]/.test(t)) {
              e.preventDefault();
              add(t);
            }
          }}
          placeholder={values.length ? '' : placeholder}
          className="flex-1 min-w-[8rem] text-sm text-gray-700 focus:outline-none"
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function MatrixForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [form, setForm] = useState(EMPTY);
  // Variant details keyed by option combination; combinations not in the grid are ignored.
  const [variants, setVariants] = useState({});
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);

  useEffect(() => {
    api.get('/categories/options').then((r) => setCategories(r.data)).catch(() => {});
    if (!id) return;
    api
      .get(`/matrices/${id}`)
      .then(({ data }) => {
        setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, data[k] ?? EMPTY[k]])), category_id: data.category_id || '' });
        setVariants(Object.fromEntries(data.variants.map((v) => [keyOf(v.option1, v.option2), { ...v, include: true }])));
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const two = Boolean(form.attr2_name.trim());

  const defaults = () => ({
    barcode: '', quantity: 0, status: true, include: true,
    ...Object.fromEntries(PRICE_KEYS.map((k) => [k, form[k] === '' ? 0 : form[k]])),
  });

  // Every combination of the attribute values, in the order the values were entered.
  const combos = useMemo(() => {
    const second = two && form.attr2_values.length ? form.attr2_values : [''];
    return form.attr1_values.flatMap((o1) => second.map((o2) => ({ key: keyOf(o1, o2), option1: o1, option2: o2 })));
  }, [form.attr1_values, form.attr2_values, two]);

  const rowOf = (c) => ({ ...defaults(), ...variants[c.key], option1: c.option1, option2: c.option2 });
  const setVariant = (key, patch) => setVariants((vs) => ({ ...vs, [key]: { ...defaults(), ...vs[key], ...patch } }));

  const applyPrices = () => {
    setVariants((vs) => {
      const next = { ...vs };
      for (const c of combos) next[c.key] = { ...rowOf(c), ...Object.fromEntries(PRICE_KEYS.map((k) => [k, form[k] === '' ? 0 : form[k]])) };
      return next;
    });
    toast.success('Default prices applied to every variant');
  };
  const fillBarcodes = () =>
    setVariants((vs) => {
      const next = { ...vs };
      for (const c of combos) {
        const row = rowOf(c);
        if (row.include && !row.barcode) next[c.key] = { ...row, barcode: generateEan13() };
      }
      return next;
    });

  const included = combos.map(rowOf).filter((v) => v.include);
  const comboKeys = new Set(included.map((v) => keyOf(v.option1, v.option2)));
  const toRemove = Object.entries(variants)
    .filter(([k, v]) => v.id && !comboKeys.has(k))
    .map(([, v]) => v);

  const doSave = async () => {
    setConfirmRemove(null);
    setErrors({});
    setSaving(true);
    const body = {
      ...form,
      attr2_name: two ? form.attr2_name : '',
      attr2_values: two ? form.attr2_values : [],
      variants: included.map(({ include, name, description, ...v }) => ({ ...v, option2: two ? v.option2 : '' })),
    };
    try {
      if (id) await api.put(`/matrices/${id}`, body);
      else await api.post('/matrices', body);
      toast.success(id ? 'Matrix item updated' : 'Matrix item created');
      navigate('/admin/matrix');
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!included.length) {
      setErrors({ variants: 'Add attribute values and keep at least one variant ticked' });
      return;
    }
    if (toRemove.length) setConfirmRemove(toRemove);
    else doSave();
  };

  if (loading) return <Loader className="h-64" />;

  // Map server errors like "variants.3.barcode" back onto the row that was sent at index 3.
  const rowError = (v, field) => {
    const i = included.indexOf(v);
    return i >= 0 ? errors[`variants.${i}.${field}`] : undefined;
  };
  const money = (k, label) => (
    <Field label={label} required htmlFor={k} error={errors[k]}>
      <input id={k} type="number" min="0" step="0.01" required value={form[k]} onChange={set(k)} className={inputCls} />
    </Field>
  );
  const num = (v, k, step) => (
    <input
      type="number"
      min="0"
      step={step}
      value={v[k]}
      disabled={!v.include}
      onChange={(e) => setVariant(keyOf(v.option1, v.option2), { [k]: e.target.value })}
      className={`${cellCls} ${rowError(v, k) ? 'border-red-500' : ''}`}
      title={rowError(v, k)}
    />
  );

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg">
      <h1 className="text-2xl font-bold text-gray-950 mb-1">{id ? 'Edit Matrix Item' : 'New Matrix Item'}</h1>
      <p className="text-sm text-gray-500 mb-4">
        One item with variations (for example Flavor × Size). Each variant gets its own barcode and stock, and shows as a grid on invoices.
      </p>
      <form onSubmit={submit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Item Name" required htmlFor="name" error={errors.name}>
            <input id="name" required maxLength={150} value={form.name} onChange={set('name')} className={inputCls} placeholder="e.g. Vape Juice 60ml" />
          </Field>
          <Field label="Category" required htmlFor="category_id" error={errors.category_id}>
            <select id="category_id" required value={form.category_id} onChange={set('category_id')} className={`${inputCls} bg-white h-[42px]`}>
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <label className="block text-sm font-medium text-gray-600">Status</label>
            <div className="mt-3">
              <Toggle name="status" checked={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v }))} />
            </div>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 space-y-4">
          <h2 className="font-bold text-gray-950">Attributes</h2>
          <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr] gap-4">
            <Field label="Attribute 1" required htmlFor="attr1_name" error={errors.attr1_name}>
              <input id="attr1_name" required maxLength={40} value={form.attr1_name} onChange={set('attr1_name')} className={inputCls} placeholder="e.g. Flavor" />
            </Field>
            <div>
              <label className="block text-sm font-medium text-red-500">Values *</label>
              <ValuesInput
                values={form.attr1_values}
                onChange={(v) => setForm((f) => ({ ...f, attr1_values: v }))}
                placeholder="Type a value and press Enter (or paste a comma list): Mint, Mango, Grape..."
                error={errors.attr1_values}
              />
            </div>
            <Field label="Attribute 2 (optional)" htmlFor="attr2_name" error={errors.attr2_name}>
              <input id="attr2_name" maxLength={40} value={form.attr2_name} onChange={set('attr2_name')} className={inputCls} placeholder="e.g. Size" />
            </Field>
            <div>
              <label className="block text-sm font-medium text-gray-600">Values</label>
              <ValuesInput
                values={form.attr2_values}
                onChange={(v) => setForm((f) => ({ ...f, attr2_values: v }))}
                placeholder={two ? 'e.g. 3mg, 6mg, 12mg' : 'Name the second attribute first'}
                error={errors.attr2_values}
              />
            </div>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="font-bold text-gray-950">Default Prices</h2>
            <button type="button" onClick={applyPrices} className="text-sm text-purple-600 font-semibold cursor-pointer">
              Apply to all variants
            </button>
          </div>
          <p className="text-xs text-gray-500">New variants start with these prices. You can still change any variant below.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {money('cost', 'Cost')}
            {money('selling_price', 'Selling Price')}
            {money('top_customer_price', 'Top Customer Price')}
            {money('jobber_price', 'Jobber Price')}
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="font-bold text-gray-950">
              Variants <span className="text-gray-500 font-normal text-sm">({included.length} of {combos.length} combinations)</span>
            </h2>
            {combos.length > 0 && (
              <button type="button" onClick={fillBarcodes} className="text-sm text-purple-600 font-semibold cursor-pointer">
                Generate missing barcodes
              </button>
            )}
          </div>
          {errors.variants && <p className="text-xs text-red-600">{errors.variants}</p>}
          {combos.length === 0 ? (
            <p className="text-sm text-gray-500">Add values above and every combination appears here. Untick any combination you don’t carry.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead>
                  <tr className="bg-black text-white text-left">
                    <th className="px-2 py-2 rounded-l-md w-10" title="Carry this variant">✓</th>
                    <th className="px-2 py-2">{form.attr1_name || 'Attribute 1'}</th>
                    {two && <th className="px-2 py-2">{form.attr2_name}</th>}
                    <th className="px-2 py-2 w-48">Barcode</th>
                    <th className="px-2 py-2 w-20">Qty</th>
                    <th className="px-2 py-2 w-24">Cost</th>
                    <th className="px-2 py-2 w-24">Selling</th>
                    <th className="px-2 py-2 w-24">Top Cust.</th>
                    <th className="px-2 py-2 w-24">Jobber</th>
                    <th className="px-2 py-2 w-16 rounded-r-md">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {combos.map((c) => {
                    const v = rowOf(c);
                    return (
                      <tr key={c.key} className={`border-b border-gray-100 ${v.include ? '' : 'opacity-50'}`}>
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={v.include}
                            onChange={(e) => setVariant(c.key, { include: e.target.checked })}
                            className="h-4 w-4 accent-purple-600 cursor-pointer"
                            aria-label={`Carry ${c.option1} ${c.option2}`}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-gray-950 font-medium">{c.option1}</td>
                        {two && <td className="px-2 py-1.5 text-gray-950 font-medium">{c.option2}</td>}
                        <td className="px-2 py-1.5">
                          <div className="flex">
                            <input
                              value={v.barcode}
                              maxLength={64}
                              disabled={!v.include}
                              onChange={(e) => setVariant(c.key, { barcode: e.target.value })}
                              className={`${cellCls} rounded-r-none ${rowError(v, 'barcode') ? 'border-red-500' : ''}`}
                              title={rowError(v, 'barcode')}
                            />
                            <button
                              type="button"
                              disabled={!v.include}
                              onClick={() => setVariant(c.key, { barcode: generateEan13() })}
                              className="px-2 bg-gray-200 text-gray-700 border border-l-0 border-gray-200 rounded-r text-xs hover:bg-gray-300 cursor-pointer"
                            >
                              Gen
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">{num(v, 'quantity', '1')}</td>
                        <td className="px-2 py-1.5">{num(v, 'cost', '0.01')}</td>
                        <td className="px-2 py-1.5">{num(v, 'selling_price', '0.01')}</td>
                        <td className="px-2 py-1.5">{num(v, 'top_customer_price', '0.01')}</td>
                        <td className="px-2 py-1.5">{num(v, 'jobber_price', '0.01')}</td>
                        <td className="px-2 py-1.5">
                          <Toggle name={`vs-${c.key}`} checked={v.status} disabled={!v.include} onChange={(s) => setVariant(c.key, { status: s })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description <span className="text-gray-400 font-normal">(copied to every variant)</span>
          </label>
          <textarea
            id="description"
            rows={3}
            maxLength={5000}
            value={form.description}
            onChange={set('description')}
            className="mt-1 text-gray-700 p-2 block w-full border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
          />
        </div>

        <div className="flex justify-end gap-2">
          <CancelButton onClick={() => navigate('/admin/matrix')} />
          <SubmitButton isLoading={saving} mode={id ? 'edit' : 'create'} isDisabled={id ? !can('products', 'edit') : !can('products', 'create')} />
        </div>
      </form>
      <ConfirmModal
        isOpen={Boolean(confirmRemove)}
        onClose={() => setConfirmRemove(null)}
        onConfirm={doSave}
        title="Remove variants?"
        confirmLabel="Save & Remove"
        message={
          <>
            <p>These variants are no longer in the grid and will be deleted with their stock:</p>
            <ul className="mt-2 text-left list-disc pl-5 max-h-40 overflow-y-auto">
              {(confirmRemove || []).map((v) => (
                <li key={v.id}>
                  {[v.option1, v.option2].filter(Boolean).join(' / ')} — {v.quantity} in stock
                </li>
              ))}
            </ul>
          </>
        }
      />
    </div>
  );
}
