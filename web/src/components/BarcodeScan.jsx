import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, PackagePlus, ScanBarcode, ScanLine, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Modal } from './ui.jsx';

// Saved per browser: a till keeps its own scan mode and sound choice.
export function useStoredFlag(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : v === '1';
    } catch {
      return initial;
    }
  });
  const set = (v) => {
    setValue(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      /* private window: keep it for this visit only */
    }
  };
  return [value, set];
}

// Short beep so the cashier hears each scan without looking at the screen: high = added, low = problem.
let audio;
export function beep(ok) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const tone = (freq, start, length) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = ok ? 'sine' : 'square';
      o.frequency.value = freq;
      g.gain.value = ok ? 0.15 : 0.06;
      o.connect(g);
      g.connect(audio.destination);
      o.start(audio.currentTime + start);
      o.stop(audio.currentTime + start + length);
    };
    if (ok) tone(1400, 0, 0.08);
    else {
      tone(220, 0, 0.15);
      tone(180, 0.2, 0.2);
    }
  } catch {
    /* no audio device */
  }
}

// Puts a React-controlled field back to an earlier value (React only notices a native "input" event).
function setFieldValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// USB / Bluetooth scanners act like a keyboard: they type the code very fast and press Enter.
// While scan mode is on, such a burst counts as a scan wherever the cursor is, not just in the scan box:
// - focus on a button or the page (or the "not found" popup is open): 3+ characters, each within 80 ms;
// - focus in another field (quantity, customer name...): stricter, 6+ characters each within 50 ms,
//   which no one types by hand. The field gets its old value back and the Enter doesn't submit the invoice.
// Anything inside [data-no-scan] (the quick add form) is left alone.
const PAGE_GAP_MS = 80;
const FIELD_GAP_MS = 50;
function useScannerKeys(enabled, onScan, boxRef) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  useEffect(() => {
    if (!enabled) return undefined;
    let buffer = '';
    let last = 0;
    let before = null; // { el, value } of the field the burst started in
    const onKey = (e) => {
      const el = e.target;
      if (el === boxRef.current) return; // the scan box handles its own Enter
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el.tagName === 'SELECT' || el.isContentEditable || el.closest?.('[data-no-scan]')) return;
      const field = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
      const now = performance.now();
      if (now - last > (field ? FIELD_GAP_MS : PAGE_GAP_MS)) {
        buffer = '';
        before = field ? { el, value: el.value } : null;
      }
      last = now;
      if (e.key === 'Enter') {
        if (buffer.length >= (field ? 6 : 3)) {
          e.preventDefault(); // don't click the focused button or submit the invoice
          e.stopPropagation();
          if (before?.el === el) setFieldValue(el, before.value);
          onScanRef.current(buffer);
        }
        buffer = '';
        before = null;
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, boxRef]);
}

// The bar above the invoice lines. Off: one "Scan barcodes" button. On: a scan box that keeps focus,
// so every scan adds the item (or +1 if it's already on the invoice) and clears for the next one.
export function ScanBar({ enabled, onToggle, onScan, status, boxRef, sound, onSound, busy }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  useScannerKeys(enabled, onScan, boxRef);

  if (!enabled) {
    return (
      <button
        type="button"
        onClick={() => onToggle(true)}
        className="mb-3 flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 cursor-pointer"
      >
        <ScanBarcode size={18} /> {t('scan.start', 'Scan barcodes')}
      </button>
    );
  }

  const submit = () => {
    const value = code.trim();
    setCode('');
    if (value) onScan(value);
  };
  const ring = !status ? 'border-purple-300 focus:ring-purple-600' : status.ok ? 'border-green-500 focus:ring-green-600' : 'border-red-500 focus:ring-red-600';

  return (
    <div className="mb-3 rounded-lg border border-purple-200 bg-purple-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <ScanLine size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-600 pointer-events-none" />
          <input
            ref={boxRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              // Enter ends a scan; some scanners send Tab instead.
              if (e.key === 'Enter' || (e.key === 'Tab' && code.trim())) {
                e.preventDefault();
                submit();
              }
            }}
            autoComplete="off"
            inputMode="numeric"
            aria-label={t('scan.box', 'Scan or type a barcode')}
            placeholder={t('scan.box_hint', 'Scan barcode (or type + Enter)')}
            className={`h-12 w-full rounded-md border-2 bg-white pl-11 pr-10 text-lg tracking-wide text-gray-950 focus:outline-none focus:ring-2 ${ring}`}
          />
          {busy && <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-purple-600" />}
        </div>
        <button
          type="button"
          onClick={() => onSound(!sound)}
          title={sound ? t('scan.sound_off', 'Turn scan beep off') : t('scan.sound_on', 'Turn scan beep on')}
          aria-label={sound ? t('scan.sound_off', 'Turn scan beep off') : t('scan.sound_on', 'Turn scan beep on')}
          className="h-12 w-12 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 cursor-pointer"
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button
          type="button"
          onClick={() => onToggle(false)}
          className="h-12 px-3 flex items-center gap-1.5 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer"
        >
          <X size={16} /> {t('scan.stop', 'Stop scanning')}
        </button>
      </div>
      <p className={`mt-2 text-sm ${!status ? 'text-gray-500' : status.ok ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}`} aria-live="polite">
        {status ? status.text : t('scan.ready', 'Ready. Each scan adds 1; scanning the same item again adds 1 more.')}
      </p>
    </div>
  );
}

