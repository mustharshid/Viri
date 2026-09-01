import React, { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, 
  Search, 
  Check, 
  UserPlus, 
  Building2, 
  Banknote, 
  ArrowRight, 
  AlertTriangle, 
  Shield, 
  RefreshCw, 
  Printer, 
  History, 
  X, 
  Loader2, 
  CheckCircle2,
  Lock
} from 'lucide-react';

interface BankAccount {
  id: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  currency?: string;
}

interface LedgerTx {
  date: string;
  details: string;
  amount: string;
  runningBalance?: string;
  hash?: string;
  reference?: string;
  narrative3?: string;
  sender?: string;
}

interface LedgerCache {
  [accountId: string]: {
    balance: string;
    transactions: LedgerTx[];
  };
}

interface SalesScreenProps {
  backendUrl: string;
  hardwareId: string;
  bankAccounts: BankAccount[];
  ledgerCache: LedgerCache;
  terminalName: string;
  onRefreshLedger?: (accountId: string) => void;
}

export const SalesScreen: React.FC<SalesScreenProps> = ({
  backendUrl,
  hardwareId,
  bankAccounts,
  ledgerCache,
  terminalName,
  onRefreshLedger,
}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('viri_token') || '' : '';
  const bUrl = backendUrl || (typeof window !== 'undefined' ? localStorage.getItem('viri_backend_url') || `${window.location.origin}/api` : '');
  const hId = hardwareId || (typeof window !== 'undefined' ? localStorage.getItem('viri_hardware_id') || '' : '');

  // Currencies state
  const [currencies, setCurrencies] = useState<Array<{ id: number; code: string; name: string; symbol: string; buy_rate: number | null; sell_rate: number | null; is_default: boolean }>>([]);

  // Claimed transactions map to prevent duplicate claims
  const [claimedKeys, setClaimedKeys] = useState<Set<string>>(new Set());

  // Customer state & autocomplete
  const [kycIndex, setKycIndex] = useState<Array<{ id: number; nic_number: string | null; passport_number: string | null; full_name: string; nationality?: string; is_pep?: boolean; is_high_risk_country?: boolean }>>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<typeof kycIndex>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    full_name: '',
    nic_number: '',
    passport_number: '',
    nationality: 'Maldivian',
    address: '',
    contact_number: '',
    is_pep: false,
  });
  const [savingQuickCustomer, setSavingQuickCustomer] = useState(false);

  // Sale form configuration
  const [saleType, setSaleType] = useState<'buy' | 'sell'>('buy'); // BUY = We buy foreign curr from customer; SELL = We sell foreign curr to customer
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>('USD');
  const [baseAmount, setBaseAmount] = useState<string>('100');
  const [exchangeRate, setExchangeRate] = useState<string>('17.50');
  const [notes, setNotes] = useState('');
  const [isSuspicious, setIsSuspicious] = useState(false);
  const [strNotes, setStrNotes] = useState('');

  // Payment Accounts & Transaction Selection
  const [receivedPaymentType, setReceivedPaymentType] = useState<'bank' | 'cash'>('bank');
  const [receivedAccountId, setReceivedAccountId] = useState<string>('');
  const [selectedReceivedTx, setSelectedReceivedTx] = useState<LedgerTx | null>(null);

  const [sentPaymentType, setSentPaymentType] = useState<'cash' | 'bank'>('cash');
  const [sentAccountId, setSentAccountId] = useState<string>('');
  const [selectedSentTx, setSelectedSentTx] = useState<LedgerTx | null>(null);

  // Submitting & Receipt State
  const [submitting, setSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [showRecentSalesDrawer, setShowRecentSalesDrawer] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [loadingRecentSales, setLoadingRecentSales] = useState(false);

  // 1. Fetch Tenant Currencies
  const fetchCurrencies = async () => {
    try {
      const res = await fetch(`${bUrl}/terminal/currencies?hardware_id=${hId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCurrencies(data);
        const foreign = data.find((c: any) => c.code !== 'MVR') || data[0];
        if (foreign) {
          setSelectedCurrencyCode(foreign.code);
          setExchangeRate(saleType === 'buy' ? (foreign.buy_rate ? String(foreign.buy_rate) : '15.42') : (foreign.sell_rate ? String(foreign.sell_rate) : '17.50'));
        }
      }
    } catch (e) {
      console.error('Error loading currencies:', e);
    }
  };

  // 2. Fetch Claimed Transaction Keys for De-Duplication
  const fetchClaimedKeys = async () => {
    try {
      const res = await fetch(`${bUrl}/terminal/exchange-sales/claimed-tx-keys?hardware_id=${hId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClaimedKeys(new Set(data.claimed_keys || []));
      }
    } catch (e) {
      console.error('Error fetching claimed keys:', e);
    }
  };

  // 3. Load KYC Index from sessionStorage or Server
  useEffect(() => {
    const cached = sessionStorage.getItem('kyc_index');
    if (cached) {
      setKycIndex(JSON.parse(cached));
    }
    fetch(`${bUrl}/kyc/customers/index`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        setKycIndex(data);
        sessionStorage.setItem('kyc_index', JSON.stringify(data));
      }
    }).catch(() => {});

    fetchCurrencies();
    fetchClaimedKeys();
  }, [bUrl, hId]);

  // Set default bank accounts
  useEffect(() => {
    if (bankAccounts.length > 0) {
      if (!receivedAccountId) setReceivedAccountId(String(bankAccounts[0].id));
      if (!sentAccountId) setSentAccountId(String(bankAccounts[0].id));
    }
  }, [bankAccounts]);

  // Update exchange rate when Currency or Buy/Sell changes
  useEffect(() => {
    const curr = currencies.find(c => c.code === selectedCurrencyCode);
    if (curr) {
      if (saleType === 'buy') {
        setExchangeRate(curr.buy_rate !== null ? String(curr.buy_rate) : '15.42');
      } else {
        setExchangeRate(curr.sell_rate !== null ? String(curr.sell_rate) : '17.50');
      }
    }
  }, [selectedCurrencyCode, saleType, currencies]);

  // Filter customer suggestions as user types
  useEffect(() => {
    if (!customerSearchQuery.trim()) {
      setCustomerSuggestions([]);
      return;
    }
    const q = customerSearchQuery.toLowerCase();
    setCustomerSuggestions(
      kycIndex.filter(c => 
        c.nic_number?.toLowerCase().startsWith(q) ||
        c.passport_number?.toLowerCase().startsWith(q) ||
        c.full_name?.toLowerCase().includes(q)
      ).slice(0, 6)
    );
  }, [customerSearchQuery, kycIndex]);

  // Calculations
  const baseNum = parseFloat(baseAmount) || 0;
  const rateNum = parseFloat(exchangeRate) || 0;
  const quoteTotal = useMemo(() => {
    return Number((baseNum * rateNum).toFixed(2));
  }, [baseNum, rateNum]);

  // Available Transactions in Received Account (Filtered for credits & not claimed)
  const availableReceivedTransactions = useMemo(() => {
    if (receivedPaymentType !== 'bank' || !receivedAccountId) return [];
    const cache = ledgerCache[receivedAccountId];
    if (!cache || !cache.transactions) return [];

    return cache.transactions.filter(tx => {
      // Inflow must be positive credit
      const isCredit = !tx.amount.startsWith('-');
      if (!isCredit) return false;
      const key1 = tx.hash;
      const key2 = tx.reference;
      if (key1 && claimedKeys.has(key1)) return false;
      if (key2 && claimedKeys.has(key2)) return false;
      return true;
    });
  }, [receivedPaymentType, receivedAccountId, ledgerCache, claimedKeys]);

  // Available Transactions in Sent Account (Filtered for debits & not claimed)
  const availableSentTransactions = useMemo(() => {
    if (sentPaymentType !== 'bank' || !sentAccountId) return [];
    const cache = ledgerCache[sentAccountId];
    if (!cache || !cache.transactions) return [];

    return cache.transactions.filter(tx => {
      // Outflow must be negative debit or transfer
      const isDebit = tx.amount.startsWith('-');
      if (!isDebit) return false;
      const key1 = tx.hash;
      const key2 = tx.reference;
      if (key1 && claimedKeys.has(key1)) return false;
      if (key2 && claimedKeys.has(key2)) return false;
      return true;
    });
  }, [sentPaymentType, sentAccountId, ledgerCache, claimedKeys]);

  // Quick Add Customer Handler
  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddForm.full_name.trim() || (!quickAddForm.nic_number.trim() && !quickAddForm.passport_number.trim())) {
      alert('Please provide full name and either NIC or Passport number.');
      return;
    }
    setSavingQuickCustomer(true);
    try {
      const res = await fetch(`${bUrl}/kyc/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          full_name: quickAddForm.full_name.trim(),
          nic_number: quickAddForm.nic_number.trim() || undefined,
          passport_number: quickAddForm.passport_number.trim() || undefined,
          nationality: quickAddForm.nationality.trim(),
          address: quickAddForm.address.trim() || 'Male, Maldives',
          contact_number: quickAddForm.contact_number.trim() || '7777777',
          is_pep: quickAddForm.is_pep,
        })
      });

      if (res.ok) {
        const newCustomer = await res.json();
        setSelectedCustomer(newCustomer);
        setCustomerSearchQuery(newCustomer.nic_number || newCustomer.passport_number || newCustomer.full_name);
        setCustomerSuggestions([]);
        setIsQuickAddModalOpen(false);
        // Add to local index
        setKycIndex(prev => [newCustomer, ...prev]);
        sessionStorage.removeItem('kyc_index');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save customer');
      }
    } catch (e) {
      alert('Error registering customer');
    } finally {
      setSavingQuickCustomer(false);
    }
  };

  // Submit Sale Handler
  const handleCompleteSale = async () => {
    if (baseNum <= 0 || rateNum <= 0) {
      alert('Please enter valid amount and exchange rate.');
      return;
    }

    if (receivedPaymentType === 'bank' && !selectedReceivedTx) {
      alert('Please select the matching received bank credit transaction.');
      return;
    }

    if (sentPaymentType === 'bank' && !selectedSentTx) {
      alert('Please select the matching sent bank transfer transaction.');
      return;
    }

    setSubmitting(true);
    try {
      // Inflow amounts
      const recvAmt = saleType === 'buy' ? baseNum : quoteTotal;
      const recvCurr = saleType === 'buy' ? selectedCurrencyCode : 'MVR';

      // Outflow amounts
      const sentAmt = saleType === 'buy' ? quoteTotal : baseNum;
      const sentCurr = saleType === 'buy' ? 'MVR' : selectedCurrencyCode;

      const payload = {
        hardware_id: hId,
        sale_type: saleType,
        base_currency: selectedCurrencyCode,
        quote_currency: 'MVR',
        base_amount: baseNum,
        exchange_rate: rateNum,
        quote_amount: quoteTotal,

        received_payment_type: receivedPaymentType,
        received_bank_account_id: receivedPaymentType === 'bank' ? parseInt(receivedAccountId) : null,
        received_transaction_id: selectedReceivedTx?.reference || selectedReceivedTx?.details || null,
        received_transaction_hash: selectedReceivedTx?.hash || null,
        received_amount: recvAmt,
        received_currency: recvCurr,

        sent_payment_type: sentPaymentType,
        sent_bank_account_id: sentPaymentType === 'bank' ? parseInt(sentAccountId) : null,
        sent_transaction_id: selectedSentTx?.reference || selectedSentTx?.details || null,
        sent_transaction_hash: selectedSentTx?.hash || null,
        sent_amount: sentAmt,
        sent_currency: sentCurr,

        kyc_customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer?.full_name || customerSearchQuery || 'Walk-in Customer',
        customer_id_number: selectedCustomer?.nic_number || selectedCustomer?.passport_number || null,
        notes: notes.trim() || undefined,
        is_suspicious: isSuspicious,
        str_notes: isSuspicious ? strNotes : undefined,
      };

      const res = await fetch(`${bUrl}/terminal/exchange-sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setCompletedSale(data.sale);
        // Immediately lock transaction hashes locally
        if (selectedReceivedTx?.hash) {
          setClaimedKeys(prev => new Set(prev).add(selectedReceivedTx.hash!));
        }
        if (selectedSentTx?.hash) {
          setClaimedKeys(prev => new Set(prev).add(selectedSentTx.hash!));
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to complete sale');
      }
    } catch (e) {
      alert('Error submitting exchange sale');
    } finally {
      setSubmitting(false);
    }
  };

  // Reset for next sale
  const handleStartNewSale = () => {
    setCompletedSale(null);
    setSelectedCustomer(null);
    setCustomerSearchQuery('');
    setSelectedReceivedTx(null);
    setSelectedSentTx(null);
    setNotes('');
    setIsSuspicious(false);
    setStrNotes('');
    fetchClaimedKeys();
  };

  // Fetch recent shift sales
  const fetchRecentSales = async () => {
    setLoadingRecentSales(true);
    try {
      const res = await fetch(`${bUrl}/terminal/exchange-sales?hardware_id=${hId}&today_only=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRecentSales(await res.json());
      }
    } catch (e) {
      console.error('Error fetching recent sales:', e);
    } finally {
      setLoadingRecentSales(false);
    }
  };

  // Compliance Risk Flags
  const isHighRisk = selectedCustomer?.is_pep || selectedCustomer?.is_high_risk_country;
  const mvrEquivalent = saleType === 'buy' ? quoteTotal : (baseNum * rateNum);
  const requiresEdd = isHighRisk || mvrEquivalent >= 50000;
  const isCashTrade = receivedPaymentType === 'cash' || sentPaymentType === 'cash';
  const requiresCtr = isCashTrade && mvrEquivalent >= 200000;

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto flex flex-col p-4 md:p-6 space-y-6 animate-fade-in overflow-y-auto">
      
      {/* ── Top Bar: Title, Live Status & Recent Sales ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-card)] border border-[var(--border-color)] p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <DollarSign size={22} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Sales & Currency Exchange
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Counter: <span className="text-white font-medium">{terminalName}</span> · One-click verification, matching & auto-KYC.
            </p>
          </div>
        </div>

        <button
          onClick={() => { setShowRecentSalesDrawer(true); fetchRecentSales(); }}
          className="btn btn-outline border-zinc-700 hover:border-zinc-500 text-xs py-2 px-3.5 rounded-xl flex items-center gap-2 self-start sm:self-auto"
        >
          <History size={15} /> Shift Sales History
        </button>
      </div>

      {/* ── Completed Sale Receipt Modal ── */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[var(--bg-card)] border border-emerald-500/40 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                {completedSale.receipt_number}
              </span>
              <h2 className="text-2xl font-bold text-white mt-2">Sale Completed!</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Transaction recorded and KYC AML log synchronized.</p>
            </div>

            {/* Receipt Summary Details */}
            <div className="glass-panel p-5 rounded-2xl border border-[var(--border-color)] text-left space-y-3 text-xs">
              <div className="flex justify-between border-b border-[var(--border-color)] pb-2">
                <span className="text-[var(--text-secondary)]">Customer</span>
                <span className="font-bold text-white">{completedSale.customer_name || 'Walk-in'} ({completedSale.customer_id_number || 'N/A'})</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border-color)] pb-2">
                <span className="text-[var(--text-secondary)]">Exchange Nature</span>
                <span className="font-bold uppercase text-amber-400">{completedSale.sale_type} {completedSale.base_currency}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border-color)] pb-2">
                <span className="text-[var(--text-secondary)]">Rate</span>
                <span className="font-mono text-white">1 {completedSale.base_currency} = {Number(completedSale.exchange_rate).toFixed(4)} MVR</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border-color)] pb-2">
                <span className="text-[var(--text-secondary)]">Received ({completedSale.received_payment_type})</span>
                <span className="font-bold text-emerald-400 font-mono">{completedSale.received_currency} {Number(completedSale.received_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Sent / Paid Out ({completedSale.sent_payment_type})</span>
                <span className="font-bold text-cyan-400 font-mono">{completedSale.sent_currency} {Number(completedSale.sent_amount).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Printer size={15} /> Print Receipt
              </button>
              <button
                onClick={handleStartNewSale}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                Next Sale <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 1: Customer Search & Selection (KYC Link) ── */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-[var(--border-color)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px]">1</span>
            <span>Customer Identification (NIC / Passport)</span>
          </div>
          {selectedCustomer && (
            <button
              onClick={() => { setSelectedCustomer(null); setCustomerSearchQuery(''); }}
              className="text-[11px] text-zinc-400 hover:text-red-400 transition-colors"
            >
              Clear Customer
            </button>
          )}
        </div>

        {selectedCustomer ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <Check size={20} />
              </div>
              <div>
                <div className="font-bold text-sm text-white flex items-center gap-2">
                  {selectedCustomer.full_name}
                  {selectedCustomer.is_pep && (
                    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30">
                      PEP
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-400 font-mono">
                  ID: {selectedCustomer.nic_number || selectedCustomer.passport_number} · {selectedCustomer.nationality || 'Maldivian'}
                </div>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5">
              <Shield size={13} /> Verified in Database
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Start typing NIC number, passport, or name…"
                  value={customerSearchQuery}
                  onChange={e => setCustomerSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuickAddForm({
                    full_name: '',
                    nic_number: customerSearchQuery.match(/^[A-Z]/i) ? customerSearchQuery : '',
                    passport_number: !customerSearchQuery.match(/^[A-Z]/i) ? customerSearchQuery : '',
                    nationality: 'Maldivian',
                    address: '',
                    contact_number: '',
                    is_pep: false,
                  });
                  setIsQuickAddModalOpen(true);
                }}
                className="btn btn-outline border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs px-4 rounded-xl flex items-center gap-2 shrink-0 font-bold"
              >
                <UserPlus size={15} /> New Customer
              </button>
            </div>

            {/* Suggestions Dropdown */}
            {customerSuggestions.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800 shadow-xl">
                {customerSuggestions.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(c);
                      setCustomerSearchQuery(c.nic_number || c.passport_number || c.full_name);
                      setCustomerSuggestions([]);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs hover:bg-zinc-800/80 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-white">{c.full_name}</span>
                      <span className="text-zinc-500 text-[11px] ml-2">({c.nationality || 'Maldivian'})</span>
                    </div>
                    <span className="font-mono text-amber-400 font-semibold">{c.nic_number || c.passport_number}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── STEP 2: Exchange Nature & Currency ── */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-[var(--border-color)] space-y-5">
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
          <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px]">2</span>
          <span>Currency Exchange Parameters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Buy vs Sell Switcher */}
          <div>
            <label className="input-label">Transaction Type</label>
            <div className="flex rounded-xl bg-zinc-900 p-1 border border-zinc-800">
              <button
                type="button"
                onClick={() => setSaleType('buy')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  saleType === 'buy' ? 'bg-emerald-500 text-black shadow-md' : 'text-zinc-400 hover:text-white'
                }`}
              >
                BUY Currency
              </button>
              <button
                type="button"
                onClick={() => setSaleType('sell')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  saleType === 'sell' ? 'bg-amber-500 text-black shadow-md' : 'text-zinc-400 hover:text-white'
                }`}
              >
                SELL Currency
              </button>
            </div>
          </div>

          {/* Currency Pill Selector */}
          <div>
            <label className="input-label">Select Foreign Currency</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {currencies.filter(c => c.code !== 'MVR').map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCurrencyCode(c.code)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold font-mono transition-all shrink-0 ${
                    selectedCurrencyCode === c.code 
                      ? 'bg-amber-500 text-black shadow-md' 
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white'
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>
          </div>

          {/* Base Amount Input */}
          <div>
            <label className="input-label">Amount ({selectedCurrencyCode}) *</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                value={baseAmount}
                onChange={e => setBaseAmount(e.target.value)}
                placeholder="0.00"
                className="input-field text-sm font-mono font-bold py-2.5"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-mono font-bold">
                {selectedCurrencyCode}
              </span>
            </div>
          </div>

          {/* Exchange Rate Input */}
          <div>
            <label className="input-label">Exchange Rate (MVR) *</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={exchangeRate}
                onChange={e => setExchangeRate(e.target.value)}
                placeholder="0.0000"
                className="input-field text-sm font-mono font-bold py-2.5 text-amber-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-mono font-bold">
                MVR
              </span>
            </div>
          </div>
        </div>

        {/* Live Converted Total Callout */}
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-zinc-400">
            {saleType === 'buy' ? 'Customer provides Foreign Currency ➔ Receives MVR:' : 'Customer provides MVR ➔ Receives Foreign Currency:'}
          </div>
          <div className="text-base sm:text-lg font-black font-mono text-emerald-400">
            {quoteTotal.toLocaleString()} MVR
          </div>
        </div>
      </div>

      {/* ── STEP 3 & 4: Inflow (Received) & Outflow (Sent) Matcher (Split View) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ── LEFT: RECEIVED (Inflow) ── */}
        <div className="glass-panel p-5 rounded-2xl border border-emerald-500/20 space-y-4 bg-emerald-500/[0.02]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px]">3</span>
              <span>Payment Received (Inflow)</span>
            </div>
            <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => { setReceivedPaymentType('bank'); setSelectedReceivedTx(null); }}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  receivedPaymentType === 'bank' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Building2 size={12} className="inline mr-1" /> Bank Transfer
              </button>
              <button
                type="button"
                onClick={() => { setReceivedPaymentType('cash'); setSelectedReceivedTx(null); }}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  receivedPaymentType === 'cash' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Banknote size={12} className="inline mr-1" /> Cash in Hand
              </button>
            </div>
          </div>

          {receivedPaymentType === 'cash' ? (
            <div className="p-6 rounded-xl border border-dashed border-emerald-500/30 text-center space-y-2 bg-emerald-500/5">
              <Banknote size={32} className="mx-auto text-emerald-400 opacity-80" />
              <div className="text-xs font-bold text-white">Cash Received at Counter</div>
              <div className="text-sm font-mono font-bold text-emerald-400">
                {saleType === 'buy' ? `${baseNum} ${selectedCurrencyCode}` : `${quoteTotal.toLocaleString()} MVR`}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Account Dropdown */}
              <div>
                <label className="input-label">Select Receiving Bank Account</label>
                <select
                  value={receivedAccountId}
                  onChange={e => { setReceivedAccountId(e.target.value); setSelectedReceivedTx(null); }}
                  className="input-field text-xs font-medium"
                >
                  {bankAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.bank_name} - {a.account_name} ({a.account_number}) [{a.currency}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Transactions List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-zinc-400">Click matching incoming deposit to link:</label>
                  {onRefreshLedger && receivedAccountId && (
                    <button
                      type="button"
                      onClick={() => onRefreshLedger(receivedAccountId)}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                    >
                      <RefreshCw size={10} /> Sync
                    </button>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {availableReceivedTransactions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-zinc-500 border border-zinc-800 rounded-xl bg-zinc-950/40">
                      No unclaimed incoming credits found in this account.
                    </div>
                  ) : (
                    availableReceivedTransactions.map((tx, idx) => {
                      const isSelected = selectedReceivedTx?.hash === tx.hash || (selectedReceivedTx?.reference && selectedReceivedTx.reference === tx.reference);
                      return (
                        <div
                          key={tx.hash || idx}
                          onClick={() => setSelectedReceivedTx(tx)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-emerald-500/15 border-emerald-500 shadow-md shadow-emerald-500/10' 
                              : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold font-mono text-emerald-400 text-sm">
                              {tx.amount}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">{tx.date}</span>
                          </div>
                          <div className="text-zinc-300 font-medium truncate mt-1">{tx.details}</div>
                          {tx.sender && <div className="text-[10px] text-zinc-500">From: {tx.sender}</div>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: SENT (Outflow) ── */}
        <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 space-y-4 bg-cyan-500/[0.02]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px]">4</span>
              <span>Payment Sent / Payout (Outflow)</span>
            </div>
            <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => { setSentPaymentType('cash'); setSelectedSentTx(null); }}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  sentPaymentType === 'cash' ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Banknote size={12} className="inline mr-1" /> Cash in Hand
              </button>
              <button
                type="button"
                onClick={() => { setSentPaymentType('bank'); setSelectedSentTx(null); }}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  sentPaymentType === 'bank' ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Building2 size={12} className="inline mr-1" /> Bank Transfer
              </button>
            </div>
          </div>

          {sentPaymentType === 'cash' ? (
            <div className="p-6 rounded-xl border border-dashed border-cyan-500/30 text-center space-y-2 bg-cyan-500/5">
              <Banknote size={32} className="mx-auto text-cyan-400 opacity-80" />
              <div className="text-xs font-bold text-white">Cash Given Out to Customer</div>
              <div className="text-sm font-mono font-bold text-cyan-400">
                {saleType === 'buy' ? `${quoteTotal.toLocaleString()} MVR` : `${baseNum} ${selectedCurrencyCode}`}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Account Dropdown */}
              <div>
                <label className="input-label">Select Sending Bank Account</label>
                <select
                  value={sentAccountId}
                  onChange={e => { setSentAccountId(e.target.value); setSelectedSentTx(null); }}
                  className="input-field text-xs font-medium"
                >
                  {bankAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.bank_name} - {a.account_name} ({a.account_number}) [{a.currency}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Transactions List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-zinc-400">Click matching outgoing transfer to link:</label>
                  {onRefreshLedger && sentAccountId && (
                    <button
                      type="button"
                      onClick={() => onRefreshLedger(sentAccountId)}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                    >
                      <RefreshCw size={10} /> Sync
                    </button>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {availableSentTransactions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-zinc-500 border border-zinc-800 rounded-xl bg-zinc-950/40">
                      No unclaimed outgoing debits found in this account.
                    </div>
                  ) : (
                    availableSentTransactions.map((tx, idx) => {
                      const isSelected = selectedSentTx?.hash === tx.hash || (selectedSentTx?.reference && selectedSentTx.reference === tx.reference);
                      return (
                        <div
                          key={tx.hash || idx}
                          onClick={() => setSelectedSentTx(tx)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-cyan-500/15 border-cyan-500 shadow-md shadow-cyan-500/10' 
                              : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold font-mono text-cyan-400 text-sm">
                              {tx.amount}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">{tx.date}</span>
                          </div>
                          <div className="text-zinc-300 font-medium truncate mt-1">{tx.details}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── STEP 5: Compliance Indicators & Confirmation Bar ── */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-[var(--border-color)] space-y-4 bg-zinc-900/50">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px]">5</span>
            <span>Compliance Review & Final Confirmation</span>
          </div>

          {/* Compliance Risk Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {requiresEdd && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                <AlertTriangle size={12} /> EDD Required (§12)
              </span>
            )}
            {requiresCtr && (
              <span className="px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30 text-[10px] font-bold flex items-center gap-1">
                <AlertTriangle size={12} /> CTR Flagged (≥ 200k MVR Cash)
              </span>
            )}
          </div>
        </div>

        {/* Suspicious Transaction (STR) Toggle */}
        <div className="pt-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={isSuspicious}
              onChange={e => setIsSuspicious(e.target.checked)}
              className="rounded"
            />
            <span className={isSuspicious ? 'text-red-400 font-bold' : 'text-zinc-400'}>
              Flag as Suspicious Transaction (STR) (§17)
            </span>
          </label>
          {isSuspicious && (
            <textarea
              rows={2}
              placeholder="Enter observed inconsistency or grounds for suspicion…"
              value={strNotes}
              onChange={e => setStrNotes(e.target.value)}
              className="input-field mt-2 text-xs resize-none"
            />
          )}
        </div>

        {/* Big Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-zinc-800">
          <div className="text-xs text-zinc-400 flex items-center gap-2">
            <Lock size={14} className="text-emerald-400" />
            <span>Bank transactions will be marked claimed and locked.</span>
          </div>

          <button
            type="button"
            onClick={handleCompleteSale}
            disabled={submitting || baseNum <= 0 || rateNum <= 0}
            className="w-full sm:w-auto py-3.5 px-8 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-black transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 size={18} className="animate-spin" /> Processing Sale…</>
            ) : (
              <>Confirm & Complete Sale <ArrowRight size={18} /></>
            )}
          </button>
        </div>
      </div>

      {/* ── Quick Add Customer Modal ── */}
      {isQuickAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus size={16} className="text-amber-400" /> Register Customer
              </h3>
              <button onClick={() => setIsQuickAddModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleQuickAddCustomer} className="space-y-3 text-xs">
              <div>
                <label className="input-label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Full legal name"
                  value={quickAddForm.full_name}
                  onChange={e => setQuickAddForm({ ...quickAddForm, full_name: e.target.value })}
                  className="input-field py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="input-label">NIC Number</label>
                  <input
                    type="text"
                    placeholder="e.g. A123456"
                    value={quickAddForm.nic_number}
                    onChange={e => setQuickAddForm({ ...quickAddForm, nic_number: e.target.value.toUpperCase() })}
                    className="input-field py-2 text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="input-label">Passport Number</label>
                  <input
                    type="text"
                    placeholder="e.g. N1234567"
                    value={quickAddForm.passport_number}
                    onChange={e => setQuickAddForm({ ...quickAddForm, passport_number: e.target.value.toUpperCase() })}
                    className="input-field py-2 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="input-label">Nationality</label>
                  <input
                    type="text"
                    placeholder="e.g. Maldivian"
                    value={quickAddForm.nationality}
                    onChange={e => setQuickAddForm({ ...quickAddForm, nationality: e.target.value })}
                    className="input-field py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="input-label">Contact Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 7771234"
                    value={quickAddForm.contact_number}
                    onChange={e => setQuickAddForm({ ...quickAddForm, contact_number: e.target.value })}
                    className="input-field py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="input-label">Address</label>
                <input
                  type="text"
                  placeholder="e.g. H. Sunshine, Male"
                  value={quickAddForm.address}
                  onChange={e => setQuickAddForm({ ...quickAddForm, address: e.target.value })}
                  className="input-field py-2 text-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={quickAddForm.is_pep}
                  onChange={e => setQuickAddForm({ ...quickAddForm, is_pep: e.target.checked })}
                  className="rounded"
                />
                <span>Politically Exposed Person (PEP)</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuickAddModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingQuickCustomer}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {savingQuickCustomer ? <Loader2 size={14} className="animate-spin" /> : 'Save & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Shift Sales History Drawer ── */}
      {showRecentSalesDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--bg-card)] border-l border-[var(--border-color)] w-full max-w-md h-full p-6 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History size={18} className="text-emerald-400" /> Today's Shift Sales
              </h3>
              <button onClick={() => setShowRecentSalesDrawer(false)} className="text-zinc-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingRecentSales ? (
                <div className="flex items-center justify-center py-16 text-zinc-500">
                  <Loader2 size={20} className="animate-spin mr-2" /> Loading sales...
                </div>
              ) : recentSales.length === 0 ? (
                <div className="text-center py-16 text-xs text-zinc-500">
                  No sales recorded today yet.
                </div>
              ) : (
                recentSales.map(sale => (
                  <div key={sale.id} className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-amber-400">{sale.receipt_number}</span>
                      <span className="text-[10px] text-zinc-500">{new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="font-medium text-white">{sale.customer_name} ({sale.customer_id_number || 'N/A'})</div>
                    <div className="flex items-center justify-between pt-1 border-t border-zinc-800 text-[11px]">
                      <span className="uppercase text-emerald-400 font-bold">{sale.sale_type} {sale.base_amount} {sale.base_currency}</span>
                      <span className="font-mono text-zinc-300">➔ {Number(sale.quote_amount).toLocaleString()} MVR</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
