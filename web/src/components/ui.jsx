import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CirclePlus, EllipsisVertical, LoaderCircle, Save, TriangleAlert, X } from 'lucide-react';

// Classes below are copied from the original finance app so the replica looks identical.

export const inputCls =
  'mt-1 block text-gray-700 p-2 w-full border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600';
export const labelCls = (required) => `block text-sm font-medium ${required ? 'text-red-500' : 'text-gray-600'}`;

export function Field({ label, required, error, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelCls(required)}>
        {label} {required ? '*' : ''}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export const Loader = ({ size = 36, color = 'text-purple-600', className = '' }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <LoaderCircle className={`animate-spin ${color}`} style={{ width: size, height: size }} />
  </div>
);

export const FullPageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
    <LoaderCircle className="h-12 w-12 animate-spin text-white" />
  </div>
);

export function PageHeader({ title, actionLabel, onAction, children }) {
  return (
    <div className="flex justify-between items-center">
      <h1 className="text-2xl font-bold text-gray-950 ">{title}</h1>
      <div className="flex items-center gap-2">
        {children}
        {actionLabel && (
          <button
            onClick={onAction}
            className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2"
          >
            <CirclePlus size={14} /> {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function ListToolbar({ search, onSearch, placeholder = 'Search...', limit, onLimit, children }) {
  return (
    <div className="flex flex-col md:flex-row justify-between gap-4">
      <div className="flex flex-col md:flex-row gap-2 w-full">
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-1/3 focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-950"
        />
        {children}
      </div>
      <select
        value={limit}
        onChange={(e) => onLimit(Number(e.target.value))}
        className="border border-gray-300 px-3 py-2 rounded-md bg-white  text-gray-950   focus:outline-none focus:ring-2 focus:ring-purple-600"
      >
        {[10, 25, 50].map((n) => (
          <option key={n} value={n} className="text-gray-950 ">
            {n} / page
          </option>
        ))}
      </select>
    </div>
  );
}

export function Table({ headers, children }) {
  return (
    <div className="w-full rounded-lg border border-gray-100 overflow-x-auto">
      <table className="w-full bg-white text-sm text-gray-950 border-collapse border border-gray-100">
        <thead className="bg-gray-100 uppercase text-xs font-semibold">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left border-b border-gray-100 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableState({ loading, empty, colSpan, emptyText }) {
  if (loading)
    return (
      <tr>
        <td className="text-center py-2 text-gray-950  font-semibold" colSpan={colSpan}>
          <Loader />
        </td>
      </tr>
    );
  if (empty)
    return (
      <tr>
        <td colSpan={colSpan} className="text-center py-4 font-semibold">
          {emptyText}
        </td>
      </tr>
    );
  return null;
}

function ActionMenu({ row, actions }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef(null);
  const menu = useRef(null);
  useLayoutEffect(() => {
    if (open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right - 160 });
    }
  }, [open]);
  useEffect(() => {
    const close = (e) => {
      if (menu.current && !menu.current.contains(e.target) && btn.current && !btn.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <>
      <button ref={btn} onClick={() => setOpen(!open)} className="p-1 rounded-full hover:bg-gray-200 transition-colors " aria-label="Actions">
        <EllipsisVertical size={20} className="text-gray-600 cursor-pointer" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            style={{ top: `${pos.top}px`, left: `${Math.max(pos.left, 8)}px` }}
            className="fixed min-w-[160px] bg-white rounded-md shadow-lg border border-gray-200 z-50"
          >
            <ul>
              {actions.map((a) => (
                <li key={a.label}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      a.onClick(row);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer whitespace-nowrap"
                  >
                    {a.icon}
                    {a.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}

export function Row({ index, row, columns, actions }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-1 text-sm text-gray-700">{index}</td>
      {columns.map((c, i) => (
        <td key={i} className="px-3 py-2 text-sm text-gray-500 font-medium">
          {c}
        </td>
      ))}
      {actions && actions.length > 0 && (
        <td className="px-3 py-1">
          <div className="flex justify-start">
            <ActionMenu row={row} actions={actions} />
          </div>
        </td>
      )}
    </tr>
  );
}

export function Pagination({ pagination, onPage }) {
  const { total = 0, page = 1, limit = 10, totalPages = 0 } = pagination || {};
  const from = total > 0 ? (page - 1) * limit + 1 : 0;
  const to = Math.min(page * limit, total);
  const pages = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pages.push(p);
  const btn = 'min-w-8 h-8 px-2 rounded-md border text-sm font-medium flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-default';
  return (
    <div className="flex justify-between items-center mt-4">
      <p className="text-gray-950 text-sm font-medium">
        Showing {from} to {to} of {total} entries
      </p>
      <div className="flex gap-1.5">
        <button className={`${btn} border-gray-200 text-purple-600`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`${btn} ${p === page ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-200 text-purple-600 hover:bg-purple-50'}`}
          >
            {p}
          </button>
        ))}
        <button
          className={`${btn} border-gray-200 text-purple-600`}
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl' };

export function Modal({ isOpen, onClose, title, children, size = '2xl' }) {
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10" onClick={onClose}>
        <div className={`w-full ${SIZES[size]} rounded-lg bg-white shadow-lg`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <h2 className="text-xl font-bold text-gray-600 font-sans">{title}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 cursor-pointer" aria-label="Close modal">
              <X size={24} />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Deletion',
  message = 'Are you sure you want to proceed? This action cannot be undone.',
  isDeleting = false,
  confirmLabel = 'Confirm',
}) {
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={isDeleting ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="absolute top-2 right-2 rounded-full p-1 text-gray-500 hover:bg-gray-100 cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <TriangleAlert className="h-6 w-6 text-red-600" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-gray-950">{title}</h3>
            <div className="mt-2 text-sm font-medium text-gray-600">{message}</div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex w-full items-center justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none cursor-pointer disabled:opacity-70"
            >
              {isDeleting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? 'Loading...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function Toggle({ name, checked, onChange, disabled = false, className = '' }) {
  return (
    <label className={`inline-flex items-center cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <input
        type="checkbox"
        name={name}
        id={name}
        className="sr-only peer"
        checked={Boolean(checked)}
        onChange={() => !disabled && onChange(!checked)}
        disabled={disabled}
      />
      <div className="relative w-11 h-6 bg-gray-200 peer-checked:bg-purple-600 rounded-full peer-focus:ring-2 peer-focus:ring-purple-600 transition-all duration-300">
        <div
          className={`absolute top-0.5 left-1 w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-full' : ''}`}
        />
      </div>
    </label>
  );
}

export function Checkbox({ checked, onChange, disabled = false, name }) {
  return (
    <label className="custom-checkbox-container">
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => !disabled && onChange(e.target.checked)} disabled={disabled} name={name} />
      <span className="checkmark" />
    </label>
  );
}

export function SubmitButton({ isLoading = false, isDisabled = false, mode = 'create', onClick, children, type = 'submit', icon }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isLoading || isDisabled}
      className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md shadow-sm hover:bg-gray-950 focus:outline-none flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
    >
      {isLoading ? <LoaderCircle size={16} className="animate-spin" /> : icon || <Save size={16} />}
      {children || (isLoading ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Create')}
    </button>
  );
}

export const CancelButton = ({ onClick, children = 'Cancel' }) => (
  <button type="button" onClick={onClick} className="bg-gray-200 hover:bg-gray-300 text-gray-600 font-semibold py-2 px-4 rounded cursor-pointer">
    {children}
  </button>
);

export function Avatar({ name, sub }) {
  const c = (name || '').trim().charAt(0).toUpperCase();
  return (
    <div className="flex items-center">
      <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full mr-3 border border-purple-600 bg-purple-600 text-white font-semibold text-xl">
        {c || '?'}
      </div>
      <div>
        <span className="font-medium text-gray-600 capitalize">{name || 'Deleted'}</span>
        {sub && <p className="text-gray-500 text-xs font-medium">{sub}</p>}
      </div>
    </div>
  );
}

const STATUS = {
  paid: 'bg-emerald-100 text-emerald-700',
  unpaid: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-gray-100 text-gray-700',
};
export const StatusBadge = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium capitalize ${STATUS[status] || 'bg-gray-100 text-gray-700'}`}>
    {status}
  </span>
);

// Debounced value for search boxes.
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
