import { query } from './db.js';
import { getSetting, setSetting } from './settings.js';
import { SOURCES, LookupError } from './barcodeProviders.js';

// Free-first barcode lookup. Sources are asked in order (free first, most expensive last) and
// the chain stops at the first match. Every answer is saved in barcode_lookups, so a barcode is
// fetched, and paid for, only once. A "not found" is retried after NOT_FOUND_RETRY_DAYS, and right
// away by any source that was added after the barcode was last looked up.

const NOT_FOUND_RETRY_DAYS = 30;
const MASK = '••••••••';

export { LookupError };

export function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return MASK;
  return key.slice(0, 4) + MASK + key.slice(-4);
}

// The settings form gets keys back masked; a masked value sent back means "keep the saved key".
const isMasked = (key) => String(key || '').includes('•');

export const normalizeBarcode = (raw) => String(raw || '').trim().replace(/[^0-9A-Za-z]/g, '');

// A 12-digit UPC and its 13-digit EAN form (leading 0) are the same code, so either matches.
// One UPC arrives in several forms: the 12-digit UPC-A a scanner reads, its 13-digit EAN form
// (leading 0), and an 11-digit copy whose leading 0 Excel dropped. Each form finds the others.
export function barcodeVariants(code) {
  const codes = new Set([code]);
  if (/^\d{11}$/.test(code)) {
    codes.add(`0${code}`);
    codes.add(`00${code}`);
  }
  if (/^\d{12}$/.test(code)) codes.add(`0${code}`);
  if (/^0\d{11}$/.test(code)) codes.add(code.slice(1));
  if (/^0\d{12}$/.test(code)) codes.add(code.slice(1));
  if (/^00\d{11}$/.test(code)) codes.add(code.slice(2));
  return [...codes];
}

