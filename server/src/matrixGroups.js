// Product names written as "BASE NAME (FLAVOR)" become matrix items: one parent "BASE NAME" with a
// Flavor attribute, each row a variant (an ordinary product row with matrix_id/option1/option2).
// Used by the product import and by one-off regrouping of products that were imported flat.

export const MAX_VALUES = 60; // per attribute (matrix editor limit)
export const MAX_VARIANTS = 600;
const MAX_NAME = 150;
const MAX_VALUE = 60;

export const variantName = (name, o1, o2) => `${name} - ${o2 ? `${o1} / ${o2}` : o1}`;

const TAIL = /^(.*\S)\s*\(\s*([^()]*?)\s*\)\s*$/;
// A pack size glued to the flavor, repeating the base's: "DIAMOND15/4PK", "BLUEBERRY15CT", "MIAMI MINT16ML/5PK".
const GLUED_PACK = /(?<=[A-Za-z+$])(?:\d+(?:\.\d+)?(?:ML)?\/)?\d+(?:PK|CT)$/i;
// "BLACK CHERRY 3MG", "MINT, 6MG" → flavor + strength.
const STRENGTH = /^(.*?)[\s,]*(\d+(?:\.\d+)?)\s?MG$/i;
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const lc = (s) => String(s || '').toLowerCase();
const pairKey = (o1, o2) => `${lc(o1)}\u0000${lc(o2)}`;

export function splitName(name) {
  const m = TAIL.exec(String(name || ''));
  if (!m) return null;
  // The base is not squashed: look-alike lines that differ only by a double space can carry
  // different prices (two Geek Bar Pulse sets at $55 and $43), so they stay separate items.
  const base = m[1].trim();
  const value = squash(m[2]).replace(/\s+,\s*/g, ', ');
  if (!base || !value) return null;
  return { base, value };
}

function splitStrength(value) {
  const p = STRENGTH.exec(value);
  const flavor = p && squash(p[1]).replace(/[\s,]+$/, '');
  return flavor ? { option1: flavor, option2: `${p[2]}MG` } : null;
}

/**
 * rows: [{ name, ... }]. existing: Map lower(matrix name) → { attr2_name } for matrix items already saved.
 * A base becomes a group when 2+ rows share it, or when a matrix item with that name already exists.
 * Returns { groups: [{ name, existing, attr2_name, variants: [{ item, option1, option2 }] }], singles, misfits }.
 * misfits: rows that belong to an existing matrix item but don't fit it ({ item, message }).
 */
export function groupVariants(rows, { existing = new Map() } = {}) {
  const byBase = new Map();
  const singles = [];
  const misfits = [];
  for (const item of rows) {
    const s = splitName(item.name);
    if (!s) {
      singles.push(item);
      continue;
    }
    const key = lc(s.base);
    if (!byBase.has(key)) byBase.set(key, { name: s.base, rows: [] });
    byBase.get(key).rows.push({ item, value: s.value });
  }

  const groups = [];
  for (const [key, g] of byBase) {
    const saved = existing.get(key);
    // The same flavor twice under one name: the first joins, the repeat stays a separate product.
    const first = new Set();
    g.rows = g.rows.filter((r) => {
      if (first.has(lc(r.value))) {
        singles.push(r.item);
        return false;
      }
      first.add(lc(r.value));
      return true;
    });
    if (!saved && g.rows.length < 2) {
      singles.push(...g.rows.map((r) => r.item));
      continue;
    }

    // Drop a glued pack size when the cleaned flavor stays unique in the group.
    const taken = new Set(g.rows.map((r) => lc(r.value)));
    for (const r of g.rows) {
      const cleaned = squash(r.value.replace(GLUED_PACK, ''));
      if (cleaned && cleaned !== r.value && !taken.has(lc(cleaned))) {
        taken.delete(lc(r.value));
        taken.add(lc(cleaned));
        r.value = cleaned;
      }
    }

    let attr2 = '';
    if (saved) {
      // Fit the item's existing shape: Flavor only, or Flavor x Strength.
      attr2 = saved.attr2_name || '';
      g.rows = g.rows.filter((r) => {
        if (!attr2) return Object.assign(r, { option1: r.value, option2: '' });
        const sp = splitStrength(r.value);
        if (sp) return Object.assign(r, sp);
        misfits.push({ item: r.item, message: `"${r.value}" has no strength (like 3MG) for matrix item "${g.name}"` });
        return false;
      });
    } else {
      // Flavor x Strength when every value carries a strength, there are 2+ strengths, and pairs stay unique.
      const parts = g.rows.map((r) => splitStrength(r.value));
      if (
        parts.every(Boolean) &&
        new Set(parts.map((p) => p.option2)).size > 1 &&
        new Set(parts.map((p) => pairKey(p.option1, p.option2))).size === g.rows.length
      ) {
        attr2 = 'Strength';
        g.rows.forEach((r, i) => Object.assign(r, parts[i]));
      } else {
        g.rows.forEach((r) => Object.assign(r, { option1: r.value, option2: '' }));
      }
    }
    const tooLong = (r) => r.option1.length > MAX_VALUE || r.option2.length > MAX_VALUE;
    if (saved) {
      // Joining a saved item: rows that can't fit are reported, the rest still join.
      const seen = new Set();
      g.rows = g.rows.filter((r) => {
        const k = pairKey(r.option1, r.option2);
        if (tooLong(r)) misfits.push({ item: r.item, message: `Flavor is too long for a matrix item (max ${MAX_VALUE} characters)` });
        else if (seen.has(k)) misfits.push({ item: r.item, message: `Same flavor as another row for matrix item "${g.name}"` });
        else return seen.add(k);
        return false;
      });
      if (!g.rows.length) continue;
    } else if (g.name.length > MAX_NAME || g.rows.some(tooLong) || new Set(g.rows.map((r) => pairKey(r.option1, r.option2))).size !== g.rows.length) {
      // A new item the matrix editor couldn't open later: keep these rows as plain products.
      singles.push(...g.rows.map((r) => r.item));
      continue;
    }
    groups.push({
      name: g.name,
      existing: Boolean(saved),
      attr2_name: attr2,
      variants: g.rows.map((r) => ({ item: r.item, option1: r.option1, option2: r.option2 })),
    });
  }
  return { groups, singles, misfits };
}

