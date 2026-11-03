import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { ChartNoAxesColumn, FileText, Mail, PackageX, ReceiptText, ShieldCheck, Tags, TriangleAlert } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, Loader, SubmitButton, inputCls } from '../components/ui.jsx';

const ICONS = {
  sales: <ReceiptText size={20} />,
  inventory: <ChartNoAxesColumn size={20} />,
  'low-stock': <TriangleAlert size={20} />,
  'out-of-stock': <PackageX size={20} />,
  'price-list': <Tags size={20} />,
};
const DESCRIPTIONS = {
  sales: 'Invoices in a date range with totals, paid and unpaid amounts.',
  inventory: 'Every product with quantity on hand and stock value at cost and selling price.',
  'low-stock': 'Products that are running low, below a threshold you choose.',
  'out-of-stock': 'Products with no stock left.',
  'price-list': 'Active products with their Selling, Top Customer and Jobber prices.',
};

export default function Reports() {
  const { can } = useAuth();
  const [types, setTypes] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ type: 'sales', to: '', from: '', until: '', categoryId: '', threshold: 5 });
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    api.get('/reports/types').then(({ data }) => {
      setTypes(data.types);
      setForm((f) => ({ ...f, to: data.defaultRecipient || '' }));
    }).catch((e) => toast.error(e.message));
    api.get('/categories/options').then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    setErrors({});
    try {
      const r = await api.post('/reports/send', form);
      toast.success(r.message);
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!types) return <Loader className="h-64" />;
  const isProductReport = form.type !== 'sales';
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-600">Reports</h1>
      <div className="p-3 text-sm bg-purple-50 border border-purple-200 rounded-md text-gray-700 flex items-start gap-2">
        <ShieldCheck size={18} className="text-purple-600 shrink-0 mt-0.5" />
        <span>Reports are never saved in the app. Each one is generated on request, emailed as a PDF and a CSV, and then discarded.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Object.entries(types).map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => setForm((f) => ({ ...f, type: key }))}
            className={`text-left relative bg-white rounded-xl shadow-sm hover:shadow-md transition-all p-4 border cursor-pointer ${
              form.type === key ? 'border-purple-600 ring-1 ring-purple-600' : 'border-gray-100'
            }`}
          >
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-950">{label}</h3>
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border ${
                  form.type === key ? 'border-purple-300 bg-purple-50 text-purple-600' : 'border-green-300 bg-green-50 text-green-600'
                }`}
              >
                {ICONS[key]}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">{DESCRIPTIONS[key]}</p>
          </button>
        ))}
      </div>

      <form onSubmit={send} className="p-4 bg-white border border-gray-200 rounded-lg space-y-4">
        <h2 className="text-lg font-bold text-gray-950 flex items-center gap-2">
          <FileText size={18} /> {types[form.type]}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {form.type === 'sales' && (
            <>
              <Field label="From Date" htmlFor="r-from">
                <input id="r-from" type="date" value={form.from} onChange={set('from')} className={inputCls} />
              </Field>
              <Field label="To Date" htmlFor="r-until">
                <input id="r-until" type="date" min={form.from} value={form.until} onChange={set('until')} className={inputCls} />
              </Field>
            </>
          )}
          {isProductReport && (
            <Field label="Category" htmlFor="r-cat">
              <select id="r-cat" value={form.categoryId} onChange={set('categoryId')} className={`${inputCls} bg-white h-[42px]`}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {form.type === 'low-stock' && (
            <Field label="Low Stock Threshold" htmlFor="r-th" error={errors.threshold}>
              <input id="r-th" type="number" min="0" value={form.threshold} onChange={set('threshold')} className={inputCls} />
            </Field>
          )}
          <Field label="Send To" required htmlFor="r-to" error={errors.to}>
            <input id="r-to" type="email" required value={form.to} onChange={set('to')} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end">
          {can('reports', 'create') ? (
            <SubmitButton isLoading={sending} icon={<Mail size={16} />}>
              {sending ? 'Sending...' : 'Email Report'}
            </SubmitButton>
          ) : (
            <p className="text-sm text-gray-500">Your role can view this page but cannot send reports.</p>
          )}
        </div>
      </form>
    </div>
  );
}
