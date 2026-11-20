import { createContext, useContext, useEffect, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';

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

    // Dashboard & Stats
    'dash.dashboard': 'Dashboard',
    'dash.morning': 'Good Morning',
    'dash.afternoon': 'Good Afternoon',
    'dash.evening': 'Good Evening',
    'dash.welcome': 'Welcome back! Stay on top of your products and invoices today.',
    'dash.change_login': 'Change Login',
    'dash.inventory': 'Inventory',
    'dash.products': 'Products',
    'dash.categories': 'Categories',
    'dash.low_stock': 'Low Stock',
    'dash.out_of_stock': 'Out of Stock',
    'dash.sales': 'Sales (live invoices)',
    'dash.invoices': 'Invoices',
    'dash.total_sales': 'Total Sales',
    'dash.paid_amount': 'Paid Amount',
    'dash.amount_due': 'Amount Due',
    'dash.overview': 'Overview',
    'dash.stock_value': 'Stock Value (Cost)',
    'dash.staff_users': 'Staff Users',
    'dash.recent_invoices': 'Recent Invoices',
    'dash.view_all': 'View all →',
    'dash.no_invoices': 'No invoices yet.',
    'dash.order_now': 'Order now →',
    'dash.well_stocked': 'All products are well stocked.',
    'dash.left': 'left',
    'dash.alert_at': 'alert at',

    // Language
    'lang.language': 'Language',
    'lang.english': 'English',
    'lang.french': 'Français',

    // Statuses
    'status.paid': 'Paid',
    'status.unpaid': 'Unpaid',
    'status.partial': 'Partial',
    'status.draft': 'Draft',
    'status.sent': 'Sent',
    'status.void': 'Void',
    'status.open': 'Open',
    'status.received': 'Received',
    'status.cancelled': 'Cancelled',

    // Login
    'login.welcome': 'Welcome Back',
    'login.signin_desc': 'Sign in to access the dashboard',
    'login.email': 'Email Address',
    'login.password': 'Password',
    'login.remember': 'Remember me',
    'login.button': 'Login',
    'login.logging_in': 'Logging in...',

    // Barcode scanning (New Invoice)
    'scan.start': 'Scan barcodes',
    'scan.stop': 'Stop scanning',
    'scan.box': 'Scan or type a barcode',
    'scan.box_hint': 'Scan barcode (or type + Enter)',
    'scan.ready': 'Ready. Each scan adds 1; scanning the same item again adds 1 more.',
    'scan.sound_on': 'Turn scan beep on',
    'scan.sound_off': 'Turn scan beep off',
    'scan.not_found': 'Product not found',
    'scan.not_found_text': 'No product has this barcode:',
    'scan.inactive': 'Product is turned off',
    'scan.inactive_text': 'is turned off, so it cannot be sold. Turn it on under Products.',
    'scan.no_stock': 'Not enough stock',
    'scan.only': 'only',
    'scan.in_stock': 'in stock',
    'scan.no_stock_text': 'It was not added again. Receive more stock, or allow out-of-stock sales in Settings.',
    'scan.failed': 'Scan failed',
    'scan.ask_manager': 'Ask a manager to add it under Products, or search for the item by name.',
    'scan.next_closes': 'Scanning the next item closes this message.',
    'scan.continue': 'Continue scanning',
    'scan.add_product': 'Add as new product',
    'scan.add_title': 'Add new product',
    'scan.barcode': 'Barcode',
    'scan.lookup': 'Fill in from barcode',
    'scan.found_via': 'Found via',
    'scan.lookup_none': 'No details found for this barcode. Type them in.',
    'scan.name': 'Product name',
    'scan.category': 'Category',
    'scan.pick_category': 'Select category',
    'scan.loading': 'Loading...',
    'scan.no_categories': 'No categories yet: add one under Categories first.',
    'scan.selling_price': 'Selling price',
    'scan.stock': 'Stock on hand',
    'scan.cost': 'Cost (optional)',
    'scan.price_note': 'Top customer and jobber prices start at the selling price; change them later under Products.',
    'scan.back': 'Back',
    'scan.save_add': 'Save & add to invoice',
    'scan.saved_not_found': 'Product saved, but it could not be added. Scan it again.',
    'scan.created': 'product added to the catalog',
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

    // Dashboard & Stats
    'dash.dashboard': 'Tableau de bord',
    'dash.morning': 'Bonjour',
    'dash.afternoon': 'Bon après-midi',
    'dash.evening': 'Bonsoir',
    'dash.welcome': "Bienvenue ! Suivez vos produits et factures aujourd'hui.",
    'dash.change_login': 'Modifier la connexion',
    'dash.inventory': 'Inventaire',
    'dash.products': 'Produits',
    'dash.categories': 'Catégories',
    'dash.low_stock': 'Stock bas',
    'dash.out_of_stock': 'Rupture de stock',
    'dash.sales': 'Ventes (factures en cours)',
    'dash.invoices': 'Factures',
    'dash.total_sales': 'Ventes totales',
    'dash.paid_amount': 'Montant encaissé',
    'dash.amount_due': 'Montant restant dû',
    'dash.overview': "Vue d'ensemble",
    'dash.stock_value': 'Valeur du stock (coût)',
    'dash.staff_users': 'Utilisateurs',
    'dash.recent_invoices': 'Factures récentes',
    'dash.view_all': 'Voir tout →',
    'dash.no_invoices': 'Aucune facture pour le moment.',
    'dash.order_now': 'Commander →',
    'dash.well_stocked': 'Tous les produits sont bien approvisionnés.',
    'dash.left': 'restant(s)',
    'dash.alert_at': 'alerte à',

    // Language
    'lang.language': 'Langue',
    'lang.english': 'English',
    'lang.french': 'Français',

    // Statuses
    'status.paid': 'Payé',
    'status.unpaid': 'Impayé',
    'status.partial': 'Partiel',
    'status.draft': 'Brouillon',
    'status.sent': 'Envoyé',
    'status.void': 'Annulé',
    'status.open': 'Ouvert',
    'status.received': 'Reçu',
    'status.cancelled': 'Annulé',

    // Login
    'login.welcome': 'Bienvenue',
    'login.signin_desc': 'Connectez-vous pour accéder au tableau de bord',
    'login.email': 'Adresse email',
    'login.password': 'Mot de passe',
    'login.remember': 'Se souvenir de moi',
    'login.button': 'Connexion',
    'login.logging_in': 'Connexion en cours...',

    // Barcode scanning (New Invoice)
    'scan.start': 'Scanner des codes-barres',
    'scan.stop': 'Arrêter le scan',
    'scan.box': 'Scanner ou saisir un code-barres',
    'scan.box_hint': 'Scannez (ou saisissez + Entrée)',
    'scan.ready': 'Prêt. Chaque scan ajoute 1 ; rescanner le même article en ajoute 1 de plus.',
    'scan.sound_on': 'Activer le bip de scan',
    'scan.sound_off': 'Couper le bip de scan',
    'scan.not_found': 'Produit introuvable',
    'scan.not_found_text': "Aucun produit n'a ce code-barres :",
    'scan.inactive': 'Produit désactivé',
    'scan.inactive_text': 'est désactivé et ne peut pas être vendu. Activez-le dans Produits.',
    'scan.no_stock': 'Stock insuffisant',
    'scan.only': 'seulement',
    'scan.in_stock': 'en stock',
    'scan.no_stock_text': "Il n'a pas été ajouté. Réceptionnez du stock ou autorisez la vente hors stock dans les Paramètres.",
    'scan.failed': 'Échec du scan',
    'scan.ask_manager': "Demandez à un responsable de l'ajouter dans Produits, ou cherchez l'article par son nom.",
    'scan.next_closes': "Scanner l'article suivant ferme ce message.",
    'scan.continue': 'Continuer le scan',
    'scan.add_product': 'Ajouter comme nouveau produit',
    'scan.add_title': 'Nouveau produit',
    'scan.barcode': 'Code-barres',
    'scan.lookup': 'Remplir depuis le code-barres',
    'scan.found_via': 'Trouvé via',
    'scan.lookup_none': 'Aucune information trouvée pour ce code-barres. Saisissez-les.',
    'scan.name': 'Nom du produit',
    'scan.category': 'Catégorie',
    'scan.pick_category': 'Choisir une catégorie',
    'scan.loading': 'Chargement...',
    'scan.no_categories': "Aucune catégorie : créez-en une dans Catégories d'abord.",
    'scan.selling_price': 'Prix de vente',
    'scan.stock': 'Stock disponible',
    'scan.cost': 'Coût (facultatif)',
    'scan.price_note': 'Les prix client privilégié et grossiste reprennent le prix de vente ; modifiez-les plus tard dans Produits.',
    'scan.back': 'Retour',
    'scan.save_add': 'Enregistrer et ajouter à la facture',
    'scan.saved_not_found': "Produit enregistré, mais il n'a pas pu être ajouté. Scannez-le à nouveau.",
    'scan.created': 'produit ajouté au catalogue',
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
        aria-expanded={open}
        aria-label="Select language"
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-xs hover:border-gray-300 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/20"
        title="Change language / Changer de langue"
      >
        <span className="text-base leading-none select-none">{current.flag}</span>
        <span className="font-medium text-gray-800">{current.label}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 divide-y divide-gray-50"
            onMouseLeave={() => setOpen(false)}
          >
            <div className="px-3 py-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Globe size={12} className="text-gray-400" />
              <span>Language / Langue</span>
            </div>
            <div className="py-1">
              {languages.map((item) => {
                const isSelected = lang === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setLang(item.code);
                      setOpen(false);
                    }}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-purple-50/80 text-purple-700 font-bold'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-950 font-normal'
                    }`}
                  >
                    <span className="text-base leading-none select-none">{item.flag}</span>
                    <span className="flex-1">{item.label}</span>
                    {isSelected && <Check size={14} className="text-purple-600 stroke-[2.5]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
