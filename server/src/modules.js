// Permission modules, grouped the way the Role Permissions screen shows them.
export const MODULE_GROUPS = [
  { moduleName: 'Main', children: [{ slug: 'dashboard', moduleName: 'Dashboard' }] },
  {
    moduleName: 'Inventory & Sales',
    children: [
      { slug: 'products', moduleName: 'Products' },
      { slug: 'customers', moduleName: 'Customers' },
      { slug: 'categories', moduleName: 'Categories & Brands' },
      { slug: 'invoices', moduleName: 'Invoices' },
      // Without this, staff can open an invoice only right after creating it (until the first print,
      // or 30 minutes) or after an admin approves their request. Only "view" applies.
      { slug: 'invoice_history', moduleName: 'See past invoices (no admin approval needed)', actions: ['view'] },
      { slug: 'returns', moduleName: 'Returns' },
      { slug: 'receiving', moduleName: 'Receiving Inventory & Vendors' },
      { slug: 'import_export', moduleName: 'Import / Export (products & customers)' },
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
