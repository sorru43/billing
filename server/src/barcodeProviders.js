// One adapter per barcode database. Each takes a barcode (plus a key when the source needs one)
// and returns a normalized product, or null when that source does not know the barcode.
// Failures throw a LookupError with code INVALID_KEY, QUOTA_EXCEEDED or SOURCE_ERROR.
// No database access here, so the adapters can be tested on their own.

const TIMEOUT_MS = 8000;
const USER_AGENT = 'BillingApp/1.0';

export class LookupError extends Error {
  constructor(message, code = 'SOURCE_ERROR') {
    super(message);
    this.code = code;
  }
}

const text = (v) => (v == null ? '' : String(v).trim());
const isNumeric = (b) => /^\d{8,14}$/.test(b);

function toProduct(barcode, f) {
  // https photos first: plain http ones are blocked on an https site.
  const images = [...new Set((Array.isArray(f.images) ? f.images : []).map(text))]
    .filter((u) => /^https?:\/\//i.test(u))
    .sort((a, b) => Number(b.startsWith('https:')) - Number(a.startsWith('https:')));
  return {
    barcode: text(f.barcode) || barcode,
    name: text(f.name),
    brand: text(f.brand),
    manufacturer: text(f.manufacturer),
    model: text(f.model),
    category: text(f.category),
    description: text(f.description),
    images,
    image: images[0] || '',
    mpn: text(f.mpn),
    asin: text(f.asin),
  };
}

async function getJson(url, label, headers = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new LookupError(
      e.name === 'TimeoutError' ? `${label} did not answer in time.` : `Could not reach ${label}: ${e.message}`,
    );
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, ok: res.ok, body };
}

// Open Food Facts: free, no key, food/drink/grocery products. Limit is 15 lookups a minute.
async function openFoodFacts(barcode) {
  if (!isNumeric(barcode)) return null;
  const fields = 'code,product_name,product_name_en,product_name_fr,generic_name,brands,categories,quantity,image_front_url,image_url';
  const { status, ok, body } = await getJson(
    `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fields}`,
    'Open Food Facts',
  );
  if (status === 404 || (ok && body && body.status !== 1)) return null;
  if (status === 429 || status === 503) {
    throw new LookupError('Open Food Facts is busy (too many lookups). Try again in a minute.', 'QUOTA_EXCEEDED');
  }
  if (!ok || !body) throw new LookupError(`Open Food Facts returned an error (${status}).`);

  const p = body.product || {};
  const name = text(p.product_name) || text(p.product_name_en) || text(p.product_name_fr) || text(p.generic_name);
  if (!name) return null;
  const generic = text(p.generic_name);
  return toProduct(barcode, {
    barcode: body.code,
    name,
    brand: text(p.brands).split(',')[0],
    // "Beverages, Sodas" -> "Beverages > Sodas", the same shape as the other sources.
    category: text(p.categories).split(',').map((s) => s.trim()).filter(Boolean).join(' > '),
    description: [generic && generic !== name ? generic : '', p.quantity ? `Size: ${text(p.quantity)}` : '']
      .filter(Boolean)
      .join('. '),
    images: [p.image_front_url, p.image_url],
  });
}

// UPCitemdb: free trial endpoint (100 lookups a day, no key) or the paid endpoint with a key.
async function upcItemDb(barcode, apiKey) {
  if (!isNumeric(barcode)) return null;
  const url = apiKey
    ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${barcode}`
    : `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`;
  const { status, ok, body } = await getJson(url, 'UPCitemdb', apiKey ? { user_key: apiKey, key_type: '3scale' } : {});
  if (status === 404 || (status === 400 && body?.code === 'INVALID_UPC')) return null;
  if (status === 401 || status === 403) throw new LookupError('UPCitemdb rejected the API key.', 'INVALID_KEY');
  if (status === 429) {
    throw new LookupError(
      apiKey ? 'UPCitemdb lookup limit reached for your plan.' : 'UPCitemdb free limit reached (100 lookups a day).',
      'QUOTA_EXCEEDED',
    );
  }
  if (!ok || !body) throw new LookupError(`UPCitemdb returned an error (${status}).`);

  const it = Array.isArray(body.items) ? body.items[0] : null;
  if (!it || !text(it.title)) return null;
  return toProduct(barcode, {
    barcode: it.upc || it.ean,
    name: it.title,
    brand: it.brand,
    model: it.model,
    category: it.category,
    description: it.description,
    images: it.images,
    asin: it.asin,
  });
}

// UPC Database (upcdatabase.org): needs a key (a free key gives 100 lookups a day).
// It answers HTTP 200 with success:false for errors, so the message decides what happened.
async function upcDatabase(barcode, apiKey) {
  if (!isNumeric(barcode)) return null;
  const { status, ok, body } = await getJson(
    `https://api.upcdatabase.org/product/${barcode}?apikey=${encodeURIComponent(apiKey)}`,
    'UPC Database',
  );
  if (status === 429) throw new LookupError('UPC Database lookup limit reached for today.', 'QUOTA_EXCEEDED');
  if (body?.success === false || !ok) {
    const msg = text(body?.error?.message || body?.message);
    if (/api ?key/i.test(msg) || status === 401 || status === 403) {
      throw new LookupError('UPC Database rejected the API key.', 'INVALID_KEY');
    }
    if (/limit|quota|exceed/i.test(msg)) throw new LookupError('UPC Database lookup limit reached for today.', 'QUOTA_EXCEEDED');
    if (status === 404 || /not found|no data|no product|could not find|invalid (upc|barcode|ean)/i.test(msg)) return null;
    throw new LookupError(`UPC Database returned an error${msg ? `: ${msg}` : ` (${status})`}.`);
  }
  if (!body) throw new LookupError('UPC Database returned an empty answer.');

  const name = text(body.title) || text(body.alias);
  if (!name) return null;
  return toProduct(barcode, {
    barcode: body.barcode,
    name,
    brand: body.brand,
    manufacturer: body.manufacturer,
    category: body.category,
    description: body.description,
    images: body.images,
    mpn: body.mpn,
    asin: body.ASIN || body.asin,
  });
}

