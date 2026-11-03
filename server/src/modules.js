// Permission modules, grouped the way the Role Permissions screen shows them.
export const MODULE_GROUPS = [
  { moduleName: 'Main', children: [{ slug: 'dashboard', moduleName: 'Dashboard' }] },
  {
    moduleName: 'Inventory & Sales',
    children: [
      { slug: 'products', moduleName: 'Products' },
      { slug: 'categories', moduleName: 'Categories' },
      { slug: 'invoices', moduleName: 'Invoices' },
    ],
  },
  { moduleName: 'Reports', children: [{ slug: 'reports', moduleName: 'Reports (send by email)' }] },
  {
    moduleName: 'Roles & Permissions',
    children: [
      { slug: 'users', moduleName: 'Users' },
      { slug: 'roles', moduleName: 'Roles & Permissions' },
    ],
  },
  { moduleName: 'Settings', children: [{ slug: 'settings', moduleName: 'Company & Email Settings' }] },
];

export const MODULE_SLUGS = MODULE_GROUPS.flatMap((g) => g.children.map((c) => c.slug));
export const ACTIONS = ['view', 'create', 'edit', 'delete'];