const fieldCls = 'mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600';

// Quick add for a barcode that isn't in the catalog yet. Only the basics a cashier knows;
// the other prices start at the selling price and can be changed later under Products.
// autoFill: the barcode is on the store's barcode list, so fill in from it straight away.
function QuickAddProduct({ code, onBack, onCreated, autoFill = false }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', category_id: '', selling_price: '', quantity: '1', cost: '' });
  const [categories, setCategories] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [note, setNote] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api.get('/categories/options').then((r) => setCategories(r.data)).catch(() => setCategories([]));
  }, []);

  const lookup = async () => {
    setLookingUp(true);
    setNote('');
    try {
      const { data } = await api.get('/products/lookup-barcode', { barcode: code });
      if (data?.found && data.product) {
        setForm((f) => ({ ...f, name: data.product.name || f.name, category_id: data.matchedCategory?.id || f.category_id }));
        setNote(`${t('scan.found_via', 'Found via')} ${data.source || 'barcode lookup'}`);
      } else {
        setNote(data?.message || t('scan.lookup_none', 'No details found for this barcode. Type them in.'));
      }
    } catch (err) {
      setNote(err.message);
    } finally {
      setLookingUp(false);
    }
  };

  useEffect(() => {
    if (autoFill) lookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setErrors({});
    setSaving(true);
    const price = form.selling_price;
    try {
      await api.post('/products', {
        name: form.name,
        category_id: form.category_id,
        selling_price: price,
        top_customer_price: price,
        jobber_price: price,
        cost: form.cost === '' ? 0 : form.cost,
        quantity: form.quantity,
        barcode: code,
        description: '',
        status: true,
      });
      const { data } = await api.get('/products/scan', { code });
      if (!data.product) throw new Error(t('scan.saved_not_found', 'Product saved, but it could not be added. Scan it again.'));
      onCreated(data.product);
    } catch (err) {
      setErrors(err.errors || {});
      if (!err.errors || !Object.keys(err.errors).length) setErrors({ form: err.message });
      setSaving(false);
    }
  };

  const err = (k) => errors[k] && <p className="mt-1 text-xs text-red-600">{errors[k]}</p>;

  return (
    <form onSubmit={save} className="space-y-3" data-no-scan>
      <div className="flex items-center justify-between gap-2 rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
        <span className="text-gray-600">
          {t('scan.barcode', 'Barcode')}: <span className="font-mono font-semibold text-gray-950">{code}</span>
        </span>
        <button
          type="button"
          onClick={lookup}
          disabled={lookingUp}
          className="flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 cursor-pointer disabled:opacity-60"
        >
          {lookingUp ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {t('scan.lookup', 'Fill in from barcode')}
        </button>
      </div>
      {note && <p className="text-xs text-purple-700">{note}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="sm:col-span-2 block text-sm font-medium text-gray-700">
          {t('scan.name', 'Product name')} <span className="text-red-500">*</span>
          <input autoFocus required maxLength={200} value={form.name} onChange={set('name')} className={fieldCls} />
          {err('name')}
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t('scan.category', 'Category')} <span className="text-red-500">*</span>
          <select required value={form.category_id} onChange={set('category_id')} className={`${fieldCls} bg-white`}>
            <option value="">{categories === null ? t('scan.loading', 'Loading...') : t('scan.pick_category', 'Select category')}</option>
            {(categories || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {err('category_id')}
          {categories?.length === 0 && <p className="mt-1 text-xs text-gray-500">{t('scan.no_categories', 'No categories yet: add one under Categories first.')}</p>}
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t('scan.selling_price', 'Selling price')} <span className="text-red-500">*</span>
          <input required type="number" min="0" step="0.01" value={form.selling_price} onChange={set('selling_price')} className={fieldCls} />
          {err('selling_price')}
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t('scan.stock', 'Stock on hand')} <span className="text-red-500">*</span>
          <input required type="number" step="1" value={form.quantity} onChange={set('quantity')} className={fieldCls} />
          {err('quantity')}
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t('scan.cost', 'Cost (optional)')}
          <input type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')} className={fieldCls} />
          {err('cost')}
        </label>
      </div>
      <p className="text-xs text-gray-500">{t('scan.price_note', 'Top customer and jobber prices start at the selling price; change them later under Products.')}</p>
      {(errors.form || errors.barcode) && <p className="text-sm text-red-600">{errors.form || errors.barcode}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 cursor-pointer">
          {t('scan.back', 'Back')}
        </button>
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 rounded-md hover:bg-purple-700 cursor-pointer disabled:opacity-70">
          {saving ? t('action.saving', 'Saving...') : t('scan.save_add', 'Save & add to invoice')}
        </button>
      </div>
    </form>
  );
}

// Popup for a scan that did not add anything: unknown barcode, product turned off, not enough stock,
// or the lookup failed. Scanning the next item closes it (see useScannerKeys).
export function ScanProblemModal({ problem, onClose, canCreate, onCreated }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  useEffect(() => setAdding(false), [problem]);
  useEffect(() => {
    if (!problem || adding) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [problem, adding, onClose]);
  if (!problem) return null;

  const { kind, code, listed } = problem;
  const title = {
    notFound: listed ? t('scan.not_in_products', 'Not in your products') : t('scan.not_found', 'Product not found'),
    inactive: t('scan.inactive', 'Product is turned off'),
    noStock: t('scan.no_stock', 'Not enough stock'),
    error: t('scan.failed', 'Scan failed'),
  }[kind];

  if (adding) {
    return (
      <Modal isOpen onClose={onClose} title={t('scan.add_title', 'Add new product')} size="xl">
        <QuickAddProduct code={code} onBack={() => setAdding(false)} onCreated={onCreated} autoFill={Boolean(listed)} />
      </Modal>
    );
  }

  if (kind === 'notFound' && listed) {
    const details = [listed.brand, listed.size].filter(Boolean).join(' · ');
    return (
      <Modal isOpen onClose={onClose} title={title} size="md">
        <div className="flex gap-3 rounded-md border border-purple-200 bg-purple-50/60 p-3">
          {listed.image ? (
            <img src={listed.image} alt="" className="h-20 w-20 shrink-0 rounded-md border border-gray-200 bg-white object-contain" />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400">
              <ScanBarcode size={28} />
            </div>
          )}
          <div className="min-w-0 space-y-1 text-sm">
            <p className="font-bold leading-snug text-gray-950">{listed.name}</p>
            {details && <p className="text-gray-700">{details}</p>}
            <p className="font-mono text-xs text-gray-500">{code}</p>
            <p className="text-xs font-medium text-purple-700">{t('scan.listed_note', 'From your barcode list. It is not one of your products, so it has no price or stock.')}</p>
          </div>
        </div>
        <div className="mt-3 space-y-1 text-sm text-gray-700">
          {!canCreate && <p className="text-gray-500">{t('scan.ask_manager', 'Ask a manager to add it under Products, or search for the item by name.')}</p>}
          <p className="text-xs text-gray-500">{t('scan.next_closes', 'Scanning the next item closes this message.')}</p>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {canCreate && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 cursor-pointer"
            >
              <PackagePlus size={16} /> {t('scan.add_product', 'Add as new product')}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-white bg-purple-600 rounded-md hover:bg-purple-700 cursor-pointer"
          >
            {t('scan.continue', 'Continue scanning')}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title={title} size="md">
      <div className="flex gap-3">
        <AlertTriangle size={28} className="shrink-0 text-red-500" />
        <div className="space-y-1 text-sm text-gray-700">
          {kind === 'notFound' && (
            <p>
              {t('scan.not_found_text', 'No product has this barcode:')} <span className="font-mono font-semibold text-gray-950">{code}</span>
            </p>
          )}
          {kind === 'inactive' && (
            <p>
              <span className="font-semibold text-gray-950">{problem.name}</span> ({code}){' '}
              {t('scan.inactive_text', 'is turned off, so it cannot be sold. Turn it on under Products.')}
            </p>
          )}
          {kind === 'noStock' && (
            <p>
              <span className="font-semibold text-gray-950">{problem.name}</span>: {t('scan.only', 'only')} {problem.stock} {t('scan.in_stock', 'in stock')}.{' '}
              {t('scan.no_stock_text', 'It was not added again. Receive more stock, or allow out-of-stock sales in Settings.')}
            </p>
          )}
          {kind === 'error' && <p>{problem.message}</p>}
          {kind === 'notFound' && !canCreate && <p className="text-gray-500">{t('scan.ask_manager', 'Ask a manager to add it under Products, or search for the item by name.')}</p>}
          <p className="pt-1 text-xs text-gray-500">{t('scan.next_closes', 'Scanning the next item closes this message.')}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {kind === 'notFound' && canCreate && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 cursor-pointer"
          >
            <PackagePlus size={16} /> {t('scan.add_product', 'Add as new product')}
          </button>
        )}
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="px-4 py-2 text-sm font-bold text-white bg-purple-600 rounded-md hover:bg-purple-700 cursor-pointer"
        >
          {t('scan.continue', 'Continue scanning')}
        </button>
      </div>
    </Modal>
  );
}
