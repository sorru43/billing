import { getSetting } from './settings.js';

// In-memory cache to save API credits and prevent duplicate paid lookups
const cache = new Map();

export async function getBarcodeApiKey() {
  const setting = await getSetting('barcode_lookup');
  if (setting?.apiKey && setting.apiKey.trim()) {
    return setting.apiKey.trim();
  }
  return (process.env.BARCODE_LOOKUP_API_KEY || '').trim();
}

export function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

export async function lookupBarcode(rawBarcode, customKey = null) {
  const barcode = String(rawBarcode || '').trim().replace(/[^0-9A-Za-z]/g, '');
  if (!barcode) {
    throw new Error('Please enter a valid barcode to lookup.');
  }

  // Check cache first
  const cacheKey = barcode.toLowerCase();
  if (cache.has(cacheKey)) {
    return { ...cache.get(cacheKey), cached: true };
  }

  const apiKey = customKey || (await getBarcodeApiKey());
  if (!apiKey) {
    const err = new Error(
      'Barcode Lookup API key is not configured. Please add your API key in Settings > Barcode Lookup.',
    );
    err.code = 'NO_API_KEY';
    throw err;
  }

  const url = `https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(
    barcode,
  )}&formatted=y&key=${encodeURIComponent(apiKey)}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BillingApp/1.0',
      },
      signal: AbortSignal.timeout(9000),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') {
      throw new Error('Barcode Lookup API request timed out. Please try again.');
    }
    throw new Error(`Failed to connect to Barcode Lookup API: ${e.message}`);
  }

  if (response.status === 404) {
    const notFound = {
      found: false,
      barcode,
      message: 'Product not found in Barcode Lookup database.',
    };
    cache.set(cacheKey, notFound);
    return notFound;
  }

  if (response.status === 401 || response.status === 403) {
    const err = new Error(
      'Invalid Barcode Lookup API key or unauthorized. Please verify your key in Settings.',
    );
    err.code = 'INVALID_KEY';
    throw err;
  }

  if (response.status === 429) {
    const err = new Error(
      'Barcode Lookup API rate limit or monthly credit quota exceeded.',
    );
    err.code = 'QUOTA_EXCEEDED';
    throw err;
  }

  if (!response.ok) {
    let errorText = '';
    try {
      const errJson = await response.json();
      errorText = Array.isArray(errJson?.errors)
        ? errJson.errors.join(', ')
        : errJson?.message || '';
    } catch {
      errorText = await response.text();
    }
    throw new Error(
      `Barcode Lookup API returned error (${response.status}): ${errorText || response.statusText}`,
    );
  }

  const data = await response.json();
  const rawProduct = Array.isArray(data?.products) ? data.products[0] : null;

  if (!rawProduct) {
    return {
      found: false,
      barcode,
      message: 'Product data not found in response.',
    };
  }

  const product = {
    barcode: rawProduct.barcode_number || barcode,
    name: rawProduct.title || rawProduct.product_name || rawProduct.model || '',
    brand: rawProduct.brand || rawProduct.manufacturer || '',
    manufacturer: rawProduct.manufacturer || '',
    model: rawProduct.model || '',
    category: rawProduct.category || '',
    description: rawProduct.description || '',
    images: Array.isArray(rawProduct.images) ? rawProduct.images : [],
    image:
      Array.isArray(rawProduct.images) && rawProduct.images.length > 0
        ? rawProduct.images[0]
        : '',
    mpn: rawProduct.mpn || '',
    asin: rawProduct.asin || '',
  };

  const result = {
    found: true,
    barcode,
    product,
    cached: false,
  };

  // Cache up to 1,000 items in memory
  if (cache.size > 1000) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(cacheKey, result);

  return result;
}

export async function testBarcodeApiKey(customKey) {
  const apiKey = customKey || (await getBarcodeApiKey());
  if (!apiKey) {
    return {
      ok: false,
      error: 'Please provide an API key to test.',
    };
  }

  // Use a well-known universal test barcode (Pepsi 12oz: 012000000133)
  const testBarcode = '012000000133';
  try {
    const res = await lookupBarcode(testBarcode, apiKey);
    if (res.found) {
      return {
        ok: true,
        message: 'API Key is valid and working!',
        testProduct: {
          title: res.product.name,
          brand: res.product.brand,
          category: res.product.category,
        },
      };
    }
    return {
      ok: true,
      message: 'API Key is valid! Connected to Barcode Lookup successfully.',
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      code: err.code || 'TEST_FAILED',
    };
  }
}
