import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { CancelButton, Field, Loader, SubmitButton, Toggle, inputCls } from '../components/ui.jsx';

const EMPTY = {
  name: '', cost: '', selling_price: '', top_customer_price: '', jobber_price: '', quantity: '0',
  barcode: '', description: '', category_id: '', status: true,
};

// EAN-13 with a valid check digit, so generated codes scan on standard readers.
function generateEan13() {
  const digits = Array.from({ length: 12 }, (_, i) => (i === 0 ? 2 : Math.floor(Math.random() * 10)));
  const sum = digits.reduce((a, d, i) => a + d * (i % 2 ? 3 : 1), 0);
  return digits.join('') + ((10 - (sum % 10)) % 10);
}

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/categories/options').then((r) => setCategories(r.data)).catch(() => {});
    if (id) {
      api
        .get(`/products/${id}`)
        .then(({ data }) =>
          setForm({
            ...EMPTY,
            ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, data[k] ?? EMPTY[k]])),
            category_id: data.category_id || '',
          }),
        )
        .catch((e) => toast.error(e.message))
        .finally(() => setLoading(false));
    }
  }, [id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      if (id) await api.put(`/products/${id}`, form);
      else await api.post('/products', form);
      toast.success(id ? 'Product updated successfully' : 'Product created successfully');
      navigate('/admin/products');
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader className="h-64" />;

  const money = (k, label) => (
    <Field label={label} required htmlFor={k} error={errors[k]}>
      <input id={k} type="number" min="0" step="0.01" required value={form[k]} onChange={set(k)} className={inputCls} />
    </Field>
  );

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg ">
      <h1 className="text-2xl font-bold text-gray-950  mb-2">{id ? 'Edit Product' : 'Add Product'}</h1>
      <form onSubmit={submit} className="space-y-4 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ">
          <Field label="Name" required htmlFor="name" error={errors.name}>
            <input id="name" type="text" required maxLength={200} value={form.name} onChange={set('name')} className={inputCls} />
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
            {categories.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">
                No categories yet.{' '}
                {can('categories', 'create') && (
                  <button type="button" className="text-purple-600 font-semibold cursor-pointer" onClick={() => navigate('/admin/categories')}>
                    Create one
                  </button>
                )}
              </p>
            )}
          </Field>
          <Field label="Quantity" required htmlFor="quantity" error={errors.quantity}>
            <input id="quantity" type="number" min="0" step="1" required value={form.quantity} onChange={set('quantity')} className={inputCls} />
          </Field>
          {money('cost', 'Cost')}
          {money('selling_price', 'Selling Price (1)')}
          {money('top_customer_price', 'Top Customer Price (2)')}
          {money('jobber_price', 'Jobber Price (3)')}
          <Field label="Barcode" htmlFor="barcode" error={errors.barcode}>
            <div className="mt-1 flex">
              <input
                id="barcode"
                type="text"
                maxLength={64}
                value={form.barcode}
                onChange={set('barcode')}
                className="flex-grow block text-gray-700 p-2 w-full focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 border border-gray-200 rounded-l-md "
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, barcode: generateEan13() }))}
                className="px-3 py-2 bg-gray-200 text-gray-700 border border-l-0 border-gray-200 rounded-r-md hover:bg-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 cursor-pointer"
              >
                Generate
              </button>
            </div>
          </Field>
          <div>
            <label className="block text-sm font-medium text-gray-600">Status</label>
            <div className="mt-3">
              <Toggle name="status" checked={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v }))} />
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Product Description
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
          <CancelButton onClick={() => navigate('/admin/products')} />
          <SubmitButton isLoading={saving} mode={id ? 'edit' : 'create'} />
        </div>
      </form>
    </div>
  );
}