const mostCommon = (vals) => {
  const n = new Map();
  for (const v of vals) n.set(v, (n.get(v) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

const pushValue = (list, v) => {
  if (!v || list.some((x) => lc(x) === lc(v))) return false;
  list.push(v);
  return true;
};

/**
 * Saves grouped rows as matrix items inside the caller's transaction.
 * Row items need: row, name, nameKey, barcode, barcodeKey, cost, sellingPrice, topCustomerPrice, jobberPrice,
 * quantity, description, status; and optionally `given` ({ cost, sellingPrice, topCustomerPrice, jobberPrice, quantity,
 * status }: which of those the file really has). Without `given`, all of them count as given.
 *   mode 'skip':   an existing variant is left alone; a flat product with the row's name or barcode is
 *                  moved into the matrix item (renamed, grouped) without touching its prices or stock.
 *   mode 'update': both also get the row's prices, stock, barcode and status.
 * ctx: { matrices: Map lower(name) → saved matrix row, byBarcode, byName (Map → { id, name, matrix_id }),
 *        categoryOf(item), brandOf(item), defaultCategoryId, errors, canMove (false: leave flat products alone) }
 */
export async function saveMatrixGroups(db, groups, { mode, canMove = true, matrices, byBarcode, byName, categoryOf, brandOf, defaultCategoryId, errors }) {
  const out = { created: 0, updated: 0, skipped: 0, moved: 0, matricesCreated: 0, matricesUpdated: 0 };
  const used = new Set();
  const fail = (item, message) => errors.push({ row: item.row, name: item.name, message });

  for (const g of groups) {
    const items = g.variants.map((v) => v.item);
    let m = matrices.get(lc(g.name));
    if (!m) {
      const pick = (f) => items.map(f).find((x) => x) || null;
      const { rows } = await db.query(
        `INSERT INTO product_matrices (name, category_id, description, status, attr1_name, attr1_values, attr2_name, attr2_values,
                                       cost, selling_price, top_customer_price, jobber_price, brand_id)
         VALUES ($1,$2,$3,true,'Flavor','[]',$4,'[]',$5,$6,$7,$8,$9) RETURNING *`,
        [g.name, pick(categoryOf) || defaultCategoryId, pick((i) => i.description) || '', g.attr2_name,
          mostCommon(items.map((i) => i.cost)), mostCommon(items.map((i) => i.sellingPrice)),
          mostCommon(items.map((i) => i.topCustomerPrice)), mostCommon(items.map((i) => i.jobberPrice)), pick(brandOf)],
      );
      m = rows[0];
      matrices.set(lc(g.name), m);
      out.matricesCreated++;
    }
    const values1 = [...(m.attr1_values || [])];
    const values2 = [...(m.attr2_values || [])];
    const { rows: current } = await db.query(`SELECT id, option1, option2 FROM products WHERE matrix_id = $1 FOR UPDATE`, [m.id]);
    const variantByKey = new Map(current.map((p) => [pairKey(p.option1, p.option2), p]));
    let variantCount = current.length;
    let touched = false;

    for (const { item, option1, option2 } of g.variants) {
      const owner = item.barcodeKey ? byBarcode.get(item.barcodeKey) : null;
      const variant = variantByKey.get(pairKey(option1, option2));
      const values = [item.cost, item.sellingPrice, item.topCustomerPrice, item.jobberPrice, item.quantity, item.barcode || null, item.status];
      // For a product that already exists: only what the file really gives (item.given, set by the
      // import). A missing column or blank cell is null here and keeps the current value.
      const g = item.given;
      const keep = (has, v) => (!g || has ? v : null);
      const changes = [keep(g?.cost, item.cost), keep(g?.sellingPrice, item.sellingPrice), keep(g?.topCustomerPrice, item.topCustomerPrice),
        keep(g?.jobberPrice, item.jobberPrice), keep(g?.quantity, item.quantity), item.barcode || null, keep(g?.status, item.status)];

      if (variant) {
        if (owner && owner.id !== variant.id) {
          fail(item, `Barcode "${item.barcode}" is already held by "${owner.name}"`);
          continue;
        }
        if (mode === 'skip') {
          out.skipped++;
          continue;
        }
        await db.query(
          `UPDATE products SET cost=COALESCE($1, cost), selling_price=COALESCE($2, selling_price),
                  top_customer_price=COALESCE($3, top_customer_price), jobber_price=COALESCE($4, jobber_price),
                  quantity=COALESCE($5, quantity), barcode=COALESCE(NULLIF($6, ''), barcode), status=COALESCE($7, status),
                  updated_at=now() WHERE id=$8`,
          [...changes, variant.id],
        );
        if (item.barcodeKey) byBarcode.set(item.barcodeKey, { id: variant.id, name: variantName(m.name, option1, option2), matrix_id: m.id });
        out.updated++;
        touched = true;
        continue;
      }

      // A flat product already holding this row (same barcode, or the same "BASE (FLAVOR)" name) moves in.
      const byOldName = byName.get(item.nameKey);
      const flat = owner || (byOldName && !byOldName.matrix_id ? byOldName : null);
      if (flat && (flat.matrix_id || (owner && byOldName && !byOldName.matrix_id && byOldName.id !== owner.id))) {
        fail(item, `Barcode "${item.barcode}" is already held by "${flat.name}"`);
        continue;
      }
      if (flat && used.has(flat.id)) {
        fail(item, `Matches the same product as another row ("${flat.name}")`);
        continue;
      }
      if (flat && !canMove) {
        // Moving an existing product renames it: that needs product edit permission.
        out.skipped++;
        continue;
      }

      const newValue1 = !values1.some((x) => lc(x) === lc(option1));
      const newValue2 = option2 && !values2.some((x) => lc(x) === lc(option2));
      if ((newValue1 && values1.length >= MAX_VALUES) || (newValue2 && values2.length >= MAX_VALUES)) {
        fail(item, `Matrix item "${m.name}" already has ${MAX_VALUES} ${newValue1 ? m.attr1_name : m.attr2_name} values`);
        continue;
      }
      if (variantCount >= MAX_VARIANTS) {
        fail(item, `Matrix item "${m.name}" already has ${MAX_VARIANTS} variants`);
        continue;
      }
      pushValue(values1, option1);
      if (option2) pushValue(values2, option2);

      const name = variantName(m.name, option1, option2);
      let id;
      if (flat) {
        used.add(flat.id);
        const update = mode === 'update';
        await db.query(
          `UPDATE products SET matrix_id=$1, option1=$2, option2=$3, name=$4, category_id=$5, brand_id=$6,
                  description=COALESCE(NULLIF($7, ''), description),
                  ${update ? `cost=COALESCE($9, cost), selling_price=COALESCE($10, selling_price),
                  top_customer_price=COALESCE($11, top_customer_price), jobber_price=COALESCE($12, jobber_price),
                  quantity=COALESCE($13, quantity), barcode=COALESCE(NULLIF($14, ''), barcode), status=COALESCE($15, status),` : ''} updated_at=now()
            WHERE id=$8`,
          [m.id, option1, option2, name, m.category_id, m.brand_id, m.description, flat.id, ...(update ? changes : [])],
        );
        id = flat.id;
        byName.delete(lc(flat.name));
        out.moved++;
      } else {
        const { rows } = await db.query(
          `INSERT INTO products (name, cost, selling_price, top_customer_price, jobber_price, quantity, barcode, status,
                                 description, category_id, brand_id, matrix_id, option1, option2)
           VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7, ''),$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
          [name, ...values, m.description, m.category_id, m.brand_id, m.id, option1, option2],
        );
        id = rows[0].id;
        out.created++;
      }
      const entry = { id, name, matrix_id: m.id };
      byName.set(lc(name), entry);
      if (item.barcodeKey) byBarcode.set(item.barcodeKey, entry);
      variantByKey.set(pairKey(option1, option2), { id, option1, option2 });
      variantCount++;
      touched = true;
    }

    if (values1.length !== (m.attr1_values || []).length || values2.length !== (m.attr2_values || []).length) {
      await db.query(`UPDATE product_matrices SET attr1_values=$1, attr2_values=$2, updated_at=now() WHERE id=$3`, [
        JSON.stringify(values1), JSON.stringify(values2), m.id,
      ]);
      m.attr1_values = values1;
      m.attr2_values = values2;
    }
    if (touched && g.existing) out.matricesUpdated++;
  }
  return out;
}
