import { createContext, useContext, useEffect, useState } from 'react';

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

export const translations = {
  en: {
    // Navigation & Main
    'nav.main': 'Main',
    'nav.dashboard': 'Dashboard',
    'nav.inventory_sales': 'Inventory & Sales',
    'nav.products_services': 'Product / Services',
    'nav.products': 'Products',
    'nav.matrix_items': 'Matrix Items',
    'nav.categories': 'Categories',
    'nav.brands': 'Brands',
    'nav.customers': 'Customers',
    'nav.invoices': 'Invoices',
    'nav.returns': 'Returns',
    'nav.receiving_inventory': 'Receiving Inventory',
    'nav.receivings': 'Receivings',
    'nav.purchase_orders': 'Purchase Orders',
    'nav.vendors': 'Vendors',
    'nav.import_export': 'Import / Export',
    'nav.roles_permissions': 'Roles & Permissions',
    'nav.users': 'Users',
    'nav.roles': 'Roles & Permissions',
    'nav.reports': 'Reports',
    'nav.settings': 'Settings',
    'nav.company_settings': 'Company Settings',
    'nav.profile': 'Profile',
    'nav.logout': 'Logout',
    'nav.new_invoice': 'New Invoice',
    'nav.new_product': 'New Product',

    // Common Actions
    'action.save': 'Save',
    'action.saving': 'Saving...',
    'action.cancel': 'Cancel',
    'action.edit': 'Edit',
    'action.delete': 'Delete',
    'action.actions': 'Actions',
    'action.search': 'Search',
    'action.filter': 'Filter',
    'action.print': 'Print',
    'action.email': 'Email',
    'action.export': 'Export',
    'action.import': 'Import',
    'action.done': 'Done',
    'action.close': 'Close',
    'action.add_row': 'Add New Row',
    'action.scan_barcode': 'Scan Barcode',
    'action.lookup_api': 'Lookup API',
    'action.generate': 'Generate',
    'action.confirm': 'Confirm',
    'action.download': 'Download',

    // Invoices
    'inv.new_invoice': 'New Invoice',
    'inv.invoice_number': 'Invoice Number',
    'inv.invoice_date': 'Invoice Date',
    'inv.customer': 'Customer',
    'inv.price_level': 'Price Level',
    'inv.item': 'Item',
    'inv.description': 'Description',
    'inv.quantity': 'Quantity',
    'inv.price': 'Price ($)',
    'inv.total': 'Total',
    'inv.subtotal': 'Subtotal',
    'inv.discount': 'Discount',
    'inv.tax': 'Tax',
    'inv.notes': 'Additional Notes',
    'inv.invoice_total': 'Invoice Total',
    'inv.payment': 'Payment',
    'inv.not_paid': 'Not Paid (Credit / Owed)',
    'inv.cash': 'Cash',
    'inv.check': 'Check',
    'inv.check_num': 'Check # (optional)',
    'inv.zelle': 'Zelle',
    'inv.card': 'Card',
    'inv.full': 'Full',
    'inv.total_paid': 'Total Paid',
    'inv.balance_due': 'Balance Due',
    'inv.change': 'Change',
    'inv.status': 'Payment Status',
    'inv.status_unpaid': 'Unpaid',
    'inv.status_paid': 'Paid in Full',
    'inv.status_partial': 'Partial Payment',
    'inv.save_unpaid': 'Save as Unpaid',
    'inv.mark_paid': 'Mark as Paid',
    'inv.mark_unpaid': 'Mark as Unpaid',
    'inv.payment_option': 'Payment Option',
    'inv.payment_entered': 'Payment entered',
    'inv.search_customer': 'Search customer by name or phone...',
    'inv.add_new_customer': 'Add New Customer',
    'inv.extra_info': 'Extra Information',

    // Customers
    'cust.customers': 'Customers',
    'cust.new_customer': 'New Customer',
    'cust.name': 'Customer Name',
    'cust.phone': 'Phone',
    'cust.email': 'Email',
    'cust.address': 'Address',
    'cust.total_sales': 'Total Sales',
    'cust.total_owed': 'Total Owed',
    'cust.balance': 'Balance',
    'cust.settle_balance': 'Settle Balance / Receive Payment',
    'cust.payment_history': 'Payment History',
    'cust.invoices': 'Invoices',

    // Products
    'prod.products': 'Products',
    'prod.new_product': 'New Product',
    'prod.name': 'Product Name',
    'prod.barcode': 'Barcode',
    'prod.category': 'Category',
    'prod.brand': 'Brand',
    'prod.cost': 'Cost',
    'prod.selling_price': 'Selling Price',
    'prod.top_customer_price': 'Top Customer Price',
    'prod.jobber_price': 'Jobber Price',
    'prod.stock': 'Stock',
    'prod.in_stock': 'in stock',
    'prod.alert_at': 'Alert at',
    'prod.status': 'Status',
    'prod.active': 'Active',
    'prod.inactive': 'Inactive',

    // Language
    'lang.language': 'Language',
    'lang.english': 'English',
    'lang.french': 'Français',
  },
  fr: {
    // Navigation & Main
    'nav.main': 'Principal',
    'nav.dashboard': 'Tableau de bord',
    'nav.inventory_sales': 'Stock & Ventes',
    'nav.products_services': 'Produits & Services',
    'nav.products': 'Produits',
    'nav.matrix_items': 'Articles matriciels',
    'nav.categories': 'Catégories',
    'nav.brands': 'Marques',
    'nav.customers': 'Clients',
    'nav.invoices': 'Factures',
    'nav.returns': 'Retours',
    'nav.receiving_inventory': 'Réception de stock',
    'nav.receivings': 'Réceptions',
    'nav.purchase_orders': 'Bons de commande',
    'nav.vendors': 'Fournisseurs',
    'nav.import_export': 'Importer / Exporter',
    'nav.roles_permissions': 'Rôles & Permissions',
    'nav.users': 'Utilisateurs',
    'nav.roles': 'Rôles & Permissions',
    'nav.reports': 'Rapports',
    'nav.settings': 'Paramètres',
    'nav.company_settings': "Paramètres de l'entreprise",
    'nav.profile': 'Profil',
    'nav.logout': 'Déconnexion',
    'nav.new_invoice': 'Nouvelle facture',
    'nav.new_product': 'Nouveau produit',

    // Common Actions
    'action.save': 'Enregistrer',
    'action.saving': 'Enregistrement...',
    'action.cancel': 'Annuler',
    'action.edit': 'Modifier',
    'action.delete': 'Supprimer',
    'action.actions': 'Actions',
    'action.search': 'Rechercher',
    'action.filter': 'Filtrer',
    'action.print': 'Imprimer',
    'action.email': 'Envoyer par email',
    'action.export': 'Exporter',
    'action.import': 'Importer',
    'action.done': 'Terminé',
    'action.close': 'Fermer',
    'action.add_row': 'Ajouter une ligne',
    'action.scan_barcode': 'Scanner code-barres',
    'action.lookup_api': 'Rechercher API',
    'action.generate': 'Générer',
    'action.confirm': 'Confirmer',
    'action.download': 'Télécharger',

    // Invoices
    'inv.new_invoice': 'Nouvelle facture',
    'inv.invoice_number': 'N° de facture',
    'inv.invoice_date': 'Date de facturation',
    'inv.customer': 'Client',
    'inv.price_level': 'Niveau de prix',
    'inv.item': 'Article',
    'inv.description': 'Description',
    'inv.quantity': 'Quantité',
    'inv.price': 'Prix unitaire ($)',
    'inv.total': 'Total',
    'inv.subtotal': 'Sous-total',
    'inv.discount': 'Remise',
    'inv.tax': 'Taxe',
    'inv.notes': 'Notes / Conditions',
    'inv.invoice_total': 'Total de la facture',
    'inv.payment': 'Paiement',
    'inv.not_paid': 'Non payé (À crédit)',
    'inv.cash': 'Espèces',
    'inv.check': 'Chèque',
    'inv.check_num': 'N° de chèque (optionnel)',
    'inv.zelle': 'Virement / Zelle',
    'inv.card': 'Carte bancaire',
    'inv.full': 'Tout',
    'inv.total_paid': 'Total payé',
    'inv.balance_due': 'Solde dû',
    'inv.change': 'Monnaie rendue',
    'inv.status': 'Statut du paiement',
    'inv.status_unpaid': 'Impayé',
    'inv.status_paid': 'Payé intégralement',
    'inv.status_partial': 'Paiement partiel',
    'inv.save_unpaid': 'Enregistrer comme impayé',
    'inv.mark_paid': 'Marquer comme payé',
    'inv.mark_unpaid': 'Marquer comme impayé',
    'inv.payment_option': 'Option de paiement',
    'inv.payment_entered': 'Paiement saisi',
    'inv.search_customer': 'Rechercher client par nom ou tél...',
    'inv.add_new_customer': 'Ajouter un client',
    'inv.extra_info': 'Informations complémentaires',

    // Customers
    'cust.customers': 'Clients',
    'cust.new_customer': 'Nouveau client',
    'cust.name': 'Nom du client',
    'cust.phone': 'Téléphone',
    'cust.email': 'Email',
    'cust.address': 'Adresse',
    'cust.total_sales': 'Ventes totales',
    'cust.total_owed': 'Total dû',
    'cust.balance': 'Solde',
    'cust.settle_balance': 'Encaisser un paiement / Régler le solde',
    'cust.payment_history': 'Historique des paiements',
    'cust.invoices': 'Factures',

    // Products
    'prod.products': 'Produits',
    'prod.new_product': 'Nouveau produit',
    'prod.name': 'Nom du produit',
    'prod.barcode': 'Code-barres',
    'prod.category': 'Catégorie',
    'prod.brand': 'Marque',
    'prod.cost': "Coût d'achat",
    'prod.selling_price': 'Prix de vente',
    'prod.top_customer_price': 'Prix client privilégié',
    'prod.jobber_price': 'Prix grossiste / Jobber',
    'prod.stock': 'Stock',
    'prod.in_stock': 'en stock',
    'prod.alert_at': 'Alerte à',
    'prod.status': 'Statut',
    'prod.active': 'Actif',
    'prod.inactive': 'Inactif',

    // Language
    'lang.language': 'Langue',
    'lang.english': 'English',
    'lang.french': 'Français',
  },
};

