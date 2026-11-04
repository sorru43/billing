import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loader } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import ProductForm from './pages/ProductForm.jsx';
import Categories from './pages/Categories.jsx';
import Customers from './pages/Customers.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceCreate from './pages/InvoiceCreate.jsx';
import InvoiceView from './pages/InvoiceView.jsx';
import Roles from './pages/Roles.jsx';
import RolePermissions from './pages/RolePermissions.jsx';
import Users from './pages/Users.jsx';
import Reports from './pages/Reports.jsx';
import ImportExport from './pages/ImportExport.jsx';
import { CompanySettings, Profile } from './pages/Settings.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loader className="h-screen" />;
  if (!user) return <Navigate to="/admin/login" state={{ from: location.pathname + location.search }} replace />;
  return children;
}

// UI gate only; the API enforces the same permission on every request.
function Guard({ slug, action = 'view', check, children }) {
  const { can } = useAuth();
  const allowed = check ? check(can) : can(slug, action);
  return allowed ? children : <Navigate to="/admin/unauthorized" replace />;
}

// Staff without dashboard access land on the first page they can open.
function Home() {
  const { can } = useAuth();
  const order = [
    ['dashboard', null],
    ['invoices', '/admin/invoices'],
    ['products', '/admin/products'],
    ['categories', '/admin/categories'],
    ['reports', '/admin/reports'],
    ['users', '/admin/users'],
    ['roles', '/admin/roles'],
    ['settings', '/admin/settings/company-settings'],
  ];
  const first = order.find(([slug]) => can(slug));
  if (!first) return <Navigate to="/admin/settings/profile" replace />;
  return first[1] ? <Navigate to={first[1]} replace /> : <Dashboard />;
}

function Unauthorized() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-full py-24">
      <h1 className="text-4xl font-bold text-gray-800 mb-2">401</h1>
      <p className="text-lg text-gray-600 mb-6">Unauthorized – You don’t have access to this page</p>
      <button
        type="button"
        onClick={() => navigate('/admin')}
        className="px-6 py-2 text-white bg-purple-600 rounded-md hover:bg-gray-950 cursor-pointer"
      >
        Go to Home
      </button>
    </div>
  );
}

const g = (slug, el, action) => (
  <Guard slug={slug} action={action}>
    {el}
  </Guard>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/admin/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route path="dashboard" element={<Navigate to="/admin" replace />} />
            <Route path="products" element={g('products', <Products />)} />
            <Route path="products/new" element={g('products', <ProductForm />, 'create')} />
            <Route path="products/edit/:id" element={g('products', <ProductForm />, 'edit')} />
            <Route path="categories" element={g('categories', <Categories />)} />
            <Route path="customers" element={g('customers', <Customers />)} />
            <Route path="invoices" element={g('invoices', <Invoices />)} />
            <Route path="invoices/create-invoice" element={g('invoices', <InvoiceCreate />, 'create')} />
            <Route path="invoices/view/:id" element={g('invoices', <InvoiceView />)} />
            <Route
              path="import-export"
              element={
                <Guard check={(can) => can('products') || can('customers')}>
                  <ImportExport />
                </Guard>
              }
            />
            <Route path="roles" element={g('roles', <Roles />)} />
            <Route path="roles/permissions/:id" element={g('roles', <RolePermissions />)} />
            <Route path="users" element={g('users', <Users />)} />
            <Route path="reports" element={g('reports', <Reports />)} />
            <Route path="settings/company-settings" element={g('settings', <CompanySettings />)} />
            <Route path="settings/profile" element={<Profile />} />
            <Route path="unauthorized" element={<Unauthorized />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </BrowserRouter>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar theme="light" />
    </AuthProvider>
  );
}
