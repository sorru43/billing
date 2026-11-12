import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import { Loader2, Search, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { CancelButton, Field, Loader, SubmitButton, Toggle, inputCls } from '../components/ui.jsx';

const EMPTY = {
  name: '', cost: '', selling_price: '', top_customer_price: '', jobber_price: '', quantity: '0',
  barcode: '', description: '', category_id: '', brand_id: '', status: true, low_stock_alert: '',
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
  const location = useLocation();
  const { can } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupImage, setLookupImage] = useState('');

  useEffect(() => {
    api.get('/categories/options').then((r) => setCategories(r.data)).catch(() => {});
    api.get('/brands/options').then((r) => setBrands(r.data)).catch(() => {});
    if (id) {
      api
        .get(`/products/${id}`)
        .then(({ data }) => {
          // Variants are edited on their matrix item (name and options belong to it).
          if (data.matrix) return navigate(`/admin/matrix/edit/${data.matrix.id}`, { replace: true });
          setForm({
            ...EMPTY,
            ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, data[k] ?? EMPTY[k]])),
            category_id: data.category_id || '',
            brand_id: data.brand_id || '',
          });
        })
        .catch((e) => toast.error(e.message))
        .finally(() => setLoading(false));
    } else if (location.state?.prefill) {
      setForm((f) => ({ ...f, ...location.state.prefill }));
      if (location.state.prefill.image) {
        setLookupImage(location.state.prefill.image);
      }
    }
  }, [id, location.state]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleLookup = async (code = form.barcode) => {
    const b = String(code || '').trim();
    if (!b) {
      toast.info('Please enter or scan a barcode first');
      return;
    }
    setLookingUp(true);
    try {
      const res = await api.get(`/products/lookup-barcode?barcode=${encodeURIComponent(b)}`);
      if (res.data?.found && res.data?.product) {
        const p = res.data.product;
        setForm((f) => ({
          ...f,
          name: p.name || f.name,
          description: p.description || (p.brand ? `Brand: ${p.brand}` : f.description),
          category_id: res.data.matchedCategory?.id || f.category_id,
        }));
        if (p.image) setLookupImage(p.image);
        toast.success(`Found on BarcodeLookup: ${p.name}`);
      } else {
        toast.info(res.data?.message || 'Product not found in Barcode Lookup database');
      }
    } catch (err) {
      if (err.errors?.code === 'NO_API_KEY') {
        toast.error('Barcode Lookup API key is not configured. Please add it in Settings.');
      } else {
        toast.error(err.message || 'Barcode lookup failed');
      }
    } finally {
      setLookingUp(false);
    }
  };

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
          <Field label="Brand" htmlFor="brand_id" error={errors.brand_id}>
            <select id="brand_id" value={form.brand_id || ''} onChange={set('brand_id')} className={`${inputCls} bg-white h-[42px]`}>
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {brands.length === 0 && can('categories', 'create') && (
              <p className="mt-1 text-xs text-gray-500">
                No brands yet.{' '}
                <button type="button" className="text-purple-600 font-semibold cursor-pointer" onClick={() => navigate('/admin/brands')}>
                  Add brands
                </button>
              </p>
            )}
          </Field>
          <Field label="Quantity" required htmlFor="quantity" error={errors.quantity}>
            <input id="quantity" type="number" step="1" required value={form.quantity} onChange={set('quantity')} className={inputCls} />
          </Field>
          <Field label="Low Stock Alert at (blank = 5)" htmlFor="low_stock_alert" error={errors.low_stock_alert}>
            <input
              id="low_stock_alert"
              type="number"
              min="0"
              step="1"
              placeholder="5"
              value={form.low_stock_alert}
              onChange={set('low_stock_alert')}
              className={inputCls}
            />
            <p className="text-xs text-gray-500 mt-1">Alert when stock drops to this many. Set it higher for top sellers and items that take long to arrive.</p>
          </Field>
          {money('cost', 'Cost')}
          {money('selling_price', 'Selling Price')}
          {money('top_customer_price', 'Top Customer Price')}
          {money('jobber_price', 'Jobber Price')}
          <Field label="Barcode" htmlFor="barcode" error={errors.barcode}>
            <div className="mt-1 flex gap-1">
              <input
                id="barcode"
                type="text"
                maxLength={64}
                value={form.barcode}
                onChange={set('barcode')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLookup();
                  }
                }}
                placeholder="Scan or enter barcode"
                className="flex-grow block text-gray-700 p-2 w-full focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 border border-gray-200 rounded-md text-sm"
              />
              <button
                type="button"
                onClick={() => handleLookup()}
                disabled={lookingUp || !form.barcode}
                className="px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-md hover:bg-purple-100 text-xs font-semibold flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-purple-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-2xs"
                title="Lookup product info from BarcodeLookup API"
              >
                {lookingUp ? <Loader2 size={14} className="animate-spin text-purple-600" /> : <Sparkles size={14} className="text-purple-600" />}
                <span>{lookingUp ? 'Fetching...' : 'Lookup API'}</span>
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, barcode: generateEan13() }))}
                className="px-2.5 py-2 bg-gray-100 text-gray-700 border border-gray-200 rounded-md hover:bg-gray-200 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-purple-600 cursor-pointer whitespace-nowrap"
                title="Generate standard EAN-13 barcode"
              >
                Generate
              </button>
            </div>
            {lookupImage && (
              <div className="mt-2 flex items-center gap-2 p-2 bg-purple-50/50 border border-purple-100 rounded-md text-xs text-purple-900">
                <img src={lookupImage} alt="Product preview" className="w-9 h-9 object-contain rounded bg-white border border-gray-200" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{form.name || 'Product photo'}</p>
                  <p className="text-[10px] text-purple-600">Verified via BarcodeLookup</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLookupImage('')}
                  className="text-gray-400 hover:text-gray-600 text-sm leading-none px-1 cursor-pointer"
                >
                  ×
                </button>
              </div>
            )}
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
