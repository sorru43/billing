import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  ArrowDownUp, Box, ChartNoAxesColumn, Contact, ChevronDown, CircleUserRound, House, KeyRound, LogOut, Menu, Plus, ReceiptText, Settings, ShieldHalf, UserRound,
} from 'lucide-react';
import { useAuth, Logo } from '../auth.jsx';

const MENU = [
  { type: 'header', title: 'Main' },
  { type: 'link', to: '/admin', icon: <House size={16} />, title: 'Dashboard', slug: 'dashboard' },
  { type: 'header', title: 'Inventory & Sales' },
  {
    type: 'collapsible',
    id: 'products',
    icon: <Box size={16} />,
    title: 'Product / Services',
    children: [
      { to: '/admin/products', title: 'Products', slug: 'products', addPath: '/admin/products/new' },
      { to: '/admin/matrix', title: 'Matrix Items', slug: 'products', addPath: '/admin/matrix/new' },
      { to: '/admin/categories', title: 'Categories', slug: 'categories' },
    ],
  },
  { type: 'link', to: '/admin/customers', icon: <Contact size={16} />, title: 'Customers', slug: 'customers' },
  {
    type: 'link',
    to: '/admin/invoices',
    icon: <ReceiptText size={16} />,
    title: 'Invoices',
    slug: 'invoices',
    addPath: '/admin/invoices/create-invoice',
  },
  {
    type: 'link',
    to: '/admin/import-export',
    icon: <ArrowDownUp size={16} />,
    title: 'Import / Export',
    slug: null,
    check: (can) => can('products') || can('customers'),
  },
  { type: 'header', title: 'Roles & Permissions' },
  {
    type: 'collapsible',
    id: 'roles',
    icon: <ShieldHalf size={16} />,
    title: 'Roles & Permissions',
    children: [
      { to: '/admin/users', title: 'Users', slug: 'users' },
      { to: '/admin/roles', title: 'Roles & Permissions', slug: 'roles' },
    ],
  },
  { type: 'header', title: 'Reports' },
  { type: 'link', to: '/admin/reports', icon: <ChartNoAxesColumn size={16} />, title: 'Reports', slug: 'reports' },
  { type: 'header', title: 'Settings' },
  {
    type: 'collapsible',
    id: 'settings',
    icon: <Settings size={16} />,
    title: 'Settings',
    children: [
      { to: '/admin/settings/company-settings', title: 'Company Settings', slug: 'settings' },
      { to: '/admin/settings/profile', title: 'Profile', slug: null },
    ],
  },
];

const linkCls = (active) =>
  `flex items-center p-2 my-1 text-sm font-medium rounded-lg transition-colors duration-200 relative ${
    active ? 'bg-purple-100 text-purple-600 border-l-4 border-purple-600' : 'text-gray-600 hover:bg-gray-100 border-l-4 border-transparent'
  }`;
const subLinkCls = ({ isActive }) =>
  `block py-2 px-2 text-sm font-medium rounded-md transition-colors duration-200 relative ${
    isActive ? 'bg-purple-100 text-purple-600 border-l-4 border-purple-600' : 'text-gray-600 hover:bg-gray-100 border-l-4 border-transparent'
  }`;
const addBtnCls = (group) =>
  `absolute right-0 top-0 h-full w-8 flex items-center justify-center bg-purple-600 text-white rounded-r-lg opacity-0 ${group} transition-opacity`;

