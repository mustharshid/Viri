import { useState, useEffect } from 'react';
import { 
  Gift, Users, Award, DollarSign, Sliders, RefreshCw, 
  CheckCircle2, AlertCircle, Plus, Edit, Trash2, 
  Clock, CreditCard, Zap, Building
} from 'lucide-react';

interface ReferralSettingsManagerProps {
  token: string | null;
  verifySecurityPin: () => Promise<boolean>;
  customAlert: (msg: string) => Promise<void>;
  customConfirm: (msg: string) => Promise<boolean>;
}

export default function ReferralSettingsManager({
  token,
  verifySecurityPin,
  customAlert,
  customConfirm
}: ReferralSettingsManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'config' | 'tiers' | 'affiliates' | 'payouts'>('config');
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [tiers, setTiers] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({});
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  
  // Config form state
  const [payoutMode, setPayoutMode] = useState<'manual_request' | 'automated_batch'>('manual_request');
  const [minThreshold, setMinThreshold] = useState(500);
  const [autoPayoutDay, setAutoPayoutDay] = useState(1);
  const [discountEnabled, setDiscountEnabled] = useState(true);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [discountValue, setDiscountValue] = useState(10);
  const [gracePeriodDays, setGracePeriodDays] = useState(14);
  const [packageRules, setPackageRules] = useState<Record<string, { commission_pct: number; duration_months: number }>>({
    starter: { commission_pct: 15, duration_months: 12 },
    business: { commission_pct: 20, duration_months: 12 },
    enterprise: { commission_pct: 25, duration_months: 12 },
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Tier modal state
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<any | null>(null);
  const [tierForm, setTierForm] = useState({
    name: '',
    min_monthly_sales: 0,
    bonus_commission_pct: 0,
    badge_color: '#10B981',
    description: '',
    sort_order: 1,
  });

  // Payout actions
  const [selectedPayout, setSelectedPayout] = useState<any | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [receiptRef, setReceiptRef] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Search
  const [affiliateSearch, setAffiliateSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/referrals/config', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to fetch referral settings');
      const data = await res.json();
      
      setConfig(data.config);
      setTiers(data.tiers || []);
      setMetrics(data.metrics || {});

      if (data.config) {
        setPayoutMode(data.config.payout_mode || 'manual_request');
        setMinThreshold(data.config.min_payout_threshold || 500);
        setAutoPayoutDay(data.config.auto_payout_day_of_month || 1);
        setDiscountEnabled(data.config.customer_discount_enabled ?? true);
        setDiscountType(data.config.customer_discount_type || 'percentage');
        setDiscountValue(data.config.customer_discount_value || 10);
        setGracePeriodDays(data.config.commission_grace_period_days || 14);
        if (data.config.package_commission_rules) {
          setPackageRules(data.config.package_commission_rules);
        }
      }

      fetchAffiliates();
      fetchPayouts();
    } catch (e: any) {
      customAlert(e.message || 'Error loading referral data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAffiliates = async () => {
    try {
      const res = await fetch(`/api/admin/referrals/affiliates?search=${encodeURIComponent(affiliateSearch)}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setAffiliates(data.data || []);
      }
    } catch (e) {}
  };

  const fetchPayouts = async () => {
    try {
      const res = await fetch('/api/admin/referrals/payouts', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setPayouts(data.data || []);
      }
    } catch (e) {}
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await verifySecurityPin())) return;

    try {
      setSavingConfig(true);
      const res = await fetch('/api/admin/referrals/config', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Content-Type': 'application/json',
          'Accept': 'application/json' 
        },
        body: JSON.stringify({
          payout_mode: payoutMode,
          min_payout_threshold: Number(minThreshold),
          auto_payout_day_of_month: Number(autoPayoutDay),
          customer_discount_enabled: discountEnabled,
          customer_discount_type: discountType,
          customer_discount_value: Number(discountValue),
          package_commission_rules: packageRules,
          commission_grace_period_days: Number(gracePeriodDays),
          is_active: true,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update configuration');
      await customAlert('Referral system configuration updated successfully!');
      fetchData();
    } catch (err: any) {
      await customAlert(err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await verifySecurityPin())) return;

    try {
      const url = editingTier ? `/api/admin/referrals/tiers/${editingTier.id}` : '/api/admin/referrals/tiers';
      const method = editingTier ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Content-Type': 'application/json',
          'Accept': 'application/json' 
        },
        body: JSON.stringify(tierForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save tier');
      await customAlert(`Tier ${editingTier ? 'updated' : 'created'} successfully!`);
      setIsTierModalOpen(false);
      setEditingTier(null);
      fetchData();
    } catch (err: any) {
      await customAlert(err.message);
    }
  };

  const handleDeleteTier = async (tierId: number) => {
    if (!(await customConfirm('Are you sure you want to delete this performance tier?'))) return;
    if (!(await verifySecurityPin())) return;

    try {
      const res = await fetch(`/api/admin/referrals/tiers/${tierId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to delete tier');
      await customAlert('Tier deleted successfully!');
      fetchData();
    } catch (err: any) {
      await customAlert(err.message);
    }
  };

  const handleApprovePayout = async () => {
    if (!selectedPayout) return;
    if (!(await verifySecurityPin())) return;

    try {
      const res = await fetch(`/api/admin/referrals/payouts/${selectedPayout.id}/approve`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Content-Type': 'application/json',
          'Accept': 'application/json' 
        },
        body: JSON.stringify({
          transaction_receipt_ref: receiptRef,
          admin_notes: adminNotes,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve payout');
      await customAlert('Payout approved and marked as PAID!');
      setIsApproveModalOpen(false);
      setSelectedPayout(null);
      fetchData();
    } catch (err: any) {
      await customAlert(err.message);
    }
  };

  const handleRejectPayout = async () => {
    if (!selectedPayout) return;
    if (!rejectReason.trim()) {
      await customAlert('Please provide a reason for rejecting this payout.');
      return;
    }
    if (!(await verifySecurityPin())) return;

    try {
      const res = await fetch(`/api/admin/referrals/payouts/${selectedPayout.id}/reject`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Content-Type': 'application/json',
          'Accept': 'application/json' 
        },
        body: JSON.stringify({
          admin_notes: rejectReason,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject payout');
      await customAlert('Payout rejected and funds returned to affiliate available balance.');
      setIsRejectModalOpen(false);
      setSelectedPayout(null);
      fetchData();
    } catch (err: any) {
      await customAlert(err.message);
    }
  };

  const handleTriggerMaturity = async () => {
    try {
      const res = await fetch('/api/admin/referrals/maturity-check', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = await res.json();
      await customAlert(data.message || 'Maturity check completed.');
      fetchData();
    } catch (e: any) {
      await customAlert(e.message || 'Failed to trigger maturity check');
    }
  };

  const handleTriggerBatch = async () => {
    if (!(await customConfirm('Generate automated payout batches for all affiliates with balance >= minimum threshold?'))) return;
    if (!(await verifySecurityPin())) return;

    try {
      const res = await fetch('/api/admin/referrals/payouts/generate-batch', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = await res.json();
      await customAlert(data.message || 'Batch generation completed.');
      fetchData();
    } catch (e: any) {
      await customAlert(e.message || 'Failed to generate batches');
    }
  };

  if (loading && !config) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-2">
        <RefreshCw className="animate-spin text-yellow-500" size={24} />
        <span className="text-xs font-mono">Loading Referral & Affiliate Configuration...</span>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 rounded-2xl border border-zinc-800 bg-black/20 text-left max-w-6xl mx-auto shadow-xl flex flex-col gap-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Gift className="text-yellow-500" size={22} />
            Referral & Affiliate System Rules Engine
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Configure system-wide payout modes, volume-based performance tiers, dual-sided customer discounts, and package commission rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTriggerMaturity}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
            title="Mature pending commissions and evaluate monthly tier progressions"
          >
            <Clock size={13} className="text-amber-400" /> Mature Pending
          </button>
          <button
            onClick={handleTriggerBatch}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-all"
            title="Generate monthly payout batch for eligible affiliates"
          >
            <Zap size={13} /> Auto-Payout Batch
          </button>
          <button
            onClick={fetchData}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs"
            title="Refresh data"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 bg-black/40 border border-zinc-800/80 rounded-xl">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
            <Users size={12} className="text-blue-400" /> Active Affiliates
          </div>
          <div className="text-xl font-bold font-mono text-white">{metrics.active_affiliates || 0} / {metrics.total_affiliates || 0}</div>
        </div>

        <div className="p-3.5 bg-black/40 border border-zinc-800/80 rounded-xl">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
            <Building size={12} className="text-emerald-400" /> Total Attributions
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">{metrics.total_attributions || 0} clients</div>
        </div>

        <div className="p-3.5 bg-black/40 border border-zinc-800/80 rounded-xl">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
            <Clock size={12} className="text-amber-400" /> Pending Commissions
          </div>
          <div className="text-xl font-bold font-mono text-amber-400">MVR {Number(metrics.total_commissions_pending || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>

        <div className="p-3.5 bg-black/40 border border-zinc-800/80 rounded-xl">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
            <DollarSign size={12} className="text-cyan-400" /> Total Paid Out
          </div>
          <div className="text-xl font-bold font-mono text-cyan-400">MVR {Number(metrics.total_commissions_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveSubTab('config')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSubTab === 'config'
              ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          <Sliders size={13} /> Rules & Package Config
        </button>
        <button
          onClick={() => setActiveSubTab('tiers')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSubTab === 'tiers'
              ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          <Award size={13} /> Performance Tiers ({tiers.length})
        </button>
        <button
          onClick={() => setActiveSubTab('affiliates')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeSubTab === 'affiliates'
              ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          <Users size={13} /> Affiliates ({affiliates.length})
        </button>
        <button
          onClick={() => setActiveSubTab('payouts')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 relative ${
            activeSubTab === 'payouts'
              ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          <CreditCard size={13} /> Payout Ledger ({payouts.length})
          {metrics.pending_payout_requests > 0 && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-600 text-white rounded-full leading-none animate-pulse">
              {metrics.pending_payout_requests}
            </span>
          )}
        </button>
      </div>

      {/* SUB-TAB 1: RULES & CONFIG */}
      {activeSubTab === 'config' && (
        <form onSubmit={handleSaveConfig} className="flex flex-col gap-6">
          
          {/* Payout Mode Toggle */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-black/30 flex flex-col gap-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <CreditCard size={16} className="text-yellow-500" /> Payout Disbursement Mode
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label 
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-1 ${
                  payoutMode === 'manual_request' 
                    ? 'border-yellow-500 bg-yellow-500/10 text-white' 
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Manual Withdrawal Request</span>
                  <input
                    type="radio"
                    name="payout_mode"
                    value="manual_request"
                    checked={payoutMode === 'manual_request'}
                    onChange={() => setPayoutMode('manual_request')}
                    className="accent-yellow-500"
                  />
                </div>
                <span className="text-[11px] text-zinc-400">
                  Affiliates request withdrawal when balance $\ge$ threshold. Superadmin approves and enters bank receipt.
                </span>
              </label>

              <label 
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-1 ${
                  payoutMode === 'automated_batch' 
                    ? 'border-yellow-500 bg-yellow-500/10 text-white' 
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Automated Scheduled Monthly Batch</span>
                  <input
                    type="radio"
                    name="payout_mode"
                    value="automated_batch"
                    checked={payoutMode === 'automated_batch'}
                    onChange={() => setPayoutMode('automated_batch')}
                    className="accent-yellow-500"
                  />
                </div>
                <span className="text-[11px] text-zinc-400">
                  System automatically queues payout batches on a configured day of the month for all eligible affiliates.
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="text-xs font-bold text-zinc-300">Min Withdrawal Threshold (MVR)</label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={minThreshold}
                  onChange={(e) => setMinThreshold(Number(e.target.value))}
                  className="w-full mt-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:border-yellow-500"
                />
                <span className="text-[10px] text-zinc-500">Default: MVR 500.00</span>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300">Auto-Payout Day of Month</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={autoPayoutDay}
                  onChange={(e) => setAutoPayoutDay(Number(e.target.value))}
                  disabled={payoutMode !== 'automated_batch'}
                  className="w-full mt-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-white disabled:opacity-40 focus:border-yellow-500"
                />
                <span className="text-[10px] text-zinc-500">Day 1 to 31 (e.g. 1st of every month)</span>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300">Commission Grace Window (Days)</label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                  className="w-full mt-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:border-yellow-500"
                />
                <span className="text-[10px] text-zinc-500">Duration in PENDING status before maturing</span>
              </div>
            </div>
          </div>

          {/* Dual-Sided Incentive Config */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-black/30 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Gift size={16} className="text-emerald-400" /> Dual-Sided Incentive (New Customer 1st Invoice Discount)
              </h4>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={discountEnabled}
                  onChange={(e) => setDiscountEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-zinc-300">Discount Calculation Type</label>
                <select
                  value={discountType}
                  onChange={(e: any) => setDiscountType(e.target.value)}
                  disabled={!discountEnabled}
                  className="w-full mt-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white disabled:opacity-40 focus:border-emerald-500"
                >
                  <option value="percentage">Percentage (%) Discount on 1st Invoice</option>
                  <option value="fixed_amount">Fixed Amount (MVR) Discount on 1st Invoice</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300">Discount Value</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  disabled={!discountEnabled}
                  className="w-full mt-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-white disabled:opacity-40 focus:border-emerald-500"
                />
                <span className="text-[10px] text-zinc-500">
                  {discountType === 'percentage' ? 'e.g. 10 = 10% OFF 1st invoice' : 'e.g. 100 = MVR 100 OFF 1st invoice'}
                </span>
              </div>
            </div>
          </div>

          {/* Package Rules */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-black/30 flex flex-col gap-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Building size={16} className="text-cyan-400" /> Package Commission Rules & Payout Duration
            </h4>
            <p className="text-xs text-zinc-400">
              Set base commission % and maximum payout duration (in months) per Viri package tier.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase text-[10px] font-bold">
                    <th className="pb-2.5">Package Key</th>
                    <th className="pb-2.5">Base Commission (%)</th>
                    <th className="pb-2.5">Payout Duration Limit (Months)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {['starter', 'business', 'enterprise'].map((pkg) => (
                    <tr key={pkg}>
                      <td className="py-2.5 font-bold font-sans text-white uppercase">{pkg}</td>
                      <td className="py-2.5">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={packageRules[pkg]?.commission_pct || 15}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setPackageRules(prev => ({
                              ...prev,
                              [pkg]: { ...prev[pkg], commission_pct: val }
                            }));
                          }}
                          className="w-24 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono text-emerald-400 font-bold focus:border-yellow-500"
                        /> %
                      </td>
                      <td className="py-2.5">
                        <input
                          type="number"
                          min="0"
                          max="120"
                          value={packageRules[pkg]?.duration_months || 12}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setPackageRules(prev => ({
                              ...prev,
                              [pkg]: { ...prev[pkg], duration_months: val }
                            }));
                          }}
                          className="w-24 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono text-white focus:border-yellow-500"
                        /> months (0 = Lifetime)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingConfig}
            className="py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs transition-all shadow-lg shadow-yellow-500/20 disabled:opacity-50"
          >
            {savingConfig ? 'Saving Configuration...' : 'Save Referral Configuration'}
          </button>
        </form>
      )}

      {/* SUB-TAB 2: PERFORMANCE TIERS */}
      {activeSubTab === 'tiers' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400">
              Define volume-based performance tiers. Partners automatically level up based on their 30-day conversion volume.
            </p>
            <button
              onClick={() => {
                setEditingTier(null);
                setTierForm({
                  name: '',
                  min_monthly_sales: 0,
                  bonus_commission_pct: 0,
                  badge_color: '#10B981',
                  description: '',
                  sort_order: tiers.length + 1,
                });
                setIsTierModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-yellow-500 text-black font-bold text-xs flex items-center gap-1.5 hover:bg-yellow-400"
            >
              <Plus size={14} /> Add New Tier
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60">
                <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px] font-bold">
                  <th className="py-3 px-4">Tier Name</th>
                  <th className="py-3 px-4">Min Monthly Sales</th>
                  <th className="py-3 px-4">Bonus Commission %</th>
                  <th className="py-3 px-4">Badge Color</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {tiers.map((tier) => (
                  <tr key={tier.id} className="hover:bg-zinc-900/30 font-mono">
                    <td className="py-3 px-4 font-sans font-bold text-white flex items-center gap-2">
                      <span 
                        className="w-2.5 h-2.5 rounded-full" 
                        style={{ backgroundColor: tier.badge_color }}
                      />
                      {tier.name}
                    </td>
                    <td className="py-3 px-4 text-white font-bold">{tier.min_monthly_sales}+ conversions/mo</td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">+{tier.bonus_commission_pct}%</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: `${tier.badge_color}20`, color: tier.badge_color }}>
                        {tier.badge_color}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans text-zinc-400 text-xs">{tier.description || '—'}</td>
                    <td className="py-3 px-4 text-right font-sans">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingTier(tier);
                            setTierForm({
                              name: tier.name,
                              min_monthly_sales: tier.min_monthly_sales,
                              bonus_commission_pct: tier.bonus_commission_pct,
                              badge_color: tier.badge_color,
                              description: tier.description || '',
                              sort_order: tier.sort_order || 1,
                            });
                            setIsTierModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteTier(tier.id)}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: AFFILIATES LIST */}
      {activeSubTab === 'affiliates' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              placeholder="Search by affiliate name, email, or code..."
              value={affiliateSearch}
              onChange={(e) => setAffiliateSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchAffiliates()}
              className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder:text-zinc-600 focus:border-yellow-500 w-72"
            />
            <button
              onClick={fetchAffiliates}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white"
            >
              Search
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60">
                <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px] font-bold">
                  <th className="py-3 px-4">Affiliate</th>
                  <th className="py-3 px-4">Referral Code</th>
                  <th className="py-3 px-4">Current Tier</th>
                  <th className="py-3 px-4">Clients</th>
                  <th className="py-3 px-4">Lifetime Earned</th>
                  <th className="py-3 px-4">Pending</th>
                  <th className="py-3 px-4">Available</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {affiliates.map((aff) => (
                  <tr key={aff.id} className="hover:bg-zinc-900/30 font-mono">
                    <td className="py-3 px-4 font-sans">
                      <div className="font-bold text-white">{aff.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{aff.email}</div>
                    </td>
                    <td className="py-3 px-4 text-cyan-300 font-bold">{aff.referral_code}</td>
                    <td className="py-3 px-4">
                      <span 
                        className="px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{ backgroundColor: `${aff.current_tier?.badge_color || '#10B981'}20`, color: aff.current_tier?.badge_color || '#10B981' }}
                      >
                        {aff.current_tier?.name || 'Base Partner'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans text-white">{aff.attributions_count || 0}</td>
                    <td className="py-3 px-4 text-emerald-400 font-bold">MVR {Number(aff.lifetime_earned).toFixed(2)}</td>
                    <td className="py-3 px-4 text-amber-400">MVR {Number(aff.pending_balance).toFixed(2)}</td>
                    <td className="py-3 px-4 text-cyan-400 font-bold">MVR {Number(aff.available_balance).toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {aff.status?.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: PAYOUT LEDGER */}
      {activeSubTab === 'payouts' && (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60">
                <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px] font-bold">
                  <th className="py-3 px-4">Batch Ref</th>
                  <th className="py-3 px-4">Affiliate</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Target Bank Details</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {payouts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500 text-xs italic">
                      No payout requests or automated batches found.
                    </td>
                  </tr>
                ) : (
                  payouts.map((payout) => (
                    <tr key={payout.id} className="hover:bg-zinc-900/30 font-mono">
                      <td className="py-3 px-4 font-bold text-yellow-500">{payout.batch_reference}</td>
                      <td className="py-3 px-4 font-sans font-medium text-white">{payout.affiliate?.name || 'Affiliate'}</td>
                      <td className="py-3 px-4 text-emerald-400 font-bold text-sm">MVR {Number(payout.amount).toFixed(2)}</td>
                      <td className="py-3 px-4 font-sans text-zinc-300">
                        <div><strong>{payout.bank_name}</strong> — {payout.account_number}</div>
                        <div className="text-[10px] text-zinc-500">{payout.account_name}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                          payout.status === 'PAID'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : payout.status === 'REJECTED'
                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                        }`}>
                          {payout.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-500 text-[10px]">
                        {new Date(payout.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        {payout.status === 'REQUESTED' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedPayout(payout);
                                setReceiptRef('');
                                setAdminNotes('');
                                setIsApproveModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setSelectedPayout(payout);
                                setRejectReason('');
                                setIsRejectModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-bold text-xs"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {payout.status === 'PAID' && payout.transaction_receipt_ref && (
                          <span className="text-[10px] text-zinc-400 font-mono">Ref: {payout.transaction_receipt_ref}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tier Create/Edit Modal */}
      {isTierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Award className="text-yellow-500" size={18} />
                {editingTier ? 'Edit Performance Tier' : 'Create New Performance Tier'}
              </h3>
              <button onClick={() => setIsTierModalOpen(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveTier} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-300">Tier Name</label>
                <input
                  type="text"
                  placeholder="e.g. Gold Partner"
                  value={tierForm.name}
                  onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
                  required
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-300">Min Monthly Sales</label>
                  <input
                    type="number"
                    min="0"
                    value={tierForm.min_monthly_sales}
                    onChange={(e) => setTierForm({ ...tierForm, min_monthly_sales: Number(e.target.value) })}
                    required
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-300">Bonus Commission %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={tierForm.bonus_commission_pct}
                    onChange={(e) => setTierForm({ ...tierForm, bonus_commission_pct: Number(e.target.value) })}
                    required
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-emerald-400 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300">Badge Color</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={tierForm.badge_color}
                    onChange={(e) => setTierForm({ ...tierForm, badge_color: e.target.value })}
                    className="h-8 w-12 rounded bg-zinc-900 border border-zinc-800 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={tierForm.badge_color}
                    onChange={(e) => setTierForm({ ...tierForm, badge_color: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300">Description</label>
                <textarea
                  placeholder="e.g. 25+ monthly sales unlocks +10% bonus commission"
                  value={tierForm.description}
                  onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white"
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsTierModalOpen(false)}
                  className="flex-1 py-2 rounded-lg bg-zinc-900 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold"
                >
                  {editingTier ? 'Update Tier' : 'Create Tier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payout Approve Modal */}
      {isApproveModalOpen && selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl flex flex-col gap-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="text-emerald-400" size={18} />
              Approve & Mark Payout as PAID
            </h3>
            
            <div className="p-3 bg-zinc-900 rounded-xl font-mono text-xs flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span className="text-zinc-400 font-sans">Batch:</span>
                <span className="text-yellow-500 font-bold">{selectedPayout.batch_reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400 font-sans">Amount:</span>
                <span className="text-emerald-400 font-bold text-sm">MVR {Number(selectedPayout.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400 font-sans">Bank:</span>
                <span className="text-white">{selectedPayout.bank_name} — {selectedPayout.account_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400 font-sans">Name:</span>
                <span className="text-white">{selectedPayout.account_name}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300">Bank Transaction Receipt Ref (Optional)</label>
              <input
                type="text"
                placeholder="e.g. TXN-7701111524001-9988"
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300">Admin Notes (Optional)</label>
              <textarea
                placeholder="Disbursed via BML Internet Banking"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={2}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white"
              />
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                className="flex-1 py-2 rounded-lg bg-zinc-900 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApprovePayout}
                className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold"
              >
                Confirm Payout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payout Reject Modal */}
      {isRejectModalOpen && selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl flex flex-col gap-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertCircle className="text-red-400" size={18} />
              Reject Payout Request
            </h3>
            
            <p className="text-xs text-zinc-400">
              Rejecting this request will immediately refund MVR {Number(selectedPayout.amount).toFixed(2)} back to the affiliate's available balance.
            </p>

            <div>
              <label className="text-xs font-bold text-zinc-300">Rejection Reason *</label>
              <textarea
                placeholder="e.g. Bank account number is invalid or name mismatch."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                required
                className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white"
              />
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="flex-1 py-2 rounded-lg bg-zinc-900 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectPayout}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
