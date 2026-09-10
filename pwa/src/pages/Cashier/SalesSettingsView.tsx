import React, { useState, useEffect } from 'react';
import {
  Coins,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  X,
  Sliders,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle
} from 'lucide-react';

interface SalesSettingsViewProps {
  backendUrl?: string;
  hardwareId?: string;
}

interface CurrencyItem {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  symbol: string | null;
  buy_rate: number | null;
  sell_rate: number | null;
  is_active: boolean;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export const SalesSettingsView: React.FC<SalesSettingsViewProps> = ({ backendUrl, hardwareId }) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('viri_token') || '' : '';
  const bUrl = backendUrl || (typeof window !== 'undefined' ? localStorage.getItem('viri_backend_url') || `${window.location.origin}/api` : '');
  const hId = hardwareId || (typeof window !== 'undefined' ? localStorage.getItem('viri_hardware_id') || '' : '');

  const [currencies, setCurrencies] = useState<CurrencyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<CurrencyItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    symbol: '$',
    buy_rate: '',
    sell_rate: '',
    is_active: true,
  });

  const fetchCurrencies = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`${bUrl}/terminal/currencies?hardware_id=${encodeURIComponent(hId)}`, {
        headers: {
          'Accept': 'application/json',
          'X-Hardware-Id': hId,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        const data = await res.json();
        setCurrencies(Array.isArray(data) ? data : []);
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Failed to fetch currencies for terminal');
      }
    } catch (e: any) {
      console.error('Error fetching terminal currencies:', e);
      setErrorMessage(e?.message || 'Network error fetching currencies');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCurrencies();
  }, [bUrl, hId]);

  const openAddModal = () => {
    setEditingCurrency(null);
    setFormData({
      code: '',
      name: '',
      symbol: '$',
      buy_rate: '',
      sell_rate: '',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (currency: CurrencyItem) => {
    setEditingCurrency(currency);
    setFormData({
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol || '$',
      buy_rate: currency.buy_rate !== null ? String(currency.buy_rate) : '',
      sell_rate: currency.sell_rate !== null ? String(currency.sell_rate) : '',
      is_active: Boolean(currency.is_active),
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.name.trim()) {
      alert('Please fill in Currency Code and Name.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const url = editingCurrency
        ? `${bUrl}/terminal/currencies/${editingCurrency.id}`
        : `${bUrl}/terminal/currencies`;

      const method = editingCurrency ? 'PUT' : 'POST';

      const payload: any = {
        hardware_id: hId,
        code: formData.code.toUpperCase().trim(),
        name: formData.name.trim(),
        symbol: formData.symbol.trim() || '$',
        buy_rate: formData.buy_rate ? parseFloat(formData.buy_rate) : null,
        sell_rate: formData.sell_rate ? parseFloat(formData.sell_rate) : null,
        is_active: formData.is_active,
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Hardware-Id': hId,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsModalOpen(false);
        setSuccessMessage(editingCurrency ? `Updated rate for ${payload.code}` : `Added currency ${payload.code}`);
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchCurrencies(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.message || 'Failed to save currency rate');
      }
    } catch (e: any) {
      console.error('Error saving currency:', e);
      alert(e?.message ? `Error: ${e.message}` : 'Network error saving currency');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (currency: CurrencyItem) => {
    if (currency.is_default) {
      alert('Base currency cannot be deactivated.');
      return;
    }

    try {
      const res = await fetch(`${bUrl}/terminal/currencies/${currency.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Hardware-Id': hId,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          hardware_id: hId,
          is_active: !currency.is_active
        })
      });

      if (res.ok) {
        setCurrencies(prev => prev.map(c => c.id === currency.id ? { ...c, is_active: !c.is_active } : c));
        setSuccessMessage(`${currency.code} ${!currency.is_active ? 'activated' : 'deactivated'}`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to update currency status');
      }
    } catch (e: any) {
      alert('Network error updating status');
    }
  };

  const handleDelete = async (currency: CurrencyItem) => {
    if (currency.is_default) {
      alert('Base currency (MVR) cannot be deleted.');
      return;
    }

    if (!confirm(`Are you sure you want to remove ${currency.code} (${currency.name}) from supported currencies?`)) {
      return;
    }

    try {
      const res = await fetch(`${bUrl}/terminal/currencies/${currency.id}?hardware_id=${encodeURIComponent(hId)}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'X-Hardware-Id': hId,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        setSuccessMessage(`Removed currency ${currency.code}`);
        setTimeout(() => setSuccessMessage(null), 3000);
        await fetchCurrencies(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to delete currency');
      }
    } catch (e) {
      alert('Error deleting currency');
    }
  };

  const activeCount = currencies.filter(c => c.is_active).length;
  const baseCurrency = currencies.find(c => c.is_default) || currencies.find(c => c.code === 'MVR');

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 space-y-6 animate-fade-in overflow-y-auto">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-card)] border border-[var(--border-color)] p-5 md:p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Sliders size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Sales Settings</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Live Rates
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Adjust currency exchange rates and manage active counter currencies directly from this cashier terminal.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchCurrencies(true)}
            disabled={refreshing || loading}
            className="p-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-white/5 text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh Rates"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin text-emerald-400' : ''} />
          </button>
          <button
            onClick={openAddModal}
            className="btn btn-primary bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all"
          >
            <Plus size={16} /> Add Currency
          </button>
        </div>
      </div>

      {/* Status Notifications */}
      {successMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* KPI Overview Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Trading Currencies</div>
            <div className="text-xl font-bold text-white mt-1">{activeCount} / {currencies.length} Active</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
            <Coins size={18} />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Base Currency</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">{baseCurrency?.code || 'MVR'} ({baseCurrency?.symbol || 'Rf'})</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <TrendingUp size={18} />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Terminal Hardware</div>
            <div className="text-xs font-mono font-bold text-zinc-300 mt-1.5 truncate max-w-[180px]">{hId || 'Standalone'}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center text-xs font-bold">
            PWA
          </div>
        </div>
      </div>

      {/* Main Rates Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--text-secondary)] space-y-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl">
          <Loader2 size={32} className="animate-spin text-emerald-400" />
          <p className="text-xs font-medium">Loading counter currencies & live rates...</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
          <div className="p-4 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[var(--bg-surface)]/40">
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Configured Rates & Limits</span>
              <span className="text-[10px] text-zinc-400 font-normal">
                (Changes made here instantly apply to new sales transactions)
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 flex items-center gap-4">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span> Buy = We buy from customer</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span> Sell = We sell to customer</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--bg-surface)] text-[var(--text-secondary)] border-b border-[var(--border-color)] uppercase tracking-wider text-[10px]">
                  <th className="text-left px-5 py-3.5 font-bold">Currency</th>
                  <th className="text-left px-5 py-3.5 font-bold">Full Name</th>
                  <th className="text-center px-5 py-3.5 font-bold">Symbol</th>
                  <th className="text-right px-5 py-3.5 font-bold">
                    <div className="flex items-center justify-end gap-1">
                      <ArrowDownLeft size={12} className="text-emerald-400" />
                      <span>Buy Rate (MVR)</span>
                    </div>
                  </th>
                  <th className="text-right px-5 py-3.5 font-bold">
                    <div className="flex items-center justify-end gap-1">
                      <ArrowUpRight size={12} className="text-amber-400" />
                      <span>Sell Rate (MVR)</span>
                    </div>
                  </th>
                  <th className="text-right px-5 py-3.5 font-bold">Spread</th>
                  <th className="text-center px-5 py-3.5 font-bold">Status</th>
                  <th className="text-right px-5 py-3.5 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {currencies.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-[var(--text-secondary)]">
                      No currencies configured yet. Click "+ Add Currency" above to get started.
                    </td>
                  </tr>
                ) : (
                  currencies.map(c => {
                    const spread = (c.sell_rate !== null && c.buy_rate !== null)
                      ? (Number(c.sell_rate) - Number(c.buy_rate)).toFixed(4)
                      : null;

                    return (
                      <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4 font-mono font-bold text-white flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-black">
                            {c.code}
                          </span>
                          {c.is_default && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold uppercase tracking-wide">
                              Base
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-medium text-white">{c.name}</td>
                        <td className="px-5 py-4 text-center font-mono text-zinc-300 font-bold">{c.symbol || '—'}</td>
                        <td className="px-5 py-4 text-right font-mono font-bold text-emerald-400 text-sm">
                          {c.buy_rate !== null ? Number(c.buy_rate).toFixed(4) : '—'}
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-bold text-amber-400 text-sm">
                          {c.sell_rate !== null ? Number(c.sell_rate).toFixed(4) : '—'}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-zinc-400 text-[11px]">
                          {spread !== null ? (
                            <span className={Number(spread) > 0 ? 'text-zinc-300' : 'text-zinc-500'}>
                              {spread}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(c)}
                            disabled={c.is_default}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 transition-all ${
                              c.is_active
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
                            } ${c.is_default ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                            title={c.is_default ? 'Base currency is always active' : 'Click to toggle active status'}
                          >
                            {c.is_active ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                            <span>{c.is_active ? 'Active' : 'Disabled'}</span>
                          </button>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(c)}
                              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-colors flex items-center gap-1 font-semibold text-[11px]"
                              title="Edit Currency & Rates"
                            >
                              <Edit2 size={12} />
                              <span>Edit Rates</span>
                            </button>
                            {!c.is_default && (
                              <button
                                onClick={() => handleDelete(c)}
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                                title="Remove Currency"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Currency Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Coins size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingCurrency ? `Adjust Rates: ${editingCurrency.code}` : 'Add New Currency'}
                  </h3>
                  <p className="text-[10px] text-[var(--text-secondary)]">Counter exchange parameters</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/5"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label font-bold text-zinc-300">Currency Code *</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="e.g. USD, EUR, INR"
                    value={formData.code}
                    disabled={!!editingCurrency}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="input-field py-2.5 text-xs font-mono uppercase disabled:opacity-60 font-bold"
                  />
                </div>
                <div>
                  <label className="input-label font-bold text-zinc-300">Symbol</label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="e.g. $, €, £, Rf"
                    value={formData.symbol}
                    onChange={e => setFormData({ ...formData, symbol: e.target.value })}
                    className="input-field py-2.5 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="input-label font-bold text-zinc-300">Currency Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. US Dollar, Euro, British Pound"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="input-field py-2.5 text-xs"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3">
                <div className="text-[11px] font-bold text-white flex items-center justify-between">
                  <span>Exchange Rates vs MVR</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Per 1 unit of foreign curr</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wide mb-1">
                      Buy Rate (We Buy)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder="e.g. 15.42"
                      value={formData.buy_rate}
                      onChange={e => setFormData({ ...formData, buy_rate: e.target.value })}
                      className="input-field py-2.5 text-xs font-mono font-bold text-emerald-400 border-emerald-500/30 focus:border-emerald-400"
                    />
                    <span className="text-[9px] text-zinc-500 block mt-0.5">Rate given when customer sells to us</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-1">
                      Sell Rate (We Sell)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder="e.g. 17.50"
                      value={formData.sell_rate}
                      onChange={e => setFormData({ ...formData, sell_rate: e.target.value })}
                      className="input-field py-2.5 text-xs font-mono font-bold text-amber-400 border-amber-500/30 focus:border-amber-400"
                    />
                    <span className="text-[9px] text-zinc-500 block mt-0.5">Rate charged when customer buys from us</span>
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] cursor-pointer pt-1 select-none">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500/30"
                />
                <span className="text-zinc-300 font-medium">Active (available in Counter Sales screen)</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : editingCurrency ? 'Save Rate' : 'Add Currency'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default SalesSettingsView;