// UPC/EAN check digit (GTIN-8/12/13/14): the last digit matches the weighted sum of the others.
export function validCheckDigit(code) {
  if (!/^\d{8,14}$/.test(code)) return false;
  const d = [...code].map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// The store's imported barcode list (reference data, never products or stock).
export async function findInBarcodeList(rawCode) {
  const code = String(rawCode || '').trim().slice(0, 64);
  if (!code) return null;
  const { rows } = await query(
    `SELECT barcode, name, brand, category, size, image FROM barcode_list
      WHERE barcode = ANY($1::text[]) ORDER BY (barcode = $2) DESC LIMIT 1`,
    [barcodeVariants(code), code],
  );
  return rows[0] || null;
}

export async function barcodeListStats() {
  const { rows } = await query(`SELECT count(*)::int AS count, max(imported_at) AS imported_at FROM barcode_list`);
  return { count: rows[0].count, importedAt: rows[0].imported_at };
}

export const LIST_SOURCE_LABEL = 'Your barcode list';

// Same shape as the lookup sources' products (toProduct in barcodeProviders.js).
const listProduct = (row) => ({
  barcode: row.barcode,
  name: row.name,
  brand: row.brand,
  manufacturer: '',
  model: '',
  category: row.category,
  description: row.size ? `Size: ${row.size}` : '',
  size: row.size,
  images: row.image ? [row.image] : [],
  image: row.image,
  mpn: '',
  asin: '',
});

// Stored as settings.barcode_lookup = { sources: { [id]: { enabled, apiKey } } }.
// Older installs stored only { apiKey } for barcodelookup.com; that key (or the
// BARCODE_LOOKUP_API_KEY env var) still applies until a new one is saved.
async function loadSources() {
  const setting = await getSetting('barcode_lookup');
  const saved = setting.sources || {};
  return SOURCES.map((src) => {
    const cfg = saved[src.id] || {};
    const storedKey = src.key === 'none' ? '' : String(cfg.apiKey ?? (src.id === 'barcodelookup' ? setting.apiKey || '' : '')).trim();
    const apiKey = storedKey || (src.id === 'barcodelookup' ? String(process.env.BARCODE_LOOKUP_API_KEY || '').trim() : '');
    const enabled = cfg.enabled !== false;
    return { ...src, storedKey, apiKey, enabled, active: enabled && (src.key !== 'required' || Boolean(apiKey)) };
  });
}

export async function getLookupSettings() {
  const sources = await loadSources();
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE found)::int AS found, count(*) FILTER (WHERE NOT found)::int AS not_found FROM barcode_lookups`,
  );
  return {
    sources: sources.map((s) => ({
      id: s.id,
      label: s.label,
      key: s.key,
      cost: s.cost,
      note: s.note,
      url: s.url,
      enabled: s.enabled,
      active: s.active,
      hasKey: Boolean(s.apiKey),
      apiKey: maskApiKey(s.apiKey),
    })),
    saved: { found: rows[0].found, notFound: rows[0].not_found },
    list: await barcodeListStats(),
  };
}

// updates: { [id]: { enabled?: boolean, apiKey?: string } }
export async function saveLookupSettings(updates) {
  const current = await loadSources();
  const sources = {};
  for (const src of current) {
    const u = updates[src.id] || {};
    const apiKey = typeof u.apiKey === 'string' && !isMasked(u.apiKey) ? u.apiKey.trim() : src.storedKey;
    sources[src.id] = {
      enabled: typeof u.enabled === 'boolean' ? u.enabled : src.enabled,
      apiKey: src.key === 'none' ? '' : apiKey,
    };
  }
  await setSetting('barcode_lookup', { sources });
}

async function remember(barcode, found, source, product, tried) {
  await query(
    `INSERT INTO barcode_lookups (barcode, found, source, product, tried, looked_up_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (barcode) DO UPDATE
       SET found = EXCLUDED.found, source = EXCLUDED.source, product = EXCLUDED.product,
           tried = EXCLUDED.tried, looked_up_at = now()`,
    [barcode, found, source, product ? JSON.stringify(product) : null, tried],
  );
}

const labelOf = (id) => SOURCES.find((s) => s.id === id)?.label || id;

export async function lookupBarcode(rawBarcode) {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) throw new LookupError('Please enter a valid barcode to lookup.', 'INVALID_BARCODE');
  // The store's own list first: free, instant, and it works with every outside source turned off.
  const listed = await findInBarcodeList(barcode);
  if (listed) return { found: true, barcode, product: listProduct(listed), source: LIST_SOURCE_LABEL, cached: true };
  // Barcodes starting with 2 are in-store codes (the Generate button makes these too); no public
  // database has them, so don't spend lookups on them.
  if (/^2\d{11,12}$/.test(barcode)) {
    return { found: false, barcode, cached: false, message: 'This is an in-store barcode (it starts with 2), so no public database has it.' };
  }

  const sources = (await loadSources()).filter((s) => s.active);
  if (!sources.length) {
    throw new LookupError('All barcode lookup sources are turned off. Turn one on in Settings > Barcode Lookup.', 'NO_SOURCES');
  }

  const { rows } = await query(
    `SELECT found, source, product, tried, looked_up_at > now() - make_interval(days => $2) AS fresh
       FROM barcode_lookups WHERE barcode = $1`,
    [barcode, NOT_FOUND_RETRY_DAYS],
  );
  const saved = rows[0];
  if (saved?.found) {
    return { found: true, barcode, product: saved.product, source: labelOf(saved.source), cached: true };
  }

  const alreadyTried = saved?.fresh ? saved.tried : [];
  const toAsk = sources.filter((s) => !alreadyTried.includes(s.id));
  if (!toAsk.length) {
    return { found: false, barcode, cached: true, message: 'Product not found in any barcode lookup source.' };
  }

  const tried = [...alreadyTried];
  const problems = [];
  for (const src of toAsk) {
    try {
      const product = await src.lookup(barcode, src.apiKey);
      tried.push(src.id);
      if (product) {
        await remember(barcode, true, src.id, product, tried);
        return { found: true, barcode, product, source: src.label, cached: false, warnings: problems.map((p) => p.message) };
      }
    } catch (e) {
      // Not remembered as "tried": a timeout or a used-up limit says nothing about the barcode.
      problems.push(e instanceof LookupError ? e : new LookupError(`${src.label}: ${e.message}`));
    }
  }

  if (tried.length > alreadyTried.length) {
    await remember(barcode, false, '', null, tried);
  } else if (!alreadyTried.length) {
    // No source could answer at all: report the problems instead of a false "not found".
    if (problems.length === 1) throw problems[0];
    throw new LookupError(`No lookup source could answer. ${problems.map((p) => p.message).join(' ')}`, problems[0].code);
  }
  return {
    found: false,
    barcode,
    cached: false,
    message: problems.length
      ? `Product not found. Some sources could not be checked: ${problems.map((p) => p.message).join(' ')}`
      : 'Product not found in any barcode lookup source.',
    warnings: problems.map((p) => p.message),
  };
}

// Checks one source (and key) directly, skipping the saved results.
export async function testLookupSource(id, rawKey) {
  const src = (await loadSources()).find((s) => s.id === id);
  if (!src) return { ok: false, error: 'Unknown lookup source.' };
  const apiKey = rawKey && !isMasked(rawKey) ? String(rawKey).trim() : src.apiKey;
  if (src.key === 'required' && !apiKey) return { ok: false, error: `Enter an API key for ${src.label} first.` };
  try {
    const product = await src.lookup(src.testBarcode, apiKey);
    return {
      ok: true,
      message: product ? `${src.label} is working. Test product: ${product.name}` : `${src.label} is working.`,
    };
  } catch (e) {
    return { ok: false, error: e.message, code: e.code || 'TEST_FAILED' };
  }
}