// EAN-Search.org: paid key, strong on European (EAN-13) barcodes. Returns name and category, no photos.
async function eanSearch(barcode, apiKey) {
  if (!isNumeric(barcode)) return null;
  const ean = barcode.length === 12 ? `0${barcode}` : barcode; // UPC-A -> EAN-13
  const { status, ok, body } = await getJson(
    `https://api.ean-search.org/api?token=${encodeURIComponent(apiKey)}&op=barcode-lookup&ean=${ean}&format=json`,
    'EAN-Search',
  );
  const item = Array.isArray(body) ? body[0] : body;
  if (item?.error) {
    const msg = text(item.error);
    if (/token/i.test(msg)) throw new LookupError('EAN-Search rejected the API token.', 'INVALID_KEY');
    if (/credit|limit|quota|exceed/i.test(msg)) throw new LookupError('EAN-Search lookup limit reached for your plan.', 'QUOTA_EXCEEDED');
    if (/not found|invalid (ean|barcode)/i.test(msg)) return null;
    throw new LookupError(`EAN-Search returned an error: ${msg}.`);
  }
  if (status === 429) throw new LookupError('EAN-Search lookup limit reached for your plan.', 'QUOTA_EXCEEDED');
  if (!ok) throw new LookupError(`EAN-Search returned an error (${status}).`);
  if (!item || !text(item.name)) return null;
  return toProduct(barcode, { barcode: item.ean, name: item.name, category: item.categoryName });
}

// Barcode Lookup (barcodelookup.com): paid key, detailed data and photos. The most expensive source.
async function barcodeLookupCom(barcode, apiKey) {
  const { status, ok, body } = await getJson(
    `https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(barcode)}&formatted=y&key=${encodeURIComponent(apiKey)}`,
    'Barcode Lookup',
  );
  if (status === 404) return null;
  if (status === 401 || status === 403) throw new LookupError('Barcode Lookup rejected the API key.', 'INVALID_KEY');
  if (status === 429) throw new LookupError('Barcode Lookup monthly lookup limit reached.', 'QUOTA_EXCEEDED');
  if (!ok) {
    const msg = Array.isArray(body?.errors) ? body.errors.join(', ') : text(body?.message);
    throw new LookupError(`Barcode Lookup returned an error${msg ? `: ${msg}` : ` (${status})`}.`);
  }
  const p = Array.isArray(body?.products) ? body.products[0] : null;
  const name = text(p?.title) || text(p?.product_name) || text(p?.model);
  if (!name) return null;
  return toProduct(barcode, {
    barcode: p.barcode_number,
    name,
    brand: p.brand || p.manufacturer,
    manufacturer: p.manufacturer,
    model: p.model,
    category: p.category,
    description: p.description,
    images: p.images,
    mpn: p.mpn,
    asin: p.asin,
  });
}

// Tried in this order: free sources first, the most expensive last.
// key: 'none' = no key, 'optional' = works without one, 'required' = skipped until a key is saved.
export const SOURCES = [
  {
    id: 'openfoodfacts',
    label: 'Open Food Facts',
    key: 'none',
    cost: 'Free',
    note: 'Food, drinks and groceries. No account needed.',
    url: 'https://world.openfoodfacts.org',
    testBarcode: '3017620422003',
    lookup: openFoodFacts,
  },
  {
    id: 'upcitemdb',
    label: 'UPCitemdb',
    key: 'optional',
    cost: 'Free (100 a day) · paid from $99/mo',
    note: 'General products, strongest on US barcodes. Works without a key; a paid key raises the limit.',
    url: 'https://www.upcitemdb.com/api/explorer',
    testBarcode: '012000000133',
    lookup: upcItemDb,
  },
  {
    id: 'upcdatabase',
    label: 'UPC Database',
    key: 'required',
    cost: 'Free key (100 a day) · paid from $2.50/mo',
    note: 'General products. Needs a key from upcdatabase.org, even for the free plan.',
    url: 'https://upcdatabase.org/api',
    testBarcode: '012000000133',
    lookup: upcDatabase,
  },
  {
    id: 'eansearch',
    label: 'EAN-Search.org',
    key: 'required',
    cost: 'From €19/mo (5,000 lookups)',
    note: 'Strong on European (EAN) barcodes. Gives name and category, no photos.',
    url: 'https://www.ean-search.org/ean-database-api.html',
    testBarcode: '3017620422003',
    lookup: eanSearch,
  },
  {
    id: 'barcodelookup',
    label: 'Barcode Lookup',
    key: 'required',
    cost: 'From $99/mo (5,000 lookups)',
    note: 'Most detailed data and photos, and the most expensive, so it is asked last.',
    url: 'https://www.barcodelookup.com/api',
    testBarcode: '012000000133',
    lookup: barcodeLookupCom,
  },
];
