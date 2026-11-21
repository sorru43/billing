import express, { Router } from 'express';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { h, ok, fail } from '../http.js';
import { parseCsv } from './customers.js';
import { barcodeListStats } from '../barcodeLookup.js';

// The store's barcode list: reference data only (barcode → name, brand, size, photo).
// It never creates products or changes stock. A scan that matches no product shows the item
// from here, and barcode lookups ask it before any outside source.

const r = Router();

const MAX_ROWS = 50000;
const CHUNK = 1000;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Earlier aliases win when a file has more than one matching column: "Chips Category" (a clean
// group like "Potato Chips") beats Open Food Facts' long "Category", and "Product Name" beats "Description".
const HEADER_ALIASES = {
  barcode: ['upc', 'barcode', 'ean', 'gtin', 'upcean', 'upccode', 'barcodeno', 'barcodenumber', 'ean13', 'code', 'productcode', 'itemcode', 'sku'],
  name: ['productname', 'name', 'product', 'itemname', 'item', 'title', 'productdescription', 'itemdescription', 'description'],
  brand: ['brand', 'brandname', 'manufacturer', 'make', 'company'],
  category: ['chipscategory', 'snackcategory', 'beveragetype', 'category', 'categoryname', 'department', 'type', 'group'],
  size: ['size', 'packsize', 'unitsize', 'netweight', 'weight', 'volume'],
  image: ['imageurl', 'image', 'imagelink', 'photourl', 'photo', 'picture'],
};

// field → column index, picking the column whose heading is the earliest alias.
function mapColumns(headings) {
  const keys = headings.map(norm);
  const cols = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    let best = -1;
    let rank = Infinity;
    keys.forEach((k, i) => {
      const a = aliases.indexOf(k);
      if (a !== -1 && a < rank) {
        rank = a;
        best = i;
      }
    });
    if (best !== -1) cols[field] = best;
  }
  return cols;
}

const clean = (v) => String(v ?? '').replace(/^'(?=[=+\-@\d])/, '').trim();
const cut = (v, n) => clean(v).slice(0, n);

r.get('/', requirePerm('import_export', 'view'), h(async (req, res) => {
  ok(res, await barcodeListStats());
}));

const importBody = express.text({ type: () => true, limit: '8mb' });

r.post('/import', requirePerm('import_export', 'create'), importBody, h(async (req, res) => {
  const dryRun = req.query.dryRun === '1';
  if (typeof req.body !== 'string' || !req.body.trim()) return fail(res, 422, 'The file is empty');

  const table = parseCsv(req.body).filter((row) => row.some((c) => String(c).trim() !== ''));
  if (table.length < 2) return fail(res, 422, 'The file needs a header row and at least one barcode');

  const cols = mapColumns(table[0]);
  if (cols.barcode === undefined) {
    return fail(res, 422, 'No barcode column found. The first row must contain column headings such as UPC or Barcode.');
  }
  if (cols.name === undefined) {
    return fail(res, 422, 'No product name column found. The first row must contain column headings such as Product Name or Name.');
  }

  const body = table.slice(1);
  if (body.length > MAX_ROWS) return fail(res, 422, `Too many rows (${body.length.toLocaleString()}). Import at most ${MAX_ROWS.toLocaleString()} at a time.`);

  const errors = [];
  const valid = [];
  const seen = new Map();
  let duplicates = 0;

  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (f) => (cols[f] === undefined ? '' : cells[cols[f]]);
    let barcode = clean(get('barcode')).replace(/\s+/g, '');
    const name = cut(get('name'), 200);
    if (!barcode) return errors.push({ row: line, name: name || '—', message: 'Barcode is missing' });
    if (/^\d(\.\d+)?e\+?\d+$/i.test(barcode)) {
      return errors.push({ row: line, name: name || '—', message: 'Barcode was turned into a number by Excel (like 2.84E+10). Format the column as Text and save again.' });
    }
    if (!/^[A-Za-z0-9\-_.]{1,64}$/.test(barcode)) {
      return errors.push({ row: line, name: name || '—', message: 'Barcode may only contain letters, numbers, - _ . (max 64)' });
    }
    // One form per item: a 12-digit UPC is kept as its 13-digit EAN (leading 0), the way these lists
    // ship it, and Excel's lost leading zeros (0028400147408 → 28400147408) are put back.
    // Scans match either form (barcodeVariants), so a 12-digit scan still finds it.
    if (/^\d{11,12}$/.test(barcode)) barcode = barcode.padStart(13, '0');
    if (!name) return errors.push({ row: line, name: '—', message: 'Product name is missing' });
    if (seen.has(barcode)) {
      duplicates++;
      return undefined;
    }
    seen.set(barcode, line);
    const image = cut(get('image'), 1000);
    valid.push({
      row: line,
      barcode,
      name,
      brand: cut(get('brand'), 200),
      category: cut(get('category'), 200),
      size: cut(get('size'), 100),
      image: /^https?:\/\//i.test(image) ? image : '',
    });
    return undefined;
  });

  const run = async (db) => {
    let existing = 0;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const part = valid.slice(i, i + CHUNK);
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM barcode_list WHERE barcode = ANY($1::text[])`, [part.map((v) => v.barcode)]);
      existing += rows[0].n;
      if (dryRun) continue;
      // A blank cell keeps what the list already has, so a smaller file can't wipe a brand or photo.
      await db.query(
        `INSERT INTO barcode_list (barcode, name, brand, category, size, image, imported_at)
         SELECT u.*, now() FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
           AS u(barcode, name, brand, category, size, image)
         ON CONFLICT (barcode) DO UPDATE SET
           name = EXCLUDED.name,
           brand = COALESCE(NULLIF(EXCLUDED.brand, ''), barcode_list.brand),
           category = COALESCE(NULLIF(EXCLUDED.category, ''), barcode_list.category),
           size = COALESCE(NULLIF(EXCLUDED.size, ''), barcode_list.size),
           image = COALESCE(NULLIF(EXCLUDED.image, ''), barcode_list.image),
           imported_at = now()`,
        ['barcode', 'name', 'brand', 'category', 'size', 'image'].map((k) => part.map((v) => v[k])),
      );
    }
    return existing;
  };

  const existing = dryRun ? await run({ query }) : await tx(run);
  const summary = {
    dryRun,
    rows: body.length,
    created: valid.length - existing,
    updated: existing,
    duplicates,
    skipped: errors.length,
    errors: errors.slice(0, 50),
    sample: valid.slice(0, 5),
    list: await barcodeListStats(),
  };
  const message = dryRun
    ? `Ready to import ${valid.length.toLocaleString()} barcodes`
    : `Imported ${valid.length.toLocaleString()} barcodes (${summary.created.toLocaleString()} new, ${summary.updated.toLocaleString()} updated)`;
  ok(res, summary, message);
}));

r.delete('/', requirePerm('import_export', 'delete'), h(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM barcode_list`);
  ok(res, await barcodeListStats(), `Barcode list cleared (${rowCount.toLocaleString()} barcodes removed)`);
}));

export default r;
