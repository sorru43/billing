// Permission modules, grouped the way the Role Permissions screen shows them.
// `actions` limits a row to some of view / create / edit / delete; a group's `labels` renames a column
// (Reports: "create" is "Send by Email").
export const MODULE_GROUPS = [
  { moduleName: 'Main', children: [{ slug: 'dashboard', moduleName: 'Dashboard' }] },
  {
    moduleName: 'Inventory & Sales',
    children: [
      { slug: 'products', moduleName: 'Products' },
      { slug: 'customers', moduleName: 'Customers' },
      { slug: 'categories', moduleName: 'Categories & Brands' },
      { slug: 'returns', moduleName: 'Returns' },
      { slug: 'receiving', moduleName: 'Receiving Inventory & Vendors' },
      { slug: 'import_export', moduleName: 'Import / Export (products & customers)' },
    ],
  },
  {
    moduleName: 'Invoices',
    children: [
      // Making invoices. Seeing, editing and deleting them is per status, on the two rows below
      // (auth.js derives "invoices" view / edit / delete from them for the older checks).
      { slug: 'invoices', moduleName: 'New invoices', createOnly: true, actions: ['create'], note: 'Make and print invoices. Seeing the invoice list needs View on Unpaid or Paid below.' },
      { slug: 'invoices_unpaid', moduleName: 'Unpaid invoices', actions: ['view', 'edit', 'delete'], note: 'Includes part-paid invoices. Edit also covers taking a payment on them.' },
      { slug: 'invoices_paid', moduleName: 'Paid invoices', actions: ['view', 'edit', 'delete'] },
      { slug: 'payment_history', moduleName: 'Payment History', actions: ['view'], note: 'Every payment received from customers.' },
      // Without this, staff can open an invoice only right after creating it (until the first print,
      // or 30 minutes) or after an admin approves their request. Only "view" applies.
      { slug: 'invoice_history', moduleName: 'See past invoices (no admin approval needed)', actions: ['view'] },
      // Without it (view only), the invoice screen sets prices by itself and the server holds to it
      // (invoices.js, applyPriceRules): each line gets the customer's own price, else the price of the
      // customer's level. The level itself is never chosen on an invoice: it is set on the customer.
      {
        slug: 'invoice_prices',
        moduleName: 'Change prices on invoices',
        actions: ['view'],
        note: "Type a different price on an invoice line. For a saved customer it is kept as their own price for next time.",
      },
    ],
  },
  {
    // One row per report. View = open it on screen, "Send by Email" (create) = email it as PDF + CSV.
    // Reports are never stored, so there is nothing to edit or delete. auth.js derives "reports"
    // view / create (the Reports page itself) from these rows.
    moduleName: 'Reports',
    labels: { create: 'Send by Email' },
    children: [
      { slug: 'report_sales', moduleName: 'Sales', actions: ['view', 'create'] },
      { slug: 'report_unpaid', moduleName: 'Unpaid invoices', actions: ['view', 'create'] },
      { slug: 'report_paid', moduleName: 'Paid invoices', actions: ['view', 'create'] },
      { slug: 'report_inventory', moduleName: 'Inventory', actions: ['view', 'create'] },
      { slug: 'report_low_stock', moduleName: 'Low stock', actions: ['view', 'create'] },
      { slug: 'report_out_of_stock', moduleName: 'Out of stock', actions: ['view', 'create'] },
      { slug: 'report_price_list', moduleName: 'Price list', actions: ['view', 'create'] },
    ],
  },
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

// Invoice rights per status: an invoice with any balance owed (unpaid or part-paid) is "unpaid".
export const INVOICE_STATUS_SLUGS = ['invoices_unpaid', 'invoices_paid'];
export const invoiceSlug = (status) => (status === 'paid' ? 'invoices_paid' : 'invoices_unpaid');

// Report type (routes/reports.js) -> its permission row.
export const REPORT_SLUGS = {
  sales: 'report_sales',
  unpaid: 'report_unpaid',
  paid: 'report_paid',
  inventory: 'report_inventory',
  'low-stock': 'report_low_stock',
  'out-of-stock': 'report_out_of_stock',
  'price-list': 'report_price_list',
};
