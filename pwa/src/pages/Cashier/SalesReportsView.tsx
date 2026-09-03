import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownLeft, 
  DollarSign, 
  CheckCircle2, 
  Coins
} from 'lucide-react';

interface SalesReportsViewProps {
  backendUrl: string;
  hardwareId: string;
  terminalName: string;
}

interface ExchangeSaleRecord {
  id: number;
  receipt_number: string;
  sale_type: 'buy' | 'sell';
  customer_name?: string;
  customer_id_number?: string;
  base_amount: string | number;
  currency_code: string;
  exchange_rate: string | number;
  total_mvr: string | number;
  payment_method_received?: string;
  payment_method_sent?: string;
  status: string;
  created_at: string;
}

export const SalesReportsView: React.FC<SalesReportsViewProps> = ({
  backendUrl,
  hardwareId,
  terminalName,
}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('viri_token') || '' : '';
  const bUrl = backendUrl || (typeof window !== 'undefined' ? localStorage.getItem('viri_backend_url') || `${window.location.origin}/api` : '');
  const hId = hardwareId || (typeof window !== 'undefined' ? localStorage.getItem('viri_hardware_id') || '' : '');

  const [sales, setSales] = useState<ExchangeSaleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'today' | 'all'>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('all');

  const fetchSales = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('hardware_id', hId);
      if (timeFilter === 'today') {
        params.append('today_only', '1');
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }

      const res = await fetch(`${bUrl}/terminal/exchange-sales?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error(`Failed to load sales records (${res.status})`);
      }

      const data = await res.json();
      setSales(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching exchange sales report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [timeFilter]);

  // Derived statistics
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (selectedCurrency !== 'all' && s.currency_code !== selectedCurrency) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesReceipt = s.receipt_number?.toLowerCase().includes(q);
        const matchesCustomer = s.customer_name?.toLowerCase().includes(q);
        const matchesId = s.customer_id_number?.toLowerCase().includes(q);
        return matchesReceipt || matchesCustomer || matchesId;
      }
      return true;
    });
  }, [sales, selectedCurrency, searchQuery]);

  const stats = useMemo(() => {
    let totalBoughtForeign = 0;
    let totalSoldForeign = 0;
    let totalMvrSettled = 0;
    const currencyBreakdown: Record<string, { bought: number; sold: number }> = {};

    filteredSales.forEach(s => {
      const baseAmt = parseFloat(String(s.base_amount || 0));
      const mvrAmt = parseFloat(String(s.total_mvr || 0));
      const curr = s.currency_code || 'USD';

      if (!currencyBreakdown[curr]) {
        currencyBreakdown[curr] = { bought: 0, sold: 0 };
      }

      if (s.sale_type === 'buy') {
        totalBoughtForeign += baseAmt;
        currencyBreakdown[curr].bought += baseAmt;
      } else {
        totalSoldForeign += baseAmt;
        currencyBreakdown[curr].sold += baseAmt;
      }
      totalMvrSettled += mvrAmt;
    });

    return {
      totalTransactions: filteredSales.length,
      totalBoughtForeign,
      totalSoldForeign,
      totalMvrSettled,
      currencyBreakdown
    };
  }, [filteredSales]);

  const uniqueCurrencies = useMemo(() => {
    const list = new Set<string>();
    sales.forEach(s => {
      if (s.currency_code) list.add(s.currency_code);
    });
    return Array.from(list);
  }, [sales]);

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Sales & Exchange Reports
              <span className="text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded uppercase">
                {terminalName}
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Currency exchange reports, volume breakdown, and shift settlement history.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSales}
            disabled={loading}
            className="btn btn-outline text-xs px-3 py-2 flex items-center gap-1.5 rounded-lg text-zinc-300 hover:text-white border-zinc-700"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span>Total Exchanges</span>
            <Coins size={14} className="text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {stats.totalTransactions}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">
            {timeFilter === 'today' ? "Today's completed sales" : 'All records'}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span>Foreign Curr Bought</span>
            <ArrowDownLeft size={14} className="text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono text-blue-400">
            {stats.totalBoughtForeign.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">We bought from customers</div>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span>Foreign Curr Sold</span>
            <ArrowUpRight size={14} className="text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-400">
            {stats.totalSoldForeign.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">We sold to customers</div>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <span>Total MVR Value</span>
            <DollarSign size={14} className="text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            MVR {stats.totalMvrSettled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Combined settlement volume</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-800/60 p-0.5">
            <button
              onClick={() => setTimeFilter('today')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                timeFilter === 'today'
                  ? 'bg-emerald-500 text-black shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                timeFilter === 'all'
                  ? 'bg-emerald-500 text-black shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              All Records
            </button>
          </div>

          {uniqueCurrencies.length > 0 && (
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Currencies</option>
              {uniqueCurrencies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search receipt #, customer, ID..."
            className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* Sales Transactions Table */}
      <div className="border border-zinc-800 rounded-xl bg-zinc-900/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/60 border-b border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Foreign Amount</th>
                <th className="py-3 px-4">Rate</th>
                <th className="py-3 px-4">MVR Total</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans">
              {loading && sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500">
                    <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-emerald-400" />
                    Loading exchange sales records...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500">
                    <FileSpreadsheet size={24} className="mx-auto mb-2 opacity-30" />
                    No sales or exchange records found for this view.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {sale.receipt_number || `#${sale.id}`}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                      {new Date(sale.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded font-mono ${
                        sale.sale_type === 'buy'
                          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}>
                        {sale.sale_type === 'buy' ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                        {sale.sale_type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-200">
                        {sale.customer_name || 'Walk-in Customer'}
                      </div>
                      {sale.customer_id_number && (
                        <div className="text-[10px] font-mono text-zinc-500">
                          {sale.customer_id_number}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {parseFloat(String(sale.base_amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} {sale.currency_code}
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-400">
                      {parseFloat(String(sale.exchange_rate || 0)).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                      MVR {parseFloat(String(sale.total_mvr || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        <CheckCircle2 size={10} />
                        Completed
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modular notice for upcoming report extensions */}
      <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
          <Coins size={16} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-zinc-300">Sales & Exchange Reports Architecture</h4>
          <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
            All current and future counter reports for currency exchange, shift balancing, CTR threshold tracking, and exportable financial logs are consolidated under this Sales Reports module.
          </p>
        </div>
      </div>
    </div>
  );
};
