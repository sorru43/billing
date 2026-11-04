// Spreadsheet utilities for converting Excel (.xlsx) / CSV files in the browser and downloading sample templates.

export const csvCell = (v) => {
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function fileToCsv(file) {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    const rows = await readSheet(file);
    return rows.map((r) => r.map(csvCell).join(',')).join('\n');
  }
  if (/\.xls$/i.test(file.name)) {
    throw new Error('Old .xls files are not supported. In Excel choose File → Save As → .xlsx or .csv.');
  }
  return file.text();
}

function triggerDownload(filename, content) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadProductsTemplate() {
  const csv =
    'Product Name,Category,Barcode,Cost,Selling Price,Top Customer Price,Jobber Price,Quantity,Description,Status\n' +
    '"Premium Hookah 24in","Hookahs","2898677375884",500.00,1500.00,1450.00,1200.00,50,"Black matte premium hookah",Active\n' +
    '"Coconut Charcoal 1kg","Accessories","2898677375885",15.00,30.00,28.00,25.00,120,"Natural eco-friendly coals",Active\n' +
    '"Double Apple Flavor 250g","Flavors","2898677375886",25.00,45.00,42.00,38.00,200,"Al Fakher double apple flavor",Active\n';
  triggerDownload('products-template.csv', csv);
}

export function downloadCustomersTemplate() {
  const csv =
    'Name,Company,Email,Phone,Address,Tax Number,Price Level,Notes,Status\n' +
    'John Smith,Smith Trading LLC,john@example.com,+971 50 123 4567,"Office 12, Business Bay, Dubai",100123456700003,Selling,Card on file,Active\n' +
    'Sarah Johnson,Apex Lounge,sarah@apex.ae,+971 52 987 6543,"Marina Walk, Dubai",100987654300003,Top Customer,Wholesale buyer,Active\n';
  triggerDownload('customers-template.csv', csv);
}
