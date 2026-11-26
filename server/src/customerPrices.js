// A customer's own prices (customer_prices) follow the item's cost upward: each price keeps the cost
// it was given at (cost_basis), and when the cost is higher now the price rises by the same percentage.
// It never goes below the price that was given. A matrix item's price follows its dearest flavor's cost.

const round2 = (n) => Math.round(n * 100) / 100;
const PRICE_FIELD = { selling: 'selling_price', top_customer: 'top_customer_price', jobber: 'jobber_price' };

// The item's cost now, for a customer_prices row `cp` joined to products `p` and product_matrices `m`.
export const ITEM_COST_SQL = `CASE WHEN cp.product_id IS NOT NULL THEN p.cost
  ELSE coalesce((SELECT max(v.cost) FROM products v WHERE v.matrix_id = cp.matrix_id), m.cost) END`;

// The item's cost for a new price on product $productParam or matrix item $matrixParam.
export const basisSql = (productParam, matrixParam) => `coalesce(
    (SELECT cost FROM products WHERE id = ${productParam}),
    (SELECT max(cost) FROM products WHERE matrix_id = ${matrixParam}),
    (SELECT cost FROM product_matrices WHERE id = ${matrixParam}),
    0)`;

// Price now: the given price, raised by the cost's rise since it was given. No known cost then = no change.
export function followCost(price, basis, cost) {
  const given = Number(price);
  const was = Number(basis) || 0;
  const now = Number(cost) || 0;
  if (was <= 0 || now <= was) return given;
  return round2((given * now) / was);
}

/**
 * The price an invoice line gets when nobody types one (the same rule as the invoice screen):
 * the customer's own price for the product, else for its matrix item (both as raised with cost),
 * else the product's price at the invoice's price level.
 * byId: Map productId -> product row (needs matrix_id and the three price columns).
 * Returns rateOf(productId) -> number, or null for a product not in byId.
 */
export async function autoRates(db, { customerId, byId, priceLevel }) {
  const own = new Map();
  const ofMatrix = new Map();
  if (customerId) {
    const { rows } = await db.query(
      `SELECT cp.product_id, cp.matrix_id, cp.price, cp.cost_basis, ${ITEM_COST_SQL} AS item_cost
         FROM customer_prices cp
         LEFT JOIN products p ON p.id = cp.product_id
         LEFT JOIN product_matrices m ON m.id = cp.matrix_id
        WHERE cp.customer_id = $1`,
      [customerId],
    );
    for (const x of rows) (x.product_id ? own : ofMatrix).set(x.product_id || x.matrix_id, round2(followCost(x.price, x.cost_basis, x.item_cost)));
  }
  return (pid) => {
    const p = byId.get(pid);
    if (!p) return null;
    if (own.has(pid)) return own.get(pid);
    if (p.matrix_id && ofMatrix.has(p.matrix_id)) return ofMatrix.get(p.matrix_id);
    return round2(Number(p[PRICE_FIELD[priceLevel]] || 0));
  };
}

/**
 * Remember the prices given on an invoice as the customer's own, so their next invoice starts there.
 * Only lines marked `remember` count, and only when the price differs from what the invoice would
 * have used anyway (their own price as it is now, else their price level). A flavor of a matrix item
 * is remembered for the whole matrix item when every flavor of it on the invoice went at that price;
 * a flavor that already has its own price keeps that row.
 * Returns how many prices were saved.
 */
export async function rememberPrices(client, { customerId, items, byId, priceLevel, invoiceNumber }) {
  if (!customerId) return 0;
  const rateOf = new Map(); // productId -> rate on this invoice (the last line wins)
  const marked = new Set();
  for (const it of items) {
    rateOf.set(it.productId, round2(it.rate));
    if (it.remember) marked.add(it.productId);
  }
  if (!marked.size) return 0;

  const { rows } = await client.query(
    `SELECT cp.*, ${ITEM_COST_SQL} AS item_cost
       FROM customer_prices cp
       LEFT JOIN products p ON p.id = cp.product_id
       LEFT JOIN product_matrices m ON m.id = cp.matrix_id
      WHERE cp.customer_id = $1
      FOR UPDATE OF cp`,
    [customerId],
  );
  const own = new Map(rows.filter((x) => x.product_id).map((x) => [x.product_id, x]));
  const ofMatrix = new Map(rows.filter((x) => x.matrix_id).map((x) => [x.matrix_id, x]));
  const now = (row) => followCost(row.price, row.cost_basis, row.item_cost);

  const productSaves = [];
  const byMatrix = new Map(); // matrixId -> [{ p, rate }]
  for (const pid of marked) {
    const p = byId.get(pid);
    const rate = rateOf.get(pid);
    if (!p || !(rate > 0)) continue; // a free line is a one-off, never a standing price
    if (own.has(pid)) {
      if (rate !== now(own.get(pid))) productSaves.push({ p, rate });
      continue;
    }
    const m = p.matrix_id ? ofMatrix.get(p.matrix_id) : null;
    const usual = m ? now(m) : round2(Number(p[PRICE_FIELD[priceLevel]] || 0));
    if (rate === usual) continue;
    if (!p.matrix_id) productSaves.push({ p, rate });
    else byMatrix.set(p.matrix_id, [...(byMatrix.get(p.matrix_id) || []), { p, rate }]);
  }

  const matrixSaves = [];
  for (const [matrixId, list] of byMatrix) {
    const rates = new Set();
    for (const [pid, rate] of rateOf) {
      if (byId.get(pid)?.matrix_id === matrixId && !own.has(pid)) rates.add(rate);
    }
    if (rates.size === 1) matrixSaves.push({ matrixId, rate: list[0].rate });
    else productSaves.push(...list);
  }

  for (const { p, rate } of productSaves) {
    await client.query(
      `INSERT INTO customer_prices (customer_id, product_id, price, cost_basis, invoice_number) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (customer_id, product_id) WHERE product_id IS NOT NULL
       DO UPDATE SET price = EXCLUDED.price, cost_basis = EXCLUDED.cost_basis, invoice_number = EXCLUDED.invoice_number, updated_at = now()`,
      [customerId, p.id, rate, Number(p.cost) || 0, invoiceNumber],
    );
  }
  for (const { matrixId, rate } of matrixSaves) {
    await client.query(
      `INSERT INTO customer_prices (customer_id, matrix_id, price, cost_basis, invoice_number)
       VALUES ($1, $2, $3, ${basisSql('NULL::uuid', '$2')}, $4)
       ON CONFLICT (customer_id, matrix_id) WHERE matrix_id IS NOT NULL
       DO UPDATE SET price = EXCLUDED.price, cost_basis = EXCLUDED.cost_basis, invoice_number = EXCLUDED.invoice_number, updated_at = now()`,
      [customerId, matrixId, rate, invoiceNumber],
    );
  }
  return productSaves.length + matrixSaves.length;
}
