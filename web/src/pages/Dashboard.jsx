import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Box, Calendar, CircleAlert, Clock, FolderTree, PackageX, ReceiptText, Users, Wallet } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney } from '../auth.jsx';
import { Loader, StatusBadge } from '../components/ui.jsx';

function Stat({ icon, label, value, tone = 'purple' }) {
  const tones = {
    purple: 'bg-purple-50 border border-purple-300 text-purple-600',
    green: 'bg-green-50 border border-green-300 text-green-700',
    blue: 'bg-blue-50 border border-blue-300 text-blue-700',
    yellow: 'bg-yellow-50 border border-yellow-300 text-yellow-700',
    red: 'bg-red-50 border border-red-300 text-red-700',
  };
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tones[tone]}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-600">{label}</p>
        <p className="font-bold text-gray-950">{value}</p>
      </div>
    </div>
  );
}

function Card({ title, icon, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-500 text-white">{icon}</div>
        <h2 className="text-lg font-bold text-gray-950">{title}</h2>
      </div>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

const hoursLeft = (d) => Math.max(0, Math.round((new Date(d) - Date.now()) / 36e5));

export default function Dashboard() {
  const { user, can } = useAuth();
  const money = useMoney();
  const [data, setData] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    api.get('/dashboard').then((r) => setData(r.data)).catch(() => setData({}));
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-4">
      <h1 className="text-2xl font-bold text-gray-600">Dashboard</h1>
      <div className="bg-purple-600 text-white rounded-lg p-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">
            {greeting}, {user?.firstName} {user?.lastName}
          </h2>
          <p className="mt-1">Welcome back! Stay on top of your products and invoices today.</p>
          <div className="flex items-center gap-4 mt-3 text-sm">
            <span className="flex items-center gap-1">
              <Calendar size={16} /> {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={16} /> {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <img src="/static/dashboard-img.svg" alt="" className="hidden md:block h-24" />
      </div>

      {!data ? (
        <Loader />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {data.products && (
              <Card title="Inventory" icon={<Box size={20} />}>
                <Stat icon={<Box size={18} />} label="Products" value={data.products.total} />
                {data.categories !== undefined && <Stat icon={<FolderTree size={18} />} label="Categories" value={data.categories} tone="green" />}
                <Stat icon={<CircleAlert size={18} />} label="Low Stock (≤5)" value={data.products.low_stock} tone="yellow" />
                <Stat icon={<PackageX size={18} />} label="Out of Stock" value={data.products.out_of_stock} tone="red" />
              </Card>
            )}
            {data.invoices && (
              <Card title="Sales (live invoices)" icon={<ReceiptText size={20} />}>
                <Stat icon={<ReceiptText size={18} />} label="Invoices" value={data.invoices.total} />
                <Stat icon={<Wallet size={18} />} label="Total Sales" value={money(data.invoices.amount, 0)} tone="green" />
                <Stat icon={<Wallet size={18} />} label="Paid Amount" value={money(data.invoices.paid, 0)} tone="blue" />
                <Stat icon={<CircleAlert size={18} />} label="Amount Due" value={money(data.invoices.amount - data.invoices.paid, 0)} tone="red" />
              </Card>
            )}
            {(data.products || data.users !== undefined) && (
              <Card title="Overview" icon={<Users size={20} />}>
                {data.products && <Stat icon={<Wallet size={18} />} label="Stock Value (Cost)" value={money(data.products.stock_value, 0)} />}
                {data.users !== undefined && <Stat icon={<Users size={18} />} label="Staff Users" value={data.users} tone="blue" />}
              </Card>
            )}
          </div>

          {data.invoices?.stuck > 0 && (
            <div className="p-3 text-sm text-red-700 bg-red-100 border border-red-300 rounded-lg">
              {data.invoices.stuck} invoice(s) are past their retention window but could not be emailed to the archive address, so they have not been deleted.
              Check <Link to="/admin/settings/email-settings" className="underline font-semibold">Email Settings</Link>.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.recentInvoices && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-bold text-gray-950">Recent Invoices</h2>
                  <Link to="/admin/invoices" className="text-sm text-purple-600 font-medium">
                    View all →
                  </Link>
                </div>
                {data.recentInvoices.length === 0 && <p className="text-sm text-gray-500">No invoices right now.</p>}
                {data.recentInvoices.map((i) => (
                  <Link key={i.id} to={`/admin/invoices/view/${i.id}`} className="flex justify-between items-center py-2 border-b border-gray-100 text-sm hover:bg-gray-50">
                    <span>
                      <span className="font-semibold text-gray-950">{i.invoice_number}</span> <span className="text-gray-500">· {i.customer_name}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{hoursLeft(i.expires_at)}h left</span>
                      <StatusBadge status={i.status} />
                      <span className="font-semibold text-gray-950">{money(i.total)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {data.lowStock && can('products') && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-bold text-gray-950">Low Stock</h2>
                  <Link to="/admin/products" className="text-sm text-purple-600 font-medium">
                    View all →
                  </Link>
                </div>
                {data.lowStock.length === 0 && <p className="text-sm text-gray-500">All products are well stocked.</p>}
                {data.lowStock.map((p) => (
                  <div key={p.id} className="flex justify-between py-2 border-b border-gray-100 text-sm">
                    <span className="text-gray-950">{p.name}</span>
                    <span className={`font-semibold ${p.quantity <= 0 ? 'text-red-600' : 'text-yellow-700'}`}>{p.quantity} left</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