export function isShowcaseHost() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'billing.wise-hustlers.com' || host === 'localhost' || host === '127.0.0.1';
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem('billing_lang') || 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = (newLang) => {
    setLangState(newLang);
    try {
      localStorage.setItem('billing_lang', newLang);
      document.documentElement.lang = newLang;
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key, fallback) => {
    if (!isShowcaseHost()) return fallback ?? key;
    return translations[lang]?.[key] ?? translations['en']?.[key] ?? fallback ?? key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      lang: 'en',
      setLang: () => {},
      t: (key, fallback) => fallback ?? key,
      languages: LANGUAGES,
    };
  }
  return ctx;
}

export function LanguageSelector({ className = '' }) {
  if (!isShowcaseHost()) return null;
  const { lang, setLang, languages } = useI18n();
  const [open, setOpen] = useState(false);
  const current = languages.find((l) => l.code === lang) || languages[0];

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 transition cursor-pointer shadow-2xs"
        title="Change language / Changer de langue"
      >
        <span className="text-sm">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <span className="sm:hidden uppercase">{current.code}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-1.5 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
            onMouseLeave={() => setOpen(false)}
          >
            {languages.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  setLang(item.code);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left cursor-pointer transition ${
                  lang === item.code
                    ? 'bg-purple-50 text-purple-700 font-bold'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="text-base">{item.flag}</span>
                <span>{item.label}</span>
                {lang === item.code && <span className="ml-auto text-purple-600 font-bold">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
