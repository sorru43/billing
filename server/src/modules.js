// Permission modules, grouped the way the Role Permissions screen shows them.
export const MODULE_GROUPS = [
  { moduleName: 'Main', children: [{ slug: 'dashboard', moduleName: 'Dashboard' }] },
  {
    moduleName: 'Inventory & Sales',
    children: [
      { slug: 'products', moduleName: 'Products' },
      { slug: 'customers', moduleName: 'Customers' },
      { slug: 'categories', moduleName: 'Categories & Brands' },
      // createOnly: "Create" may be given without "View" — a cashier who makes and prints invoices but
      // never sees the invoice list. For every other module any right implies seeing it.
      { slug: 'invoices', moduleName: 'Invoices', createOnly: true, note: 'Create without View = cashier: makes and prints invoices, never sees the list' },
      // Without this, staff can open an invoice only right after creating it (until the first print,
      // or 30 minutes) or after an admin approves their request. Only "view" applies.
      { slug: 'invoice_history', moduleName: 'See past invoices (no admin approval needed)', actions: ['view'] },
      // Without these (view only), the invoice screen sets prices by itself and the server holds to it
      // (invoices.js, applyPriceRules): each line gets the customer's own price, else the price level's,
      // and the level is the customer's own (set on the customer), else Selling.
      {
        slug: 'invoice_prices',
        moduleName: 'Change prices on invoices',
        actions: ['view'],
        note: "Type a different price on an invoice line. For a saved customer it is kept as their own price for next time.",
      },
      {
        slug: 'invoice_price_level',
        moduleName: 'Choose the price level on invoices',
        actions: ['view'],
        note: "Without it the Price Level box is hidden: the customer's own level is used, else Selling Price.",
      },
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
