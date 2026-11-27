import { Link } from 'react-router';
import { useMoney, formatDate } from '../auth.jsx';
import { ListToolbar, PageHeader, Pagination, Row, Table, TableState } from '../components/ui.jsx';
import { useList } from '../components/useList.js';
import { CUSTOMER_METHODS } from '../components/PaymentMethods.jsx';

// Older payments may say "cheque" or "bank".
const OLD_NAMES = { cheque: 'check', bank: 'bank_transfer' };
const methodLabel = (id) => CUSTOMER_METHODS.find((m) => m.id === (OLD_NAMES[id] || id))?.label || id;
const filterCls = 'border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600';

// Payment History: every payment received from customers, newest first (role permission
// "Payment History", view only). A reversed payment (Mark Unpaid) shows as a negative amount.
export default function Payments() {
  const money = useMoney();
  const list = useList('/payments', 'payments', ['from', 'until', 'method']);
  const { totalAmount = 0, canOpenCustomers = false } = list.meta;
  const headers = ['#', 'Payment', 'Date', 'Customer', 'Method', 'Reference / Notes', 'Recorded By', 'Amount'];
  const filtered = Boolean(list.search || list.filter('from') || list.filter('until') || list.filter('method'));

  return (
    <div className="space-y-4">
      <PageHeader title="Payment History" />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search payment #, customer, reference..." limit={list.limit} onLimit={list.setLimit}>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          From
          <input type="date" value={list.filter('from')} onChange={(e) => list.setFilter('from', e.target.value)} className={filterCls} />
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          To
          <input type="date" value={list.filter('until')} min={list.filter('from') || undefined} onChange={(e) => list.setFilter('until', e.target.value)} className={filterCls} />
        </label>
        <select value={list.filter('method')} onChange={(e) => list.setFilter('method', e.target.value)} className={filterCls} aria-label="Payment method">
          <option value="">All methods</option>
          {CUSTOMER_METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </ListToolbar>
      <p className="text-sm text-gray-600">
        {list.pagination.total} payment{list.pagination.total === 1 ? '' : 's'}
        {filtered ? ' found' : ''} · total <b className="text-gray-950">{money(totalAmount)}</b>
      </p>
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((p, i) => (
            <Row
              key={p.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={p}
              columns={[
                <span className="font-semibold text-gray-900">{p.paymentNumber}</span>,
                formatDate(p.paymentDate),
                p.customerId && canOpenCustomers ? (
                  <Link to={`/admin/customers/${p.customerId}`} className="text-purple-600 font-semibold">
                    {p.customerName}
                  </Link>
                ) : (
                  <span className="text-gray-900">
                    {p.customerName}
                    {!p.customerId && <span className="ml-1 text-[11px] text-gray-400">walk-in</span>}
                  </span>
                ),
                methodLabel(p.method),
                <span className="block max-w-xs text-xs">
                  {p.reference && <span className="block text-gray-700">{p.reference}</span>}
                  {p.notes && <span className="block text-gray-500">{p.notes}</span>}
                </span>,
                p.recordedBy || '-',
                <span className={`font-semibold ${p.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(p.amount)}</span>,
              ]}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No payments found" />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />
    </div>
  );
}