function Sidebar({ isOpen }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { can, logout } = useAuth();

  const items = useMemo(() => {
    const visible = MENU.map((item) => {
      if (item.type === 'link') {
        if (item.check) return item.check(can) ? item : null;
        return can(item.slug) ? item : null;
      }
      if (item.type === 'collapsible') {
        const children = item.children.filter((c) => !c.slug || can(c.slug));
        return children.length ? { ...item, children } : null;
      }
      return item;
    }).filter(Boolean);
    // Drop section headers that have nothing under them.
    return visible.filter((item, i) => item.type !== 'header' || (visible[i + 1] && visible[i + 1].type !== 'header'));
  }, [can]);

  const activeGroup = items.find((i) => i.type === 'collapsible' && i.children.some((c) => pathname.startsWith(c.to)))?.id;
  const [open, setOpen] = useState({});
  useEffect(() => {
    if (activeGroup) setOpen({ [activeGroup]: true });
  }, [activeGroup]);

  let headerIndex = 0;
  return (
    <aside
      className={`bg-gray-50 text-gray-950 flex flex-col transition-all duration-300 ease-in-out z-0 border-r border-gray-200 shrink-0 ${
        isOpen ? 'w-60' : 'w-0 md:w-20 overflow-hidden'
      }`}
    >
      <div className="p-4 flex items-center h-12">
        <span
          onClick={() => navigate('/admin')}
          className={`text-xl font-medium ml-2 text-gray-950 transition-opacity duration-200 whitespace-nowrap cursor-pointer ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        >
          <Logo kind="dashboard" />
        </span>
      </div>
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {items.map((item) => {
          if (item.type === 'header') {
            const first = headerIndex++ === 0;
            return (
              <p
                key={item.title}
                className={`${first ? '' : 'mt-4 pt-2 border-t border-gray-200'} mb-1 text-xs font-medium text-gray-400 uppercase tracking-wider transition-opacity duration-300 ease-in-out ${
                  isOpen ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {item.title}
              </p>
            );
          }
          if (item.type === 'link') {
            const active = item.to === '/admin' ? pathname === '/admin' || pathname === '/admin/dashboard' : pathname.startsWith(item.to);
            return (
              <div key={item.to} className="relative group">
                <Link to={item.to} className={linkCls(active)}>
                  <div className="flex items-center">
                    {item.icon}
                    <span className={`ml-2 transition-opacity font-medium duration-300 whitespace-nowrap ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                      {item.title}
                    </span>
                  </div>
                </Link>
                {isOpen && item.addPath && can(item.slug, 'create') && (
                  <Link to={item.addPath} className={addBtnCls('group-hover:opacity-100')} aria-label={`New ${item.title}`}>
                    <Plus size={18} />
                  </Link>
                )}
              </div>
            );
          }
          const isExpanded = open[item.id] || false;
          return (
            <div key={item.id} className="relative group">
              <button
                onClick={() => setOpen((o) => ({ [item.id]: !o[item.id] }))}
                className={`ml-1 flex items-center justify-between w-full text-sm font-medium rounded-lg transition-colors duration-300 text-left p-2 my-1 cursor-pointer ${
                  activeGroup === item.id && isOpen ? 'bg-gray-100 text-gray-800' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center">
                  {item.icon}
                  <span className={`ml-2 transition-opacity duration-300 whitespace-nowrap font-medium ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    {item.title}
                  </span>
                </div>
                {isOpen && <ChevronDown size={16} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />}
              </button>
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded && isOpen ? 'max-h-screen' : 'max-h-0'}`}>
                <div className="space-y-1" style={{ paddingLeft: '1.5rem' }}>
                  {item.children.map((c) => (
                    <div key={c.to} className="relative group/subitem">
                      <NavLink to={c.to} className={subLinkCls}>
                        <span>{c.title}</span>
                      </NavLink>
                      {c.addPath && can(c.slug, 'create') && (
                        <Link to={c.addPath} className={addBtnCls('group-hover/subitem:opacity-100')} aria-label={`New ${c.title}`}>
                          <Plus size={18} />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
      {isOpen && (
        <div className="bottom-0 px-6 py-2 bg-gray-50 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <LogOut
              size={36}
              onClick={logout}
              aria-label="Logout"
              className="text-purple-600 p-2 rounded-lg cursor-pointer bg-gray-200 hover:bg-gray-300 transition-all"
            />
            {can('settings') && (
              <Settings
                size={36}
                onClick={() => navigate('/admin/settings/company-settings')}
                aria-label="Settings"
                className="text-purple-600 p-2 rounded-lg cursor-pointer bg-gray-200 hover:bg-gray-300 transition-all"
              />
            )}
            <CircleUserRound
              size={36}
              onClick={() => navigate('/admin/settings/profile')}
              aria-label="Profile"
              className="text-purple-600 p-2 rounded-lg cursor-pointer bg-gray-200 hover:bg-gray-300 transition-all"
            />
          </div>
        </div>
      )}
    </aside>
  );
}

function Header({ toggleSidebar }) {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [quick, setQuick] = useState(false);
  const [menu, setMenu] = useState(false);
  const quickItems = [
    can('invoices', 'create') && { label: 'New Invoice', icon: <ReceiptText size={18} />, to: '/admin/invoices/create-invoice' },
    can('products', 'create') && { label: 'New Product', icon: <Box size={18} />, to: '/admin/products/new' },
  ].filter(Boolean);

  return (
    <header className="flex items-center justify-between px-4 py-1 bg-white shadow z-0">
      <div className="flex items-center">
        <button onClick={toggleSidebar} className="text-gray-500 focus:outline-none cursor-pointer" aria-label="Toggle sidebar">
          <Menu className="w-6 h-6" />
        </button>
      </div>
      <div className="flex items-center space-x-2">
        {quickItems.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setQuick(!quick)}
              className="hidden md:flex items-center justify-center w-10 h-10 bg-purple-600 text-white rounded-full hover:bg-gray-950 transition cursor-pointer"
              aria-label="Quick add"
            >
              <Plus size={24} />
            </button>
            {quick && (
              <div className="absolute right-0 mt-2 w-44 bg-white shadow-lg rounded-lg border border-gray-100 z-50" onMouseLeave={() => setQuick(false)}>
                {quickItems.map((d) => (
                  <button
                    key={d.label}
                    onClick={() => {
                      setQuick(false);
                      navigate(d.to);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                  >
                    {d.icon}
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="relative">
          <button
            onClick={() => setMenu(!menu)}
            className="flex items-center space-x-2 focus:outline-none rounded-full p-1 cursor-pointer"
            aria-expanded={menu}
            aria-haspopup="true"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-500 text-white rounded-full flex items-center justify-center text-lg font-semibold">
              <CircleUserRound className="w-6 h-6" />
            </div>
          </button>
          {menu && (
            <div
              className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg ring-1 ring-black/5 divide-y divide-gray-100 z-50"
              onMouseLeave={() => setMenu(false)}
              role="menu"
            >
              <div className="px-4 py-3">
                <p className="text-sm font-medium text-gray-950 truncate">{`${user?.firstName || ''} ${user?.lastName || ''}`.trim()}</p>
                <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                {user?.roleName && <p className="text-xs text-purple-600 truncate mt-0.5">{user.roleName}</p>}
              </div>
              <div className="py-1">
                <Link
                  to="/admin/settings/profile"
                  onClick={() => setMenu(false)}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md mx-2 transition-colors duration-200"
                  role="menuitem"
                >
                  <UserRound className="w-4 h-4 mr-3 text-gray-400" />
                  Profile
                </Link>
                <Link
                  to="/admin/settings/profile#change-login"
                  onClick={() => setMenu(false)}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md mx-2 transition-colors duration-200"
                  role="menuitem"
                >
                  <KeyRound className="w-4 h-4 mr-3 text-gray-400" />
                  Change Login
                </Link>
                <button
                  onClick={logout}
                  className="w-[calc(100%-1rem)] flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md mx-2 transition-colors duration-200 cursor-pointer"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4 mr-3 text-gray-400" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function Layout() {
  const [isOpen, setIsOpen] = useState(true);
  useEffect(() => {
    const onResize = () => setIsOpen(window.innerWidth >= 768);
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <div className="flex h-screen bg-white font-sans">
      <Sidebar isOpen={isOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header toggleSidebar={() => setIsOpen((o) => !o)} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
