import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { Barcode, ExternalLink, Loader2, Plus, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { CancelButton, Modal, inputCls } from './ui.jsx';

export default function BarcodeLookupModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setBarcode('');
      setResult(null);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleLookup = async (e) => {
    e?.preventDefault?.();
    const code = barcode.trim();
    if (!code) {
      toast.info('Please enter or scan a barcode');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.get(`/products/lookup-barcode?barcode=${encodeURIComponent(code)}`);
      setResult(res.data);
      if (!res.data.found) {
        toast.info(res.data.message || 'Product not found in Barcode Lookup database');
      }
    } catch (err) {
      if (err.errors?.code === 'NO_API_KEY') {
        setError('Barcode Lookup API key is not configured. Please set it up in Company Settings.');
      } else {
        setError(err.message || 'Lookup failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    const p = result?.product;
    onClose();
    navigate('/admin/products/new', {
      state: {
        prefill: {
          barcode: barcode.trim(),
          name: p?.name || '',
          description: p?.description || (p?.brand ? `Brand: ${p.brand}` : ''),
          category_id: result?.matchedCategory?.id || '',
          image: p?.image || '',
        },
      },
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Scan / Lookup Barcode">
      <div className="space-y-4">
        <form onSubmit={handleLookup} className="space-y-2">
          <label className="block text-xs font-semibold text-gray-700">
            Scan with barcode gun or enter barcode number:
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Barcode size={18} />
              </span>
              <input
                ref={inputRef}
                type="text"
                placeholder="Scan or type barcode (e.g. 012000000133)..."
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className={`${inputCls} pl-10 text-sm`}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !barcode.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md font-semibold text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span>{loading ? 'Searching...' : 'Lookup API'}</span>
            </button>
          </div>
        </form>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <p className="font-semibold">{error}</p>
            {error.includes('Settings') && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/admin/settings');
                }}
                className="mt-1.5 text-purple-700 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                Go to Settings <ExternalLink size={12} />
              </button>
            )}
          </div>
        )}

        {result && (
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
            {result.found && result.product ? (
              <div className="flex gap-3 items-start">
                {result.product.image ? (
                  <img
                    src={result.product.image}
                    alt={result.product.name}
                    className="w-16 h-16 object-contain rounded-md bg-white border border-gray-200 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-md bg-white border border-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                    <Barcode size={24} />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-bold text-gray-900 leading-snug">{result.product.name}</p>
                  {result.product.brand && (
                    <p className="text-xs text-purple-700 font-medium">Brand: {result.product.brand}</p>
                  )}
                  {result.product.category && (
                    <p className="text-xs text-gray-500 truncate">Category: {result.product.category}</p>
                  )}
                  {result.matchedCategory && (
                    <p className="text-[11px] text-emerald-700 font-semibold">
                      ✓ Matched in your categories: {result.matchedCategory.name}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-600">
                <p className="font-semibold text-gray-800">No match found on Barcode Lookup for &ldquo;{barcode}&rdquo;</p>
                <p className="mt-0.5 text-gray-500">You can still create a new product and assign this barcode manually.</p>
              </div>
            )}

            <div className="pt-2 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={handleCreate}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Plus size={14} />
                <span>Create Product with this Barcode</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <CancelButton onClick={onClose} label="Close" />
        </div>
      </div>
    </Modal>
  );
}
