import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Users, DollarSign, TrendingUp, Award, Clock, CheckCircle2, 
  Copy, Sliders, CreditCard, 
  ArrowUpRight, Sparkles, BarChart3, Building, 
  AlertCircle, Gift, RefreshCw, Check, ShieldCheck
} from 'lucide-react';

export default function AffiliatePortal() {
  const [overview, setOverview] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'calculator' | 'settings'>('overview');
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCoupon, setCopiedCoupon] = useState(false);

  // Payout Request Modal
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  // Bank Settings
  const [bankName, setBankName] = useState('BML');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [customCoupon, setCustomCoupon] = useState('');
  const [bankSettingsSaved, setBankSettingsSaved] = useState(false);

  // Interactive Calculator State
  const [selectedPackageKey, setSelectedPackageKey] = useState<string>('');
  const [calcNewSales, setCalcNewSales] = useState(10);
  const [calcRetention, setCalcRetention] = useState(100);
  const [calcAvgPrice, setCalcAvgPrice] = useState(349);
  const [projectionData, setProjectionData] = useState<any>(null);

  const [salesSearch, setSalesSearch] = useState('');

  const navigate = useNavigate();
  const token = localStorage.getItem('viri_token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchOverview();
    fetchSales();
  }, [token]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/affiliate/overview', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to load affiliate overview');
      const data = await res.json();
      setOverview(data);
      if (data.affiliate) {
        setBankName(data.affiliate.payout_bank_name || 'BML');
        setAccountNumber(data.affiliate.payout_account_number || '');
        setAccountName(data.affiliate.payout_account_name || data.affiliate.name || '');
        setCustomCoupon(data.affiliate.custom_coupon_code || '');
      }
      if (data.config?.packages && data.config.packages.length > 0 && !selectedPackageKey) {
        const firstPkg = data.config.packages[0];
        setSelectedPackageKey(firstPkg.tier_key);
        setCalcAvgPrice(firstPkg.price);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSales = async () => {
    try {
      const res = await fetch(`/api/affiliate/sales?search=${encodeURIComponent(salesSearch)}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setSales(data.data || []);
      }
    } catch (e) {}
  };

  const fetchProjections = async () => {
    try {
      const params = new URLSearchParams({
        num_clients: String(calcNewSales),
        retention_rate: String(calcRetention / 100),
      });
      if (selectedPackageKey) {
        params.append('package_key', selectedPackageKey);
      } else {
        params.append('avg_package_price', String(calcAvgPrice));
      }

      const res = await fetch(`/api/affiliate/projections?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setProjectionData(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (token) {
      fetchProjections();
    }
  }, [token, calcNewSales, calcRetention, selectedPackageKey, calcAvgPrice]);

  const copyToClipboard = (text: string, type: 'link' | 'coupon') => {
    navigator.clipboard.writeText(text);
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedCoupon(true);
      setTimeout(() => setCopiedCoupon(false), 2000);
    }
  };

  const handleRequestPayout = async () => {
    try {
      setPayoutLoading(true);
      setPayoutError(null);
      setPayoutSuccess(null);
      const res = await fetch('/api/affiliate/payout-request', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Withdrawal request failed');
      setPayoutSuccess(data.message);
      fetchOverview();
      setTimeout(() => {
        setIsPayoutModalOpen(false);
        setPayoutSuccess(null);
      }, 2500);
    } catch (err: any) {
      setPayoutError(err.message);
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleSaveBankSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/affiliate/bank-details', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          payout_bank_name: bankName,
          payout_account_number: accountNumber,
          payout_account_name: accountName,
          custom_coupon_code: customCoupon
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save bank settings');
      setBankSettingsSaved(true);
      fetchOverview();
      setTimeout(() => setBankSettingsSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading && !overview) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm font-medium text-zinc-400 font-mono">Loading Viri Affiliate Portal...</p>
        </div>
      </div>
    );
  }

  const affiliate = overview?.affiliate || {};
  const metrics = overview?.metrics || {};
  const currentTier = affiliate.currentTier || { name: 'Base Partner', bonus_commission_pct: 0, badge_color: '#10B981' };
  const minThreshold = overview?.config?.min_payout_threshold || 500;
  const isEligibleForPayout = (metrics.available_balance || 0) >= minThreshold;

  return (
    <div className="min-h-screen bg-[#090a0f] text-white flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* Top Navbar */}
      <nav className="h-16 border-b border-white/10 bg-black/40 backdrop-blur-xl sticky top-0 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/img/logo_en.png" alt="Viri" className="h-7 w-auto object-contain" />
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <Sparkles size={12} /> Partner & Affiliate Portal
            </span>
            <span 
              className="text-xs font-bold px-2 py-0.5 rounded-md border"
              style={{ backgroundColor: `${currentTier.badge_color}15`, borderColor: `${currentTier.badge_color}40`, color: currentTier.badge_color }}
            >
              {currentTier.name} (+{currentTier.bonus_commission_pct}% Bonus)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setActiveTab('calculator')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${activeTab === 'calculator' ? 'bg-emerald-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
          >
            <TrendingUp size={14} /> Income Calculator
          </button>
          <button 
            onClick={() => setActiveTab('sales')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${activeTab === 'sales' ? 'bg-emerald-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
          >
            <Users size={14} /> Client Sales ({metrics.total_conversions || 0})
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${activeTab === 'settings' ? 'bg-emerald-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
          >
            <CreditCard size={14} /> Payout Details
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <div className="w-7 h-7 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center font-bold text-emerald-400">
              {affiliate.name ? affiliate.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <span className="font-medium hidden md:inline">{affiliate.name}</span>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full px-6 py-8 flex-1 flex flex-col gap-8">

        {/* Unique Referral Identity Hero Card */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-zinc-950/80 to-black p-8 shadow-2xl backdrop-blur-xl">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
            <div className="flex flex-col gap-2 max-w-2xl">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <Gift size={14} /> Dual-Sided Partner Advantage Active
              </div>
              <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                {overview?.config?.program_headline || 'Earn 15% to 25% recurring monthly commissions.'}
              </h1>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Share your unique Viri referral link or coupon. {overview?.config?.customer_discount_enabled !== false ? (
                  <>New businesses receive <strong className="text-emerald-300">{overview?.config?.customer_discount_type === 'percentage' ? `${overview?.config?.customer_discount_value}% OFF` : `MVR ${overview?.config?.customer_discount_value} OFF`} their 1st invoice</strong>, and you earn</>
                ) : (
                  <>You earn</>
                )} recurring monthly commissions on every client renewal.
              </p>
            </div>

            {/* Link & Coupon Box */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <div className="bg-black/60 border border-white/15 rounded-2xl p-2.5 flex items-center justify-between gap-3 shadow-inner">
                <div className="flex flex-col px-2">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Your Referral Link</span>
                  <span className="text-xs font-mono text-emerald-300 font-semibold truncate max-w-[200px] sm:max-w-[260px]">
                    {overview?.referral_link || 'https://viri.thinksafe.mv/register?ref=' + affiliate.referral_code}
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(overview?.referral_link || 'https://viri.thinksafe.mv/register?ref=' + affiliate.referral_code, 'link')}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 shrink-0"
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>

              {affiliate.custom_coupon_code && (
                <div className="bg-black/60 border border-white/15 rounded-2xl p-2.5 flex items-center justify-between gap-3 shadow-inner">
                  <div className="flex flex-col px-2">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Coupon Code</span>
                    <span className="text-xs font-mono text-cyan-300 font-bold tracking-wider">
                      {affiliate.custom_coupon_code}
                    </span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(affiliate.custom_coupon_code, 'coupon')}
                    className="px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 font-bold text-xs transition-all flex items-center gap-1.5 shrink-0"
                  >
                    {copiedCoupon ? <Check size={14} /> : <Copy size={14} />}
                    {copiedCoupon ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Missing Bank Details Callout */}
        {!affiliate.payout_account_number && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <CreditCard size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Payout Bank Account Not Set</p>
                <p className="text-[11px] text-zinc-400">Configure your BML or MIB account in Payout Settings whenever you're ready to receive payouts.</p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shrink-0"
            >
              Add Bank Account &rarr;
            </button>
          </div>
        )}

        {/* 4 Financial Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Lifetime Earned */}
          <div className="p-5 rounded-2xl bg-zinc-950/60 border border-white/10 backdrop-blur-xl flex flex-col justify-between relative overflow-hidden shadow-xl group hover:border-white/20 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Lifetime Earned</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <DollarSign size={16} />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold text-white font-mono tracking-tight">
                MVR {Number(metrics.lifetime_earned || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                <Sparkles size={11} className="text-emerald-400" /> All-time accumulated commissions
              </p>
            </div>
          </div>

          {/* Pending Balance */}
          <div className="p-5 rounded-2xl bg-zinc-950/60 border border-white/10 backdrop-blur-xl flex flex-col justify-between relative overflow-hidden shadow-xl group hover:border-white/20 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Pending Balance</span>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Clock size={16} />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold text-amber-300 font-mono tracking-tight">
                MVR {Number(metrics.pending_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                In 14-day security grace period
              </p>
            </div>
          </div>

          {/* Available for Withdrawal */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 to-zinc-950 border border-emerald-500/30 backdrop-blur-xl flex flex-col justify-between relative overflow-hidden shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Available Balance</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-extrabold text-emerald-300 font-mono tracking-tight">
                MVR {Number(metrics.available_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[10px] text-zinc-400">Min: MVR {minThreshold}</span>
                <button
                  onClick={() => setIsPayoutModalOpen(true)}
                  disabled={!isEligibleForPayout}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                    isEligibleForPayout
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  <ArrowUpRight size={13} /> Request Payout
                </button>
              </div>
            </div>
          </div>

          {/* Paid Out */}
          <div className="p-5 rounded-2xl bg-zinc-950/60 border border-white/10 backdrop-blur-xl flex flex-col justify-between relative overflow-hidden shadow-xl group hover:border-white/20 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Total Paid Out</span>
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <CreditCard size={16} />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold text-cyan-300 font-mono tracking-tight">
                MVR {Number(metrics.paid_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Disbursed to your bank account
              </p>
            </div>
          </div>

        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BarChart3 size={14} /> Performance Overview
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'sales'
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users size={14} /> Who You Sold To ({sales.length})
          </button>
          <button
            onClick={() => setActiveTab('calculator')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'calculator'
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <TrendingUp size={14} /> 3-Year Income Forecast
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <CreditCard size={14} /> Payout Bank Settings
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Recent Commission Stream */}
            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock size={16} className="text-emerald-400" /> Recent Commission Stream
                </h3>
                <button onClick={() => setActiveTab('sales')} className="text-xs text-emerald-400 hover:underline">
                  View All Sales &rarr;
                </button>
              </div>

              {overview?.recent_commissions?.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs italic">
                  No commissions yet. Share your referral link to earn your first payout!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-500 uppercase text-[10px] font-bold">
                        <th className="pb-2.5">Company</th>
                        <th className="pb-2.5">Package</th>
                        <th className="pb-2.5">Invoice Amount</th>
                        <th className="pb-2.5">Rate</th>
                        <th className="pb-2.5">Your Commission</th>
                        <th className="pb-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {overview?.recent_commissions?.map((comm: any) => (
                        <tr key={comm.id} className="hover:bg-white/[0.02]">
                          <td className="py-3 font-sans font-medium text-white">{comm.tenant?.name || 'Company'}</td>
                          <td className="py-3 text-zinc-400">{comm.plan_key?.toUpperCase()}</td>
                          <td className="py-3 text-zinc-300">MVR {comm.invoice_amount}</td>
                          <td className="py-3 text-emerald-400 font-bold">{comm.effective_commission_pct}%</td>
                          <td className="py-3 text-emerald-300 font-bold">+MVR {comm.commission_amount}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                              comm.status === 'AVAILABLE' 
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : comm.status === 'PAID'
                                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            }`}>
                              {comm.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Performance Tier Progression Card */}
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Award size={16} className="text-yellow-400" /> Tier Status
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    Rolling 30 Days
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-white/10 bg-black/40 mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white">{currentTier.name}</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">+{currentTier.bonus_commission_pct}% Bonus</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">{currentTier.description}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Monthly Sales Volume:</span>
                    <span className="font-bold text-white font-mono">{metrics.monthly_conversions || 0} conversions</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ((metrics.monthly_conversions || 0) / 25) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500">Reach 25 monthly conversions for Gold Partner (+10% bonus)</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-[11px] text-zinc-400">
                <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
                Tiers recalculate automatically at month-end.
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: WHO THEY SOLD TO (CLIENT SALES TABLE) */}
        {activeTab === 'sales' && (
          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-xl flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="text-emerald-400" size={20} />
                  Client Sales Ledger ("Who You Sold To")
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Track every referred business, package upgrades, duration countdowns, and commissions generated.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search by company name..."
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchSales()}
                  className="px-3.5 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-500 w-full sm:w-64"
                />
                <button
                  onClick={fetchSales}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white"
                >
                  Search
                </button>
              </div>
            </div>

            {sales.length === 0 ? (
              <div className="py-16 text-center text-zinc-500 text-xs italic border border-dashed border-white/10 rounded-xl">
                No clients found. Share your referral link to start building your client ledger!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-500 uppercase text-[10px] font-bold">
                      <th className="pb-3">Client / Company</th>
                      <th className="pb-3">Current Plan</th>
                      <th className="pb-3">Conversion Date</th>
                      <th className="pb-3">Payout Window Countdown</th>
                      <th className="pb-3">Effective Rate</th>
                      <th className="pb-3">Total Earned to Date</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sales.map((sale: any) => (
                      <tr key={sale.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 font-semibold text-white flex items-center gap-2">
                          <Building size={14} className="text-zinc-400" />
                          {sale.client_name}
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-zinc-200">{sale.current_plan}</span>
                            {sale.is_upgraded && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                Upgraded
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 font-mono text-zinc-400">{sale.conversion_date}</td>
                        <td className="py-3.5">
                          <div className="flex flex-col gap-1 w-36">
                            <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                              <span>{sale.payout_countdown.label}</span>
                              <span>{sale.payout_countdown.progress_pct}%</span>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-emerald-400 h-full rounded-full"
                                style={{ width: `${sale.payout_countdown.progress_pct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 font-mono font-bold text-emerald-400">{sale.effective_rate_pct}%</td>
                        <td className="py-3.5 font-mono font-bold text-white">MVR {Number(sale.total_earned).toFixed(2)}</td>
                        <td className="py-3.5">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                            sale.status === 'active' 
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                          }`}>
                            {sale.status?.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PROJECTED INCOME CALCULATOR */}
        {activeTab === 'calculator' && (() => {
          const packages: any[] = overview?.config?.packages || [];
          const activePkg = packages.find((p: any) => p.tier_key === selectedPackageKey) || packages[0] || null;
          const pkgPrice = activePkg ? Number(activePkg.price) : calcAvgPrice;
          const initPct = activePkg ? Number(activePkg.initial_commission_pct) : 50;
          const initMos = activePkg ? Number(activePkg.initial_duration_months) : 6;
          const recurPct = activePkg ? Number(activePkg.recurring_commission_pct) : 10;
          const recurMos = activePkg ? Number(activePkg.recurring_duration_months) : 24;
          const totalMos = activePkg ? Number(activePkg.total_duration_months) : (initMos + recurMos);
          const tierBonus = Number(currentTier.bonus_commission_pct || 0);

          const initPerClient = (pkgPrice * ((initPct + tierBonus) / 100));
          const recurPerClient = (pkgPrice * ((recurPct + tierBonus) / 100));
          const totalPerClient = (initPerClient * initMos) + (recurPerClient * recurMos);

          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Interactive Sliders & Package Selector */}
              <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-xl flex flex-col gap-5">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sliders size={18} className="text-emerald-400" />
                    Growth Parameters
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Select a commission package and adjust metrics to forecast recurring revenue.
                  </p>
                </div>

                {/* Package Tier Selector */}
                {packages.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-zinc-300">Target Subscription Package</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {packages.map((pkg: any) => {
                        const isSelected = (selectedPackageKey || packages[0]?.tier_key) === pkg.tier_key;
                        return (
                          <button
                            key={pkg.tier_key}
                            type="button"
                            onClick={() => {
                              setSelectedPackageKey(pkg.tier_key);
                              setCalcAvgPrice(pkg.price);
                            }}
                            className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all ${
                              isSelected
                                ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/50'
                                : 'bg-black/40 border-white/10 text-zinc-400 hover:border-zinc-700 hover:text-white'
                            }`}
                          >
                            <span className="text-xs font-bold truncate">{pkg.name}</span>
                            <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                              MVR {Number(pkg.price).toFixed(2)}/mo
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Multi-Stage Commission Breakdown Card */}
                {activePkg && (
                  <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-zinc-400">Commission Structure</span>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">{totalMos} Mo Lifecycle</span>
                    </div>

                    <div className="flex flex-col gap-1.5 text-xs font-mono">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                        <span className="text-zinc-300">Phase 1 (Initial {initMos} mos):</span>
                        <span className="text-emerald-400 font-bold">
                          {initPct}% {tierBonus > 0 ? `(+${tierBonus}% bonus)` : ''} &rarr; MVR {initPerClient.toFixed(2)}/mo
                        </span>
                      </div>

                      {recurMos > 0 && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                          <span className="text-zinc-300">Phase 2 (Next {recurMos} mos):</span>
                          <span className="text-cyan-400 font-bold">
                            {recurPct}% {tierBonus > 0 ? `(+${tierBonus}% bonus)` : ''} &rarr; MVR {recurPerClient.toFixed(2)}/mo
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Yield per Client:</span>
                      <span className="font-mono font-bold text-yellow-400">MVR {totalPerClient.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Slider 1: Total Referred Clients */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-zinc-300">Total Referred Clients</span>
                    <span className="text-emerald-400 font-mono font-bold text-sm">{calcNewSales} clients</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={calcNewSales}
                    onChange={(e) => setCalcNewSales(Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                  <span className="text-[10px] text-zinc-500">
                    Number of clients you refer to this package ({activePkg ? activePkg.name : '349 Plan'})
                  </span>
                </div>

                {/* Slider 2: Retention Rate */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-zinc-300">Client Retention Rate</span>
                    <span className="text-cyan-400 font-mono font-bold">{calcRetention}%</span>
                  </div>
                  <input
                    type="range"
                    min="70"
                    max="100"
                    value={calcRetention}
                    onChange={(e) => setCalcRetention(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <span className="text-[10px] text-zinc-500">100% = full 30 months completed</span>
                </div>
              </div>

              {/* Forecast Projection Display */}
              <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-xl flex flex-col justify-between gap-6">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <TrendingUp size={18} className="text-cyan-400" />
                      Forecasted Earnings Timeline
                    </h3>
                    <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      MVR {totalPerClient.toFixed(2)} / client
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Total commissions earned over <strong>{projectionData?.total_lifecycle_years || 2.5} years ({projectionData?.total_lifecycle_months || 30} months)</strong> for referring <strong>{calcNewSales} clients</strong> to <strong>{activePkg ? activePkg.name : '349 Plan'}</strong> (MVR {pkgPrice.toFixed(2)}/mo) with your active <strong>{currentTier.name}</strong> {tierBonus > 0 ? `(+${tierBonus}% tier bonus)` : ''}.
                  </p>
                </div>

                {/* 3 Large Forecast Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-black/50 border border-white/10 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400">Month 1 Earnings</span>
                      <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
                        MVR {Number(projectionData?.next_month || (calcNewSales * initPerClient)).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 mt-2">
                      {calcNewSales} clients &times; MVR {initPerClient.toFixed(2)} ({initPct}% initial)
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-black/50 border border-cyan-500/30 ring-1 ring-cyan-500/20 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-cyan-400">Year 1 Total (12 Mos)</span>
                        <span className="text-[9px] font-mono text-zinc-500 font-bold">M1 &rarr; M12</span>
                      </div>
                      <div className="text-xl font-extrabold text-cyan-300 font-mono mt-1">
                        MVR {Number(projectionData?.one_year_total || (calcNewSales * (initPerClient * 6 + recurPerClient * 6))).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-400 mt-2">
                      {calcNewSales} clients &times; 6 mos Phase 1 + 6 mos Phase 2
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/60 to-black border border-emerald-500/30 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-300">
                        2.5-Year Total (30 Mos)
                      </span>
                      <div className="text-xl font-extrabold text-emerald-300 font-mono mt-1">
                        MVR {Number(projectionData?.two_and_half_years_total || (calcNewSales * totalPerClient)).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-500/80 mt-2">
                      {calcNewSales} clients &times; MVR {totalPerClient.toFixed(2)} total yield
                    </span>
                  </div>
                </div>

                {/* Calculation Breakdown & Step-by-Step Logic Box */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex flex-col gap-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-zinc-200">
                      <Sparkles size={14} className="text-yellow-400" />
                      <span>Transparent Calculation Breakdown:</span>
                    </div>
                    <span className="font-mono text-emerald-400 font-bold text-[11px]">
                      {calcNewSales} Clients &times; MVR {totalPerClient.toFixed(2)} = MVR {Number(projectionData?.two_and_half_years_total || (calcNewSales * totalPerClient)).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-zinc-300 leading-relaxed font-sans">
                    <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex flex-col gap-1">
                      <span className="font-bold text-emerald-400 text-[11px]">Phase 1 (First 6 Months @ {initPct}%):</span>
                      <p className="text-[11px] text-zinc-400">
                        {calcNewSales} clients &times; MVR {initPerClient.toFixed(2)}/mo &times; 6 mos = <strong className="text-white font-mono font-bold">MVR {(calcNewSales * initPerClient * 6).toFixed(2)}</strong>
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex flex-col gap-1">
                      <span className="font-bold text-cyan-400 text-[11px]">Phase 2 (Next 24 Months @ {recurPct}%):</span>
                      <p className="text-[11px] text-zinc-400">
                        {calcNewSales} clients &times; MVR {recurPerClient.toFixed(2)}/mo &times; 24 mos = <strong className="text-white font-mono font-bold">MVR {(calcNewSales * recurPerClient * 24).toFixed(2)}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950/90 border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-mono text-zinc-400">
                    <span>
                      Total 30-Month Commission = MVR {(calcNewSales * initPerClient * 6).toFixed(2)} + MVR {(calcNewSales * recurPerClient * 24).toFixed(2)}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      = MVR {Number(projectionData?.two_and_half_years_total || (calcNewSales * totalPerClient)).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>

                {/* Projections Visual Curve Bar Preview */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex flex-col gap-2">
                  <span className="text-xs font-bold text-zinc-300">
                    {projectionData?.total_lifecycle_months || 30}-Month Progression
                  </span>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 items-end h-24 pt-4">
                    {projectionData?.timeline?.filter((_: any, idx: number) => idx % 3 === 0).map((m: any, i: number) => (
                      <div key={i} className="flex flex-col items-center gap-1 h-full justify-end">
                        <div 
                          className="w-full bg-emerald-500/40 hover:bg-emerald-400 rounded-t transition-all"
                          style={{ height: `${Math.min(100, Math.max(15, (m.monthly_commission / ((calcNewSales * initPerClient) || 1)) * 100))}%` }}
                          title={`Month ${m.month_number}: MVR ${m.monthly_commission}/mo`}
                        />
                        <span className="text-[8px] font-mono text-zinc-500">M{m.month_number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          );
        })()}

        {/* TAB 4: PAYOUT SETTINGS */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto w-full rounded-2xl border border-white/10 bg-zinc-950/60 p-8 backdrop-blur-xl">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
              <CreditCard size={20} className="text-emerald-400" />
              Payout Bank Account Configuration
            </h2>
            <p className="text-xs text-zinc-400 mb-6">
              Specify the Maldivian bank account (BML or MIB) where your monthly affiliate earnings will be deposited.
            </p>

            <form onSubmit={handleSaveBankSettings} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-300">Bank Name</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:border-emerald-500"
                >
                  <option value="BML">Bank of Maldives (BML)</option>
                  <option value="MIB">Maldives Islamic Bank (MIB)</option>
                  <option value="Other">Other Bank</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-300">Bank Account Number</label>
                <input
                  type="text"
                  placeholder="e.g. 7701111524001 or 90101480038561000"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  required
                  className="px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white font-mono focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-300">Account Holder Name</label>
                <input
                  type="text"
                  placeholder="Exact name registered with bank"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  required
                  className="px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-300">Custom Coupon Code (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. VIRI-SAVE10"
                  value={customCoupon}
                  onChange={(e) => setCustomCoupon(e.target.value.toUpperCase())}
                  className="px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white font-mono uppercase focus:border-emerald-500"
                />
                <span className="text-[10px] text-zinc-500">Clients can type this coupon code during checkout to apply discount.</span>
              </div>

              {bankSettingsSaved && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} /> Payout details updated successfully!
                </div>
              )}

              <button
                type="submit"
                className="mt-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20"
              >
                Save Payout Details
              </button>
            </form>
          </div>
        )}

      </div>

      {/* Payout Request Modal */}
      {isPayoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowUpRight className="text-emerald-400" size={18} />
                Request Commission Withdrawal
              </h3>
              <button onClick={() => setIsPayoutModalOpen(false)} className="text-zinc-500 hover:text-white text-xs font-bold">
                ✕
              </button>
            </div>

            <div className="p-4 rounded-xl bg-black/50 border border-white/10 flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400 font-sans">Available Balance:</span>
                <span className="font-bold text-emerald-400">MVR {Number(metrics.available_balance || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400 font-sans">Target Bank:</span>
                <span className="text-white">{affiliate.payout_bank_name || 'BML'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400 font-sans">Account Number:</span>
                <span className="text-white">{affiliate.payout_account_number || 'Not Set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400 font-sans">Account Name:</span>
                <span className="text-white">{affiliate.payout_account_name || affiliate.name}</span>
              </div>
            </div>

            {payoutError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={14} /> {payoutError}
              </div>
            )}

            {payoutSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 size={14} /> {payoutSuccess}
              </div>
            )}

            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => setIsPayoutModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 bg-zinc-900 text-zinc-300 text-xs font-semibold hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequestPayout}
                disabled={payoutLoading}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {payoutLoading ? 'Submitting...' : 'Confirm Withdrawal'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
