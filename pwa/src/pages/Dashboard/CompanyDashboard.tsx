import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Plus, Trash2, LogOut, Copy, Check, MonitorSmartphone, LayoutDashboard, BarChart3, CreditCard, LifeBuoy, CheckCircle2, Info, Download, Bug, Clock, Edit, X, RefreshCw, Settings, Sun, Moon, ArrowRight, Loader2, KeyRound, Lock, Menu, AlertTriangle, Search, FileSpreadsheet, ListFilter, Eye, Activity, Calendar, ChevronRight, User, Briefcase, Sparkles, Gift, Upload, Layers, PhoneCall } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

const maskUsername = (username: string | null | undefined): string | null => {
  if (!username || username.length === 0) return null;
  if (username.length <= 1) return '*';
  if (username.length <= 3) return `${username[0]}${'*'.repeat(username.length - 1)}`;
  return `${username[0]}${'*'.repeat(username.length - 2)}${username[username.length - 1]}`;
};

const Tooltip = ({ text, onClick }: { text: string; onClick?: () => void }) => (
  <div 
    className={`relative inline-flex items-center group ml-2 align-middle ${onClick ? 'cursor-pointer' : 'cursor-help'}`}
    onClick={(e) => {
      if (onClick) {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }
    }}
  >
    <Info size={16} className={`transition-colors ${onClick ? 'text-[var(--color-success)] hover:text-emerald-400' : 'text-[var(--text-secondary)] hover:text-white'}`} />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-zinc-900 border border-zinc-700 text-white text-xs leading-relaxed rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 font-normal">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700"></div>
    </div>
  </div>
);
const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, title, message, itemName }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-white transition-colors">
          <X size={20} />
        </button>
        
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
            <Trash2 size={24} />
          </div>
          <div>
            <h3 className="text-xl font-medium text-white">{title}</h3>
            <p className="text-[var(--text-secondary)] text-sm mt-1">{message}</p>
          </div>
        </div>
        
        {itemName && (
          <div className="bg-[var(--bg-dark)] border border-red-500/20 rounded-lg p-3 mb-6 flex items-center gap-2 text-red-100">
            <Info size={16} className="text-red-400" />
            <span className="font-mono text-sm break-all">{itemName}</span>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[var(--bg-dark)] border border-[var(--border-subtle)] text-white hover:bg-zinc-800 transition-colors font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors shadow-lg shadow-red-500/20"
          >
            Yes, delete it
          </button>
        </div>
      </div>
    </div>
  );
};

export default function CompanyDashboard() {
  const LATEST_EXTENSION_VERSION = "1.4.0";
  const [theme, toggleTheme] = useTheme();
  const [user, setUser] = useState<any>(null);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<{ message: string; retry: () => void } | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activityLogsPage, setActivityLogsPage] = useState(1);
  const [totalAuditLogs, setTotalAuditLogs] = useState(0);
  const activityLogsPageSize = 20;
  const [activityLogSearch, setActivityLogSearch] = useState('');
  const [activityCategoryFilter, setActivityCategoryFilter] = useState<'all' | 'security' | 'verification' | 'config' | 'warning' | 'system'>('all');
  const [activityTerminalFilter, setActivityTerminalFilter] = useState('all');
  const [activityViewMode, setActivityViewMode] = useState<'table' | 'timeline'>('table');
  const [selectedLogDetail, setSelectedLogDetail] = useState<any | null>(null);
                  {/* Balance sync status removed - now using on-demand fetch only */}

  const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, type: 'terminal' | 'account' | null, id: number | null, name: string}>({isOpen: false, type: null, id: null, name: ''});

  // Poll for terminal updates when active (handles pairing code sync)
  useEffect(() => {
    if (activeTab !== 'companies') return;
    
    const token = localStorage.getItem('viri_token');
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/company/terminals', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const newTerminals = await res.json();
          setTerminals(prev => {
            // Only update state if something actually changed to avoid re-renders
            if (JSON.stringify(prev) !== JSON.stringify(newTerminals)) {
              return newTerminals;
            }
            return prev;
          });
        }
      } catch (e) { /* ignore */ }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [activeTab]);


  const navigateToHelp = (sectionId: string) => {
    setActiveTab('help');
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('bg-zinc-800/60', 'ring-2', 'ring-[var(--color-success)]', 'rounded-lg', 'transition-all', 'duration-500', 'p-4', '-mx-4');
        setTimeout(() => {
          el.classList.remove('bg-zinc-800/60', 'ring-2', 'ring-[var(--color-success)]');
        }, 2000);
      }
    }, 100);
  };
  
  // Forms
  const [newTerminalName, setNewTerminalName] = useState('');
  const [bankName, setBankName] = useState('BML');
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<any>(null);
  const [terminalFormName, setTerminalFormName] = useState('');
  const [isSavingTerminal, setIsSavingTerminal] = useState(false);
  const [terminalSettingsPin, setTerminalSettingsPin] = useState('');
  const [hasTerminalSettingsPin, setHasTerminalSettingsPin] = useState(false);
  const [terminalLockPin, setTerminalLockPin] = useState('');
  const [copiedPairingTermId, setCopiedPairingTermId] = useState<number | null>(null);

  const [permissionsForm, setPermissionsForm] = useState({
    verification_enabled: true,
    ledger_enabled: false,
    ledger_show_balance: false,
    ledger_show_debit: false,
    reports_enabled: false,
    statement_enabled: false,
    show_vbtl: false,
    share_pwa_logs: true,
    sales_claiming_enabled: true,
    show_sale_reference_popover: false,
    bml_combined_ledger: false,
    shift_claim_report_enabled: true
  });
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [mibProfileType, setMibProfileType] = useState('0');
  const [bmlProfileType, setBmlProfileType] = useState('0');
  const [currency, setCurrency] = useState('MVR');
  const [mibUsername, setMibUsername] = useState('');
  const [bmlUsername, setBmlUsername] = useState('');

  // Bank Account Edit States
  const [editingBankAccount, setEditingBankAccount] = useState<any | null>(null);
  const [isBankAccountModalOpen, setIsBankAccountModalOpen] = useState(false);
  const [editAccountName, setEditAccountName] = useState('');
  const [editAccountLabel, setEditAccountLabel] = useState('');
  const [editBankName, setEditBankName] = useState('BML');
  const [editMibProfileType, setEditMibProfileType] = useState('0');
  const [editBmlProfileType, setEditBmlProfileType] = useState('0');
  const [editCurrency, setEditCurrency] = useState('MVR');
  const [editMibUsername, setEditMibUsername] = useState('');
  const [editBmlUsername, setEditBmlUsername] = useState('');
  const [isSavingBankAccount, setIsSavingBankAccount] = useState(false);
  const [linkConfirm, setLinkConfirm] = useState<{
    pendingId: number | null;
    pendingUsername: string;
    maskedUsername: string | null;
    siblingCount: number;
    type: 'mib' | 'bml';
    isEdit: boolean;
  } | null>(null);

  // Settings Form States
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsPassword, setSettingsPassword] = useState('');
  const [settingsPasswordConfirm, setSettingsPasswordConfirm] = useState('');
  const [settingsExpiryWarningDays, setSettingsExpiryWarningDays] = useState(7);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Recent Tx Limit Slider State
  const txLimitOptions = [1, 3, 5, 10, 0];
  const [savingTxLimit, setSavingTxLimit] = useState(false);
  const [localTxLimit, setLocalTxLimit] = useState<number | null>(null);
  const [txLimitSavedMsg, setTxLimitSavedMsg] = useState(false);

  const customRecentTxLimitEnabled = Boolean(user?.tenant?.features?.custom_recent_tx_limit);
  const serverRecentTxLimit = user?.tenant?.features?.recent_tx_limit ?? 3;
  const currentTxLimit = localTxLimit !== null ? localTxLimit : serverRecentTxLimit;

  const getTxLimitIndex = (val: number) => {
    if (val === 1) return 0;
    if (val === 3) return 1;
    if (val === 5) return 2;
    if (val === 10) return 3;
    if (val === 0 || val >= 9999) return 4;
    return 1;
  };

  const updateRecentTxLimit = async (newLimit: number) => {
    const token = localStorage.getItem('viri_token') || localStorage.getItem('viri_auth_token');
    if (!token) return;
    setSavingTxLimit(true);
    try {
      const res = await fetch('/api/company/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          phone_number: user?.phone_number || '',
          recent_tx_limit: newLimit
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) setUser(data.user);
        setTxLimitSavedMsg(true);
        setTimeout(() => setTxLimitSavedMsg(false), 2500);
      }
    } catch (err) {
      console.error("Failed to update recent tx limit:", err);
    } finally {
      setSavingTxLimit(false);
    }
  };

  // Billing & Payments States
  const [billingSubTab, setBillingSubTab] = useState<'overview' | 'plans' | 'support'>('overview');
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [paymentSlip, setPaymentSlip] = useState<File | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const fetchPayments = async () => {
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch('/api/company/payments', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        setPayments(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const disableDebug = async (id: number) => {
    try {
      const token = localStorage.getItem('viri_token');
      const response = await fetch(`/api/company/terminals/${id}/disable-debug`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        setTerminals(prev => prev.map(t => t.id === id ? { 
          ...t, 
          debug_one_time_code: null, 
          allow_debug_until: null 
        } : t));
      } else {
        alert("Failed to revoke debug access.");
      }
    } catch (err) {
      console.error(err);
      alert("Error revoking debug access.");
    }
  };
  
  const navigate = useNavigate();

  const getVerificationLimit = () => {
    const tier = user?.tenant?.subscription_tier;
    if (tier === 'free') return '20';
    if (tier === '499') return '300';
    return 'Unlimited';
  };

  const getBankAccountLimit = () => {
    const tier = user?.tenant?.subscription_tier;
    if (tier === '1999') return 10;
    if (tier === '999') return 4;
    return 2; // free & 499
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (loading) return;
    const token = localStorage.getItem('viri_token');
    if (!token) return;
    fetch(`/api/company/audit-logs?page=${activityLogsPage}&per_page=${activityLogsPageSize}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    })
    .then(r => r.json())
    .then(d => { setAuditLogs(d.data); setTotalAuditLogs(d.total); })
    .catch(() => {});
  }, [activityLogsPage]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('viri_token');
      if (!token) throw new Error('Not logged in');

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      };

      const userRes = await fetch('/api/me', { headers });
      if (!userRes.ok) {
        if (userRes.status === 401 || userRes.status === 419) {
          // Truly expired / revoked — only these clear token and redirect to login
          localStorage.removeItem('viri_token');
          navigate('/login');
          return;
        }
        // 5xx, 403, 429, etc. — server issue, not a stale token
        throw new Error(`Server returned ${userRes.status}`);
      }
      const userData = await userRes.json();
      setUser(userData.user);
      setSettingsPhone(userData.user.phone_number || '');
      setSettingsExpiryWarningDays(userData.user.tenant?.features?.expiry_warning_days ?? 7);
      fetchPayments();

      const termsRes = await fetch('/api/company/terminals', { headers });
      setTerminals(await termsRes.json());

      const banksRes = await fetch('/api/company/bank-accounts', { headers });
      setBankAccounts(await banksRes.json());

      const logsRes = await fetch(`/api/company/audit-logs?page=1&per_page=${activityLogsPageSize}`, { headers });
      const logsData = await logsRes.json();
      setAuditLogs(logsData.data);
      setTotalAuditLogs(logsData.total);

    } catch (err: any) {
      const isNetworkError = err instanceof TypeError;
      if (isNetworkError) {
        setFetchError({ message: 'Connection lost. Check your internet connection.', retry: fetchData });
      } else {
        setFetchError({ message: err.message || 'Something went wrong.', retry: fetchData });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('viri_token');
    if (token) {
      await fetch('/api/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }});
    }
    localStorage.removeItem('viri_token');
    navigate('/login');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(null);

    if (settingsPassword && settingsPassword !== settingsPasswordConfirm) {
      setSettingsError("Passwords do not match");
      return;
    }

    setSettingsLoading(true);
    try {
      const token = localStorage.getItem('viri_token');
      const response = await fetch('/api/company/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          phone_number: settingsPhone,
          password: settingsPassword || undefined,
          password_confirmation: settingsPassword ? settingsPasswordConfirm : undefined,
          expiry_warning_days: settingsExpiryWarningDays
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to update profile settings.");
      }

      setSettingsSuccess("Profile settings updated successfully!");
      setSettingsPassword('');
      setSettingsPasswordConfirm('');
      fetchData();
    } catch (err: any) {
      setSettingsError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleUploadPaymentReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);
    setPaymentSuccess(null);
    setPaymentLoading(true);

    if (!paymentSlip) {
      setPaymentError("Please select a transfer slip image to upload");
      setPaymentLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('viri_token');
      const formData = new FormData();
      formData.append('amount', paymentAmount);
      formData.append('remarks', paymentRemarks);
      formData.append('receipt_slip', paymentSlip);

      const response = await fetch('/api/company/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        body: formData
      });

      const data = await response.json();
      if (response.ok) {
        setPaymentSuccess("Payment receipt uploaded successfully! Superadmin will verify it shortly.");
        setPaymentAmount('');
        setPaymentRemarks('');
        setPaymentSlip(null);
        const fileInput = document.getElementById('receipt_slip_file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        fetchPayments();
        fetchData();
      } else {
        setPaymentError(data.message || data.error || "Failed to upload payment receipt");
      }
    } catch (err: any) {
      setPaymentError(err.message || "Network error uploading receipt");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleAddTerminalClick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerminalName.trim()) return;

    const tier = user?.tenant?.subscription_tier;
    if (tier === 'free' || tier === '499') {
      const token = localStorage.getItem('viri_token');
      const response = await fetch('/api/company/terminals', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newTerminalName,
          permissions: {
            verification_enabled: true,
            ledger_enabled: false,
            ledger_show_balance: false,
            ledger_show_debit: false,
            reports_enabled: false,
            show_vbtl: false,
            share_pwa_logs: true
          }
        })
      });
      if (response.ok) {
        setNewTerminalName('');
        fetchData();
      } else {
        const errData = await response.json();
        alert(errData.message || 'Failed to create terminal');
      }
    } else {
      setEditingTerminal(null);
      setTerminalFormName(newTerminalName);
      setPermissionsForm({
        verification_enabled: true,
        ledger_enabled: isFeatureDisabledByPlan('ledger_enabled') ? false : true,
        ledger_show_balance: (isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_balance')) ? false : true,
        ledger_show_debit: (isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_debit')) ? false : true,
        reports_enabled: isFeatureDisabledByPlan('reports_enabled') ? false : true,
        statement_enabled: isFeatureDisabledByPlan('statement_enabled') ? false : true,
        show_vbtl: false,
        share_pwa_logs: true,
        sales_claiming_enabled: true,
        show_sale_reference_popover: false,
        bml_combined_ledger: isFeatureDisabledByPlan('bml_combined_ledger') ? false : false,
        shift_claim_report_enabled: true
      });
      setIsTerminalModalOpen(true);
    }
  };

  const isFeatureDisabledByPlan = (featureKey: string): boolean => {
    const tier = user?.tenant?.subscription_tier;
    const isFreeOr499 = tier === 'free' || tier === '499';
    const features = user?.tenant?.features;

    if (features && typeof features === 'object' && features[featureKey] !== undefined) {
      return !Boolean(features[featureKey]);
    }

    return isFreeOr499;
  };

  const editTerminal = (term: any) => {
    setEditingTerminal(term);
    setTerminalFormName(term.terminal_name);
    setTerminalSettingsPin('');
    setHasTerminalSettingsPin(term.has_settings_pin ?? false);
    setTerminalLockPin(term.permissions?.terminal_pin || '');
    setPermissionsForm({
      verification_enabled: term.permissions?.verification_enabled ?? true,
      ledger_enabled: isFeatureDisabledByPlan('ledger_enabled') ? false : (term.permissions?.ledger_enabled ?? true),
      ledger_show_balance: (isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_balance')) ? false : (term.permissions?.ledger_show_balance ?? true),
      ledger_show_debit: (isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_debit')) ? false : (term.permissions?.ledger_show_debit ?? true),
      reports_enabled: isFeatureDisabledByPlan('reports_enabled') ? false : (term.permissions?.reports_enabled ?? false),
      statement_enabled: isFeatureDisabledByPlan('statement_enabled') ? false : (term.permissions?.statement_enabled ?? false),
      show_vbtl: term.permissions?.show_vbtl ?? false,
      share_pwa_logs: term.permissions?.share_pwa_logs ?? true,
      sales_claiming_enabled: term.permissions?.sales_claiming_enabled ?? true,
      show_sale_reference_popover: term.permissions?.show_sale_reference_popover ?? false,
      bml_combined_ledger: isFeatureDisabledByPlan('bml_combined_ledger') ? false : (term.permissions?.bml_combined_ledger ?? false),
      shift_claim_report_enabled: term.permissions?.shift_claim_report_enabled ?? true
    });
    setIsTerminalModalOpen(true);
  };

  const saveTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalFormName.trim()) return;

    const token = localStorage.getItem('viri_token');
    const isEdit = !!editingTerminal;
    const url = isEdit ? `/api/company/terminals/${editingTerminal.id}` : '/api/company/terminals';
    const method = isEdit ? 'PUT' : 'POST';

    setIsSavingTerminal(true);
    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: terminalFormName,
          settings_pin: terminalSettingsPin ? String(terminalSettingsPin).trim() : undefined,
          permissions: {
            ...permissionsForm,
            terminal_pin: terminalLockPin ? String(terminalLockPin).trim() : null
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        setTerminals(prev => {
          if (isEdit) {
            return prev.map(t => t.id === editingTerminal.id ? { ...t, ...data.terminal } : t);
          }
          return [data.terminal, ...prev];
        });
        
        setIsTerminalModalOpen(false);
        setNewTerminalName('');
        setTerminalFormName('');
        setTerminalSettingsPin('');
        setTerminalLockPin('');
        setEditingTerminal(null);
        
        // Background refresh to keep in sync
        fetchData();
      } else {
        const errData = await response.json().catch(() => ({}));
        alert(errData.message || 'Failed to save terminal');
      }
    } catch (err: any) {
      console.error(err);
      alert('An error occurred while saving terminal settings.');
    } finally {
      setIsSavingTerminal(false);
    }
  };

  const deleteTerminal = async (id: number) => {
    const token = localStorage.getItem('viri_token');
    await fetch(`/api/company/terminals/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }});
    fetchData();
  };

  const enableDebug = async (id: number) => {
    try {
      const token = localStorage.getItem('viri_token');
      const response = await fetch(`/api/company/terminals/${id}/enable-debug`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setTerminals(prev => prev.map(t => t.id === id ? { 
          ...t, 
          debug_one_time_code: data.debug_one_time_code, 
          allow_debug_until: data.allow_debug_until 
        } : t));
      } else {
        alert("Failed to enable debug access.");
      }
    } catch (err) {
      console.error(err);
      alert("Error enabling debug access.");
    }
  };

  const regeneratePairingCode = async (id: number) => {
    try {
      const token = localStorage.getItem('viri_token');
      const response = await fetch(`/api/company/terminals/${id}/regenerate-pairing-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setTerminals(prev => prev.map(t => t.id === id ? { 
          ...t, 
          pairing_code: data.pairing_code, 
          pairing_code_expires_at: data.pairing_code_expires_at 
        } : t));
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.message || "Failed to regenerate pairing code.");
      }
    } catch (err) {
      console.error(err);
      alert("Error regenerating pairing code.");
    }
  };

  const createBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('viri_token');
    const res = await fetch('/api/company/bank-accounts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        bank_name: bankName, 
        account_name: accountName, 
        account_number: accountNumber, 
        mib_profile_type: bankName === 'MIB' ? mibProfileType : '0',
        bml_profile_type: bankName === 'BML' ? bmlProfileType : '0',
        label: accountLabel,
        currency: currency,
        mib_username: bankName === 'MIB' ? mibUsername : null,
        bml_username: bankName === 'BML' ? bmlUsername : null
      })
    });
    
    if (!res.ok) {
      const data = await res.json();
      alert(data.message || 'Error adding account');
      return;
    }

    const data = await res.json();
    const link = data.link;
    if (link?.needs_confirmation && data.account?.id) {
      setLinkConfirm({
        pendingId: data.account.id,
        pendingUsername: bankName === 'MIB' ? mibUsername : bmlUsername,
        maskedUsername: link.masked_username,
        siblingCount: link.sibling_account_count,
        type: link.type || (bankName === 'MIB' ? 'mib' : 'bml'),
        isEdit: false
      });
      return;
    }

    setAccountName('');
    setAccountNumber('');
    setAccountLabel('');
    setMibProfileType('0');
    setBmlProfileType('0');
    setCurrency('MVR');
    setMibUsername('');
    setBmlUsername('');
    fetchData();
  };

  const deleteBankAccount = async (id: number) => {
    const token = localStorage.getItem('viri_token');
    await fetch(`/api/company/bank-accounts/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }});
    fetchData();
  };

  const editBankAccount = (acc: any) => {
    setEditingBankAccount(acc);
    setEditAccountName(acc.account_name);
    setEditAccountLabel(acc.label || '');
    setEditBankName(acc.bank_name);
    setEditMibProfileType(acc.mib_profile_type || '0');
    setEditBmlProfileType(acc.bml_profile_type || '0');
    setEditCurrency(acc.currency || 'MVR');
    setEditMibUsername(acc.mib_username || acc.mib_credential_profile?.credential_group?.mib_username || '');
    setEditBmlUsername(acc.bml_username || acc.bml_credential_group?.bml_username || '');
    setIsBankAccountModalOpen(true);
  };

  const saveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBankAccount) return;

    const token = localStorage.getItem('viri_token');
    setIsSavingBankAccount(true);
    try {
      const res = await fetch(`/api/company/bank-accounts/${editingBankAccount.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_name: editBankName,
          account_name: editAccountName,
          mib_profile_type: editBankName === 'MIB' ? editMibProfileType : '0',
          bml_profile_type: editBankName === 'BML' ? editBmlProfileType : '0',
          label: editAccountLabel,
          currency: editCurrency,
          mib_username: editBankName === 'MIB' ? editMibUsername : null,
          bml_username: editBankName === 'BML' ? editBmlUsername : null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.message || 'Error updating account');
        return;
      }

      const data = await res.json();
      const link = data.link;
      if (link?.needs_confirmation) {
        setIsBankAccountModalOpen(false);
        setLinkConfirm({
          pendingId: editingBankAccount.id,
          pendingUsername: editBankName === 'MIB' ? editMibUsername : editBmlUsername,
          maskedUsername: link.masked_username,
          siblingCount: link.sibling_account_count,
          type: link.type || (editBankName === 'MIB' ? 'mib' : 'bml'),
          isEdit: true
        });
        return;
      }

      setIsBankAccountModalOpen(false);
      setEditingBankAccount(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save bank account: ' + err.message);
    } finally {
      setIsSavingBankAccount(false);
    }
  };

  const confirmLinkSave = async () => {
    if (!linkConfirm) return;
    const token = localStorage.getItem('viri_token');
    setIsSavingBankAccount(true);
    try {
      const baseBody = linkConfirm.isEdit ? {
        bank_name: editBankName,
        account_name: editAccountName,
        mib_profile_type: editBankName === 'MIB' ? editMibProfileType : '0',
        bml_profile_type: editBankName === 'BML' ? editBmlProfileType : '0',
        label: editAccountLabel,
        currency: editCurrency,
      } : {
        bank_name: bankName,
        account_name: accountName,
        account_number: accountNumber,
        mib_profile_type: bankName === 'MIB' ? mibProfileType : '0',
        bml_profile_type: bankName === 'BML' ? bmlProfileType : '0',
        label: accountLabel,
        currency: currency,
      };

      const res = await fetch(`/api/company/bank-accounts/${linkConfirm.pendingId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseBody,
          ...(linkConfirm.type === 'mib' ? { mib_username: linkConfirm.pendingUsername, bml_username: null } : { bml_username: linkConfirm.pendingUsername, mib_username: null }),
          confirm_link: true
        })
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.message || data.error || 'Error linking account');
        return;
      }

      setLinkConfirm(null);
      if (linkConfirm.isEdit) {
        setIsBankAccountModalOpen(false);
        setEditingBankAccount(null);
      } else {
        setAccountName('');
        setAccountNumber('');
        setAccountLabel('');
        setMibProfileType('0');
        setBmlProfileType('0');
        setCurrency('MVR');
        setMibUsername('');
        setBmlUsername('');
      }
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert('Failed to link account: ' + err.message);
    } finally {
      setIsSavingBankAccount(false);
    }
  };



  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Hardware ID copied to clipboard!');
  };

  if (loading) return <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center text-white">Loading...</div>;

  if (fetchError) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="bg-[var(--bg-card)] border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <AlertTriangle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-white text-lg font-semibold mb-2">Connection Issue</h2>
          <p className="text-[var(--text-secondary)] mb-6">{fetchError.message}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={fetchError.retry} className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors shadow-lg shadow-emerald-500/20 flex items-center gap-2">
              <RefreshCw size={16} /> Retry
            </button>
            <button onClick={handleLogout} className="px-6 py-2.5 rounded-xl bg-[var(--bg-dark)] border border-zinc-700 text-white hover:bg-zinc-800 transition-colors font-medium">
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex font-sans antialiased">
      <DeleteConfirmModal 
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({isOpen: false, type: null, id: null, name: ''})}
        onConfirm={() => {
          if (deleteConfirm.type === 'terminal' && deleteConfirm.id) {
            deleteTerminal(deleteConfirm.id);
          } else if (deleteConfirm.type === 'account' && deleteConfirm.id) {
            deleteBankAccount(deleteConfirm.id);
          }
        }}
        title={deleteConfirm.type === 'terminal' ? 'Delete Terminal' : 'Delete Bank Account'}
        message={`Are you sure you want to delete this ${deleteConfirm.type === 'terminal' ? 'terminal' : 'bank account'}? This action cannot be undone and will immediately revoke access.`}
        itemName={deleteConfirm.name}
      />

      {linkConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <button onClick={() => setLinkConfirm(null)} className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-white transition-colors">
              <X size={20} />
            </button>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400 shrink-0">
                <KeyRound size={24} />
              </div>
              <div>
                <h3 className="text-xl font-medium text-white">Link to existing credentials?</h3>
                <p className="text-[var(--text-secondary)] text-sm mt-1">Shared {linkConfirm.type.toUpperCase()} login detected</p>
              </div>
            </div>

            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              This username matches an already-authenticated {linkConfirm.type.toUpperCase()} login:
              <span className="text-white font-mono font-semibold mx-1">{linkConfirm.maskedUsername}</span>
              {linkConfirm.siblingCount > 0 && (
                <span>(already used by {linkConfirm.siblingCount} account{linkConfirm.siblingCount === 1 ? '' : 's'})</span>
              )}.
              Linking this account will let it resume using the existing bank session — it will <span className="text-white">not</span> require a fresh login or OTP.
            </p>

            <p className="text-[11px] text-[var(--text-secondary)] mt-3">
              Verify the username is correct. If it is a typo, cancel and correct it — linking to the wrong account would bind it to that user's credentials.
            </p>

            <div className="flex justify-end gap-3 pt-5 mt-4 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setLinkConfirm(null)}
                className="btn btn-outline border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white py-2 px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingBankAccount}
                onClick={confirmLinkSave}
                className="btn btn-success py-2 px-6 text-sm font-semibold flex items-center justify-center gap-2"
              >
                {isSavingBankAccount ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Linking...
                  </>
                ) : (
                  'Confirm Link'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* ── Sidebar Navigation ── */}
      <aside className="w-56 lg:w-64 border-r border-[var(--border-color)] bg-[var(--bg-surface)] backdrop-blur-xl p-4 lg:p-6 hidden md:flex flex-col justify-between h-screen sticky top-0 shrink-0">
        <div>
          <div className="mb-6 flex items-center justify-start">
            <img 
              src={theme === 'light' ? '/logo_en_black.png' : '/logo_en.png'} 
              alt="Viri Logo" 
              className="h-7 md:h-8 object-contain" 
            />
          </div>
          <nav className="space-y-1.5">
            <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'dashboard' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
              <LayoutDashboard size={18} /> Dashboard
            </button>
            <button onClick={() => setActiveTab('reporting')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'reporting' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
              <BarChart3 size={18} /> Reporting
            </button>
            <button onClick={() => setActiveTab('activity')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'activity' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
              <Clock size={18} /> Activity Logs
            </button>
            <button onClick={() => { setActiveTab('billing'); fetchPayments(); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'billing' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
              <CreditCard size={18} /> Billing & Plans
            </button>
            <button onClick={() => setActiveTab('help')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'help' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
              <Info size={18} /> Help Center
            </button>
          </nav>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'settings' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
            <Settings size={18} /> Settings
          </button>
          <Link to="/affiliate" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 shadow-sm">
            <Gift size={18} className="text-emerald-400 shrink-0" />
            <span>Partner Program (15–25%)</span>
          </Link>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 p-4 sm:p-6 lg:p-10 overflow-y-auto min-w-0">
        {/* Mobile Header Bar (Visible on screens < md) */}
        <div className="md:hidden flex items-center justify-between bg-[var(--bg-card)] border border-[var(--border-color)] p-3.5 rounded-2xl mb-4 backdrop-blur-md shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="p-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-emerald-500/40 transition-all"
              aria-label="Toggle navigation menu"
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <img 
              src={theme === 'light' ? '/logo_en_black.png' : '/logo_en.png'} 
              alt="Viri Logo" 
              className="h-6 object-contain" 
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              title={`Current Theme: ${theme.toUpperCase()}. Click to rotate.`}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shadow-sm shrink-0"
            >
              {theme === 'dark' && <Moon size={15} className="text-indigo-400" />}
              {theme === 'light' && <Sun size={15} className="text-amber-400" />}
              {theme === 'corporate' && <Briefcase size={15} className="text-blue-400" />}
              {theme === 'cute' && <Sparkles size={15} className="text-pink-400" />}
            </button>
            <button onClick={handleLogout} className="btn btn-outline text-xs px-2.5 py-1.5 flex items-center gap-1 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400 transition-all rounded-xl" title="Logout">
              <LogOut size={13} />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown / Menu Drawer */}
        {mobileNavOpen && (
          <div className="md:hidden bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-3 mb-6 shadow-2xl space-y-1 animate-in fade-in zoom-in-95 duration-200">
            <button onClick={() => { setActiveTab('dashboard'); setMobileNavOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-xs font-semibold ${activeTab === 'dashboard' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-[var(--text-secondary)] hover:text-white'}`}>
              <LayoutDashboard size={18} /> Dashboard
            </button>
            <button onClick={() => { setActiveTab('reporting'); setMobileNavOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-xs font-semibold ${activeTab === 'reporting' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-[var(--text-secondary)] hover:text-white'}`}>
              <BarChart3 size={18} /> Reporting
            </button>
            <button onClick={() => { setActiveTab('activity'); setMobileNavOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-xs font-semibold ${activeTab === 'activity' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-[var(--text-secondary)] hover:text-white'}`}>
              <Clock size={18} /> Activity Logs
            </button>
            <button onClick={() => { setActiveTab('billing'); fetchPayments(); setMobileNavOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-xs font-semibold ${activeTab === 'billing' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-[var(--text-secondary)] hover:text-white'}`}>
              <CreditCard size={18} /> Billing & Plans
            </button>
            <button onClick={() => { setActiveTab('help'); setMobileNavOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-xs font-semibold ${activeTab === 'help' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-[var(--text-secondary)] hover:text-white'}`}>
              <Info size={18} /> Help Center
            </button>
            <button onClick={() => { setActiveTab('settings'); setMobileNavOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-xs font-semibold ${activeTab === 'settings' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-[var(--text-secondary)] hover:text-white'}`}>
              <Settings size={18} /> Settings
            </button>
            <Link to="/affiliate" onClick={() => setMobileNavOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Gift size={18} className="text-emerald-400 shrink-0" />
              <span>Partner Program (15–25%)</span>
            </Link>
          </div>
        )}

        <header className="flex flex-wrap sm:flex-nowrap justify-between items-center gap-4 mb-6 sm:mb-8 bg-[var(--bg-card)] border border-[var(--border-color)] p-4 sm:p-5 rounded-2xl backdrop-blur-md shadow-sm">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight capitalize flex items-center gap-2">
              {activeTab === 'dashboard' ? 'Overview' : activeTab === 'billing' ? 'Billing, Plans & Support' : activeTab}
            </h1>
            <p className="text-[var(--text-secondary)] text-xs mt-0.5">
              {activeTab === 'dashboard' && 'Manage and monitor cashier counters and local banking setups'}
              {activeTab === 'reporting' && 'View store settlements, daily sales, and transaction summaries'}
              {activeTab === 'activity' && 'Real-time audit log of terminal connections and security events'}
              {activeTab === 'billing' && 'Manage subscription plans, slip uploads, renewals, and customer support'}
              {activeTab === 'help' && 'Step-by-step setup guides and operational feature documentation'}
              {activeTab === 'settings' && 'Account profile settings and subscription warning preferences'}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 ml-auto sm:ml-0">
            <div className="flex items-center gap-2 sm:gap-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] px-3 sm:px-4 py-2 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-xs uppercase shadow-sm shrink-0">
                {user?.name?.slice(0, 2) || 'US'}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-[var(--text-primary)] leading-none">{user?.name}</div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 leading-none">{user?.tenant?.name}</div>
              </div>
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase">
                {user?.tenant?.subscription_tier === 'free' ? 'Free' : `Tier: ${user?.tenant?.subscription_tier}`}
              </span>
            </div>
            
            <button onClick={handleLogout} className="hidden md:flex btn btn-outline text-xs py-2 items-center gap-2 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400 transition-all rounded-xl">
              <LogOut size={14} /> Logout
            </button>

            {/* Theme Toggle - Positioned in Far Top Right Corner */}
            <button
              onClick={toggleTheme}
              title={`Current Theme: ${theme.toUpperCase()}. Click to rotate.`}
              className="hidden md:flex w-10 h-10 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-emerald-500/40 transition-all shadow-sm shrink-0"
            >
              {theme === 'dark' && <Moon size={16} className="text-indigo-400" />}
              {theme === 'light' && <Sun size={16} className="text-amber-400" />}
              {theme === 'corporate' && <Briefcase size={16} className="text-blue-400" />}
              {theme === 'cute' && <Sparkles size={16} className="text-pink-400" />}
            </button>
          </div>
        </header>

        {user?.status === 'pending' || user?.tenant?.status === 'pending' ? (
          <div className="bg-yellow-950/40 border border-yellow-500/30 p-5 rounded-2xl text-yellow-300 mb-8 shadow-lg flex items-start gap-3">
            <Shield className="shrink-0 mt-0.5 text-yellow-500" />
            <div>
              <h2 className="text-sm font-bold text-white mb-1">Account Pending Approval</h2>
              <p className="text-xs text-yellow-400/80 leading-relaxed">Your account is currently under review by a superadmin. You can configure terminals and bank accounts, but they will not be active until approved.</p>
            </div>
          </div>
        ) : null}

        {/* ─── TAB: DASHBOARD ─── */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {/* Subscription card with dynamic usage metrics */}
              <div className="glass-panel p-6 flex flex-col justify-between min-h-[220px] border border-[var(--border-color)]">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">Subscription</span>
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase">
                      {user?.tenant?.subscription_tier === 'free' ? 'Free Trial' : `MVR ${user?.tenant?.subscription_tier}`}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mt-3">Monthly Usage</h3>
                  
                  {/* Dynamic Progress Bar */}
                  {(() => {
                    const limitVal = getVerificationLimit();
                    const limitNum = limitVal === 'Unlimited' ? Infinity : parseInt(limitVal);
                    const used = user?.tenant?.verifications_count ?? 0;
                    const percent = limitNum === Infinity ? 0 : Math.min(100, (used / limitNum) * 100);
                    return (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5 font-mono">
                          <span>{used} / {limitVal} Verifications</span>
                          <span>{percent > 0 ? `${Math.round(percent)}%` : 'Active'}</span>
                        </div>
                        <div className="w-full bg-zinc-800/20 h-2.5 rounded-full overflow-hidden border border-[var(--border-color)]">
                          <div 
                            className="bg-gradient-to-r from-blue-500 to-indigo-400 h-full rounded-full transition-all duration-500" 
                            style={{ width: limitVal === 'Unlimited' ? '10%' : `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                <div className="border-t border-[var(--border-color)] pt-3 mt-4 flex justify-between text-xs text-[var(--text-secondary)]">
                  <span>Expires:</span>
                  <span className="font-mono text-[var(--text-primary)]">{user?.tenant?.license_expires_at ? new Date(user.tenant.license_expires_at).toLocaleDateString() : 'Never'}</span>
                </div>
              </div>

              {/* Terminals summary card */}
              <div className="glass-panel p-6 flex flex-col justify-between min-h-[220px] border border-[var(--border-color)]">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">Counter Limits</span>
                    <span className="text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-color)] px-2 py-0.5 rounded-full">
                      {terminals.length} / {user?.tenant?.max_terminals ?? 1} Used
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mt-3">Cashier Counters</h3>
                  {(() => {
                    const limit = user?.tenant?.max_terminals ?? 1;
                    const used = terminals.length;
                    const percent = Math.min(100, (used / limit) * 100);
                    return (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5 font-mono">
                          <span>{used} / {limit} Counters</span>
                          <span>{Math.round(percent)}%</span>
                        </div>
                        <div className="w-full bg-zinc-800/20 h-2.5 rounded-full overflow-hidden border border-[var(--border-color)]">
                          <div 
                            className="bg-gradient-to-r from-blue-500 to-indigo-400 h-full rounded-full transition-all duration-500" 
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                <div className="pt-3 border-t border-[var(--border-color)] mt-4 flex justify-between items-center text-xs">
                  <a href={`/viri/viri-bridge-${LATEST_EXTENSION_VERSION}.zip`} download className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline">
                    <Download size={13} /> Download Extension
                  </a>
                  <button 
                    onClick={() => {
                      const el = document.getElementById('cashier-counters-section');
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }} 
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5 hover:underline"
                  >
                    Setup <ArrowRight size={12} />
                  </button>
                </div>
              </div>

              {/* Bank accounts summary card */}
              <div className="glass-panel p-6 flex flex-col justify-between min-h-[220px] border border-[var(--border-color)]">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">Banking</span>
                    <span className="text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-color)] px-2 py-0.5 rounded-full">
                      {bankAccounts.length} / {getBankAccountLimit()} Linked
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mt-3">Linked Accounts</h3>
                  {(() => {
                    const limit = getBankAccountLimit();
                    const used = bankAccounts.length;
                    const percent = Math.min(100, (used / limit) * 100);
                    return (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5 font-mono">
                          <span>{used} / {limit} Accounts</span>
                          <span>{Math.round(percent)}%</span>
                        </div>
                        <div className="w-full bg-zinc-800/20 h-2.5 rounded-full overflow-hidden border border-[var(--border-color)]">
                          <div 
                            className="bg-gradient-to-r from-blue-500 to-indigo-400 h-full rounded-full transition-all duration-500" 
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                <div className="pt-3 border-t border-[var(--border-color)] mt-4 text-xs text-[var(--text-secondary)]">
                  Secure local browser vault storage
                </div>
              </div>

            {/* Horizontal Layout Section 1: Cashier Counters Group Card */}
            <div id="cashier-counters-section" className="glass-panel p-5 sm:p-6 space-y-5 border border-[var(--border-color)]">
              <div className="space-y-3.5 border-b border-[var(--border-color)] pb-4">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                    Cashier Counters
                    <Tooltip text="Create and configure cashier counter device IDs. Edit permissions or allow debugging. Click to learn more." onClick={() => navigateToHelp('help-terminals')} />
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">Register and manage POS terminals paired to this account</p>
                </div>

                <form onSubmit={handleAddTerminalClick} className="flex flex-col gap-2 bg-[var(--bg-surface)] p-2.5 border border-[var(--border-color)] rounded-2xl w-full">
                  <input 
                    type="text" 
                    required 
                    placeholder="Counter name (e.g. Counter 1, Shop Front)" 
                    className="input-field border-transparent bg-transparent focus:ring-0 focus:border-transparent w-full py-2 px-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] min-w-0" 
                    value={newTerminalName} 
                    onChange={e => setNewTerminalName(e.target.value)} 
                  />
                  <button type="submit" className="btn btn-success w-full py-2 px-4 text-xs flex items-center justify-center gap-1.5 font-bold shadow-sm">
                    <Plus size={14} /> Create
                  </button>
                </form>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {terminals.map(term => {
                  const isExpired = term.pairing_code_expires_at ? new Date(term.pairing_code_expires_at).getTime() < now : true;
                  const minutesLeft = term.pairing_code_expires_at ? Math.max(0, Math.floor((new Date(term.pairing_code_expires_at).getTime() - now) / 60000)) : 0;
                  const secondsLeft = term.pairing_code_expires_at ? Math.max(0, Math.floor(((new Date(term.pairing_code_expires_at).getTime() - now) % 60000) / 1000)) : 0;

                  return (
                    <div key={term.id} className="bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-emerald-500/40 hover:shadow-xl rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all duration-300 group">
                      
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-secondary)] group-hover:text-emerald-400 transition-colors">
                            <MonitorSmartphone size={16} />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-[var(--text-primary)] leading-tight">{term.terminal_name}</h4>
                            <div className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5">
                              ID: ...{term.hardware_id ? term.hardware_id.slice(-8) : 'Unpaired'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => editTerminal(term)} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-md hover:bg-white/5" title="Edit Terminal"><Edit size={14}/></button>
                          <button onClick={() => setDeleteConfirm({isOpen: true, type: 'terminal', id: term.id, name: term.name})} className="p-1 text-red-500/60 hover:text-red-400 transition-colors rounded-md hover:bg-red-500/5" title="Delete Terminal"><Trash2 size={14}/></button>
                        </div>
                      </div>

                      {term.pairing_code && !isExpired ? (
                        <div className="bg-yellow-950/20 p-4 rounded-xl border border-yellow-500/20 flex justify-between items-center gap-3">
                          <div>
                            <div className="text-[9px] font-bold text-yellow-500 uppercase tracking-widest mb-0.5">Pairing Code</div>
                            <div className="flex items-center gap-2">
                              <div className="text-2xl font-mono text-yellow-400 tracking-wider font-extrabold">{term.pairing_code}</div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(term.pairing_code);
                                  setCopiedPairingTermId(term.id);
                                  setTimeout(() => setCopiedPairingTermId(null), 2000);
                                }}
                                className="text-[10px] text-yellow-400 hover:text-yellow-200 bg-yellow-950/60 border border-yellow-500/30 hover:border-yellow-400 px-2 py-0.5 rounded transition-all flex items-center gap-1 font-mono font-medium shrink-0"
                                title="Copy Pairing Code"
                              >
                                {copiedPairingTermId === term.id ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                                <span>{copiedPairingTermId === term.id ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[9px] text-[var(--text-secondary)] uppercase tracking-widest mb-0.5">Expires</div>
                            <div className="text-xs font-mono text-yellow-300 bg-yellow-950/60 border border-yellow-500/20 px-2 py-0.5 rounded">
                              {minutesLeft}:{secondsLeft.toString().padStart(2, '0')}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3.5">
                          
                          {/* Device connected status indicator */}
                          {term.hardware_id ? (
                            <div className="flex justify-between items-center bg-emerald-950/10 px-3.5 py-2.5 rounded-xl border border-emerald-500/20">
                              <span className="flex items-center gap-2 text-xs text-emerald-400 font-semibold uppercase tracking-wider">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                                Connected
                              </span>
                              <button onClick={() => copyToClipboard(term.hardware_id)} className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 font-mono uppercase bg-[var(--bg-card)] border border-[var(--border-color)] px-2 py-0.5 rounded" title="Copy Hardware ID">
                                Copy ID <Copy size={10} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center bg-amber-950/10 px-3.5 py-2.5 rounded-xl border border-amber-500/20">
                              <span className="flex items-center gap-2 text-xs text-amber-400 font-semibold uppercase tracking-wider">
                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                                Not Paired
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono">No device connected</span>
                            </div>
                          )}

                          <button type="button" onClick={() => regeneratePairingCode(term.id)} className="w-full border border-yellow-500/30 hover:border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black py-2.5 text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all font-semibold shadow-sm">
                            <RefreshCw size={12} /> {term.hardware_id ? 'Reconnect / Pair Device' : 'Pair Device'}
                          </button>

                          {term.allow_debug_until && new Date(term.allow_debug_until).getTime() > now && term.debug_one_time_code ? (
                            <div className="bg-blue-950/20 border border-blue-500/20 p-3 rounded-xl flex flex-col gap-2.5">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-blue-400 flex items-center gap-1">
                                  <Bug size={12} /> Debug Access Active
                                </span>
                                <span className="text-[10px] font-mono text-blue-300 flex items-center gap-1">
                                  <Clock size={10} />
                                  {Math.max(0, Math.floor((new Date(term.allow_debug_until).getTime() - now) / 60000))}:
                                  {Math.max(0, Math.floor(((new Date(term.allow_debug_until).getTime() - now) % 60000) / 1000)).toString().padStart(2, '0')}
                                </span>
                              </div>
                              <div className="flex justify-between items-center bg-black/40 px-3 py-2 rounded-lg border border-blue-900/30">
                                <div>
                                  <div className="text-[8px] text-[var(--text-secondary)] uppercase tracking-widest">OTC Code</div>
                                  <div className="text-md font-mono font-bold text-blue-300 tracking-wider">{term.debug_one_time_code}</div>
                                </div>
                                <button type="button" onClick={() => {
                                  navigator.clipboard.writeText(term.debug_one_time_code);
                                  alert('One-time code copied!');
                                }} className="text-[9px] px-2 py-1 border border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white transition-colors flex items-center gap-1 rounded-md">
                                  <Copy size={9} /> Copy
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => disableDebug(term.id)}
                                className="w-full border border-red-500/30 hover:border-red-500 text-red-400 hover:bg-red-500 hover:text-white py-1.5 text-[10px] rounded-xl flex items-center justify-center gap-1 transition-all font-bold mt-2 shadow-sm"
                              >
                                <X size={11} /> Revoke Debug Access
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <button type="button" onClick={() => enableDebug(term.id)} className="w-full border border-blue-500/30 hover:border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white py-2 text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all font-semibold">
                                <Bug size={12} /> Allow Superadmin Debug
                              </button>
                              <p className="text-[9px] text-[var(--text-secondary)] text-center mt-0.5 leading-normal">
                                Credentials are never sent during debugging
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Verification Page Recent Transactions Record Count Card (Cashier Counter Card Size & Styling) */}
                <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-emerald-500/40 hover:shadow-xl rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all duration-300 group">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-secondary)] group-hover:text-emerald-400 transition-colors">
                          <Settings size={16} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-[var(--text-primary)] leading-tight">Verification Row Count</h4>
                          <div className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5">
                            Universal PWA Setting
                          </div>
                        </div>
                      </div>
                      <div>
                        {customRecentTxLimitEnabled ? (
                          <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold rounded-lg text-[11px] font-mono">
                            {currentTxLimit === 0 || currentTxLimit >= 9999 ? 'All' : `${currentTxLimit} Records`}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] font-bold rounded-lg flex items-center gap-1 font-mono">
                            <Lock size={10} /> Default (3)
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                      Number of records to show in Verification page:
                    </p>

                    <div className="px-2">
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="1"
                        value={getTxLimitIndex(currentTxLimit)}
                        disabled={!customRecentTxLimitEnabled || savingTxLimit}
                        onChange={(e) => {
                          const idx = parseInt(e.target.value, 10);
                          const newLimit = txLimitOptions[idx];
                          setLocalTxLimit(newLimit);
                        }}
                        className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                      <div className="relative w-full h-6 mt-2 text-[11px] text-[var(--text-secondary)] font-mono font-bold select-none">
                        {[
                          { idx: 0, label: '1', pos: '0%' },
                          { idx: 1, label: '3', pos: '25%' },
                          { idx: 2, label: '5', pos: '50%' },
                          { idx: 3, label: '10', pos: '75%' },
                          { idx: 4, label: 'All', pos: '100%' }
                        ].map(item => {
                          const active = getTxLimitIndex(currentTxLimit) === item.idx;
                          return (
                            <span
                              key={item.idx}
                              onClick={() => {
                                if (customRecentTxLimitEnabled && !savingTxLimit) {
                                  setLocalTxLimit(txLimitOptions[item.idx]);
                                }
                              }}
                              style={{ left: item.pos }}
                              className={`absolute -translate-x-1/2 cursor-pointer transition-all duration-150 ${
                                active ? 'text-emerald-400 font-extrabold scale-110' : 'hover:text-white'
                              }`}
                            >
                              {item.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-[var(--border-color)]">
                    {!customRecentTxLimitEnabled ? (
                      <div className="text-[10px] text-yellow-500/80 flex items-center gap-1">
                        <Lock size={11} className="shrink-0" />
                        <span>Feature locked</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                        {txLimitSavedMsg ? <span className="text-emerald-400 font-bold flex items-center gap-1">✓ Saved</span> : ''}
                      </div>
                    )}
                    
                    {customRecentTxLimitEnabled && (
                      <button
                        type="button"
                        onClick={() => updateRecentTxLimit(currentTxLimit)}
                        disabled={savingTxLimit}
                        className="btn btn-success px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-sm"
                      >
                        {savingTxLimit ? <Loader2 size={12} className="animate-spin" /> : null}
                        Save
                      </button>
                    )}
                  </div>
                </div>

                {terminals.length === 0 && (
                  <div className="col-span-full text-center py-10 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl">
                    <p className="text-sm text-[var(--text-secondary)]">No cashier counters configured.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Horizontal Layout Section 2: Linked Bank Accounts & Select Bank Group Card */}
            <div className="glass-panel p-6 space-y-6 border border-[var(--border-color)] lg:col-span-2">
              <div className="border-b border-[var(--border-color)] pb-4">
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  Linked Accounts
                  <Tooltip text="Link bank accounts here. The cashier counters use these to scan bank transaction statements dynamically." onClick={() => navigateToHelp('help-banks')} />
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Configure bank credentials and profile types for transfer verification</p>
              </div>

              {/* Form Card for Select Bank & Add Account */}
              <form onSubmit={createBankAccount} className="bg-[var(--bg-surface)] border border-[var(--border-color)] p-5 rounded-2xl space-y-4 shadow-sm">
                
                {/* Bank Select, Profile Type & Currency Radio Button Containers (w-fit, Theme-Aligned) */}
                <div className="flex flex-wrap items-center gap-4">
                  {/* Select Bank Radio Option Group */}
                  <div className="w-fit bg-[var(--bg-card)] border border-[var(--border-color)] p-2.5 rounded-xl space-y-1">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-0.5">Select Bank</label>
                    <div className="flex items-center gap-5 px-1 py-0.5">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                        <input
                          type="radio"
                          name="bankSelect"
                          value="BML"
                          checked={bankName === 'BML'}
                          onChange={() => setBankName('BML')}
                          className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                        />
                        Bank of Maldives (BML)
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                        <input
                          type="radio"
                          name="bankSelect"
                          value="MIB"
                          checked={bankName === 'MIB'}
                          onChange={() => setBankName('MIB')}
                          className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                        />
                        Maldives Islamic Bank (MIB)
                      </label>
                    </div>
                  </div>

                  {/* MIB Profile Type Radio Option Group */}
                  {bankName === 'MIB' && (
                    <div className="w-fit bg-[var(--bg-card)] border border-[var(--border-color)] p-2.5 rounded-xl space-y-1">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-0.5">MIB Profile Type</label>
                      <div className="flex items-center gap-5 px-1 py-0.5">
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                          <input
                            type="radio"
                            name="mibProfileType"
                            value="0"
                            checked={mibProfileType === '0'}
                            onChange={() => setMibProfileType('0')}
                            className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                          />
                          Personal
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                          <input
                            type="radio"
                            name="mibProfileType"
                            value="1"
                            checked={mibProfileType === '1'}
                            onChange={() => setMibProfileType('1')}
                            className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                          />
                          Business
                        </label>
                      </div>
                    </div>
                  )}

                  {/* BML Profile Type Radio Option Group */}
                  {bankName === 'BML' && (
                    <div className="w-fit bg-[var(--bg-card)] border border-[var(--border-color)] p-2.5 rounded-xl space-y-1">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-0.5">BML Profile Type</label>
                      <div className="flex items-center gap-5 px-1 py-0.5">
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                          <input
                            type="radio"
                            name="bmlProfileType"
                            value="0"
                            checked={bmlProfileType === '0'}
                            onChange={() => setBmlProfileType('0')}
                            className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                          />
                          Personal
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                          <input
                            type="radio"
                            name="bmlProfileType"
                            value="1"
                            checked={bmlProfileType === '1'}
                            onChange={() => setBmlProfileType('1')}
                            className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                          />
                          Business
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Currency Radio Option Group */}
                  <div className="w-fit bg-[var(--bg-card)] border border-[var(--border-color)] p-2.5 rounded-xl space-y-1">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-0.5">Currency</label>
                    <div className="flex items-center gap-5 px-1 py-0.5 font-mono">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                        <input
                          type="radio"
                          name="currencySelect"
                          value="MVR"
                          checked={currency === 'MVR'}
                          onChange={() => setCurrency('MVR')}
                          className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                        />
                        MVR
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                        <input
                          type="radio"
                          name="currencySelect"
                          value="USD"
                          checked={currency === 'USD'}
                          onChange={() => setCurrency('USD')}
                          className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                        />
                        USD
                      </label>
                    </div>
                  </div>
                </div>

                {/* Account Details Inputs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Account Holder Name</label>
                    <input type="text" required placeholder="Name on account" className="input-field text-sm" value={accountName} onChange={e => setAccountName(e.target.value)} />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Account Number</label>
                    <input type="text" required placeholder="Account number" className="input-field text-sm font-mono" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Label / Nickname</label>
                    <input type="text" placeholder="Counter 1, Main Vault..." className="input-field text-sm" value={accountLabel} onChange={e => setAccountLabel(e.target.value)} />
                  </div>

                  {bankName === 'MIB' && (
                    <div>
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">
                        MIB Login Username <span className="text-[var(--text-tertiary)] normal-case font-normal">(optional)</span>
                      </label>
                      <input type="text" placeholder="e.g. johndoe" autoComplete="off" className="input-field text-sm font-mono" value={mibUsername} onChange={e => setMibUsername(e.target.value)} />
                    </div>
                  )}
                  {bankName === 'BML' && (
                    <div>
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">
                        BML Login Username <span className="text-[var(--text-tertiary)] normal-case font-normal">(optional)</span>
                      </label>
                      <input type="text" placeholder="e.g. johndoe" autoComplete="off" className="input-field text-sm font-mono" value={bmlUsername} onChange={e => setBmlUsername(e.target.value)} />
                    </div>
                  )}
                </div>

                {/* Bottom Row: Add Account Button in Left Corner */}
                <div className="flex justify-start pt-2 border-t border-[var(--border-color)]">
                  <button type="submit" className="btn btn-success px-5 py-2.5 text-xs flex items-center gap-1.5 font-bold shadow-md">
                    <Plus size={14}/> Add Account
                  </button>
                </div>
              </form>

              {/* Bank Accounts Cards Grid */}
              {(() => {
                // Build credential groups from the relation data returned by the API
                type AccType = typeof bankAccounts[0];
                const groupMap: Record<string, { label: string; bank: string; accounts: AccType[] }> = {};
                const unlinked: AccType[] = [];

                bankAccounts.forEach(acc => {
                  if (acc.bml_credential_group_id && acc.bml_credential_group) {
                    const key = `bml-${acc.bml_credential_group_id}`;
                    if (!groupMap[key]) {
                      const pt = acc.bml_credential_group.profile_type === '1' ? 'Business' : 'Personal';
                      groupMap[key] = { label: `${maskUsername(acc.bml_credential_group.bml_username) ?? '—'} · ${pt}`, bank: 'BML', accounts: [] };
                    }
                    groupMap[key].accounts.push(acc);
                  } else if (acc.mib_credential_profile_id && acc.mib_credential_profile) {
                    const key = `mib-${acc.mib_credential_profile_id}`;
                    if (!groupMap[key]) {
                      const username = maskUsername(acc.mib_credential_profile.credential_group?.mib_username) ?? '—';
                      const profileName = acc.mib_credential_profile.profile_name ?? 'Default';
                      groupMap[key] = { label: `${username} · ${profileName}`, bank: 'MIB', accounts: [] };
                    }
                    groupMap[key].accounts.push(acc);
                  } else {
                    unlinked.push(acc);
                  }
                });

                const renderAccRow = (acc: AccType, isNested = false) => (
                  <div key={acc.id} className={`bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-emerald-500/40 rounded-xl p-4 flex justify-between items-center transition-all duration-300 ${isNested ? 'ml-4 border-l-2 border-l-sky-500/30' : ''}`}>
                    <div className="flex gap-3 items-center min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[var(--bg-card)] flex items-center justify-center p-1 border border-[var(--border-color)] shrink-0">
                        <img
                          src={acc.bank_name === 'BML' ? '/logo_bml.png' : '/logo_mib.png'}
                          alt={acc.bank_name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-1.5 truncate">
                          <span className="truncate">{acc.label ? acc.label : (acc.bank_name === 'BML' ? 'BML Account' : 'MIB Account')}</span>
                          <span className="text-[8px] font-extrabold text-emerald-400 bg-emerald-955/40 border border-emerald-500/30 px-1.5 py-0.5 rounded uppercase font-sans shrink-0">Secure</span>
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5 truncate">{acc.account_name}</div>
                        <div className="font-mono text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5">
                          <span>{acc.account_number}</span>
                          <span className="text-[8px] bg-[var(--bg-card)] border border-[var(--border-color)] px-1 rounded font-bold font-mono text-[var(--text-primary)]">{acc.currency || 'MVR'}</span>
                          {acc.bank_name === 'BML' && (acc.bml_profile_type === '1' ? (
                            <span className="text-[8px] bg-violet-950/50 border border-violet-500/30 px-1 rounded font-bold font-sans text-violet-300">Business</span>
                          ) : (
                            <span className="text-[8px] bg-sky-950/50 border border-sky-500/30 px-1 rounded font-bold font-sans text-sky-300">Personal</span>
                          ))}
                          {acc.bank_name === 'MIB' && acc.mib_profile_type === '1' && (
                            <span className="text-[8px] bg-violet-950/50 border border-violet-500/30 px-1 rounded font-bold font-sans text-violet-300">Multi-Profile</span>
                          )}
                        </div>
                        {acc.bank_name === 'MIB' && acc.mib_username && !acc.mib_credential_profile_id && (
                          <div className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5">user: {maskUsername(acc.mib_username)}</div>
                        )}
                        {acc.bank_name === 'BML' && acc.bml_username && !acc.bml_credential_group_id && (
                          <div className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5">user: {maskUsername(acc.bml_username)}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => editBankAccount(acc)} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 rounded-lg transition-colors" title="Edit Account Details"><Edit size={16}/></button>
                      <button onClick={() => setDeleteConfirm({isOpen: true, type: 'account', id: acc.id, name: `${acc.bank_name} - ${acc.account_name} (${acc.account_number})`})} className="p-2 text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/5 rounded-lg transition-colors" title="Delete Account"><Trash2 size={16}/></button>
                    </div>
                  </div>
                );

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Credential groups (sibling accounts) */}
                    {Object.entries(groupMap).map(([key, group]) => (
                      <div key={key} className="rounded-xl border border-sky-500/20 bg-sky-950/5 overflow-hidden col-span-full">
                        {/* Group header */}
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-sky-950/20 border-b border-sky-500/15">
                          <KeyRound size={12} className="text-sky-400 shrink-0" />
                          <span className="text-[10px] font-bold text-sky-300 uppercase tracking-wider">
                            Shared Credentials
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">·</span>
                          <span className="text-[10px] font-mono text-zinc-300 truncate">{group.label}</span>
                          <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${group.bank === 'BML' ? 'text-red-400 bg-red-950/40 border border-red-500/20' : 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/20'}`}>
                            {group.bank}
                          </span>
                          <span className="text-[9px] text-[var(--text-secondary)] shrink-0">{group.accounts.length} accts</span>
                        </div>
                        {/* Accounts in this group */}
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {group.accounts.map(acc => renderAccRow(acc, false))}
                        </div>
                      </div>
                    ))}

                    {/* Unlinked accounts */}
                    {unlinked.map(acc => renderAccRow(acc, false))}

                    {bankAccounts.length === 0 && (
                      <div className="col-span-full text-center py-8 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl">
                        <p className="text-xs text-[var(--text-secondary)]">No bank accounts linked.</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ─── TAB: REPORTING ─── */}

        {activeTab === 'reporting' && (
          <div className="glass-panel p-8 flex flex-col gap-8">
            <div>
              <h2 className="text-2xl font-bold mb-2">Transfer Verification Analytics</h2>
              <p className="text-[var(--text-secondary)]">Sample reporting and predictive analytics for your business.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-[var(--bg-canvas)] p-6 rounded-lg border border-[var(--border-color)]">
                <div className="text-[var(--text-secondary)] mb-1">Today's Verifications</div>
                <div className="text-3xl font-bold">142</div>
                <div className="text-emerald-400 text-sm mt-2 flex items-center gap-1">+12% from yesterday</div>
              </div>
              <div className="bg-[var(--bg-canvas)] p-6 rounded-lg border border-[var(--border-color)]">
                <div className="text-[var(--text-secondary)] mb-1">Total Verified Value</div>
                <div className="text-3xl font-bold">MVR 45,200</div>
                <div className="text-emerald-400 text-sm mt-2 flex items-center gap-1">+8% from last week</div>
              </div>
              <div className="bg-[var(--bg-canvas)] p-6 rounded-lg border border-[var(--border-color)]">
                <div className="text-[var(--text-secondary)] mb-1">Active Terminals</div>
                <div className="text-3xl font-bold">{terminals.length || 3}</div>
                <div className="text-[var(--text-secondary)] text-sm mt-2">All terminals online</div>
              </div>
            </div>

            {/* Sample Chart Area */}
            <div className="bg-[var(--bg-canvas)] p-6 rounded-lg border border-[var(--border-color)]">
              <h3 className="font-bold mb-6">Sales Prediction (7 Days)</h3>
              <div className="h-64 flex items-end justify-between gap-2 border-b border-l border-[var(--border-color)] pb-2 pl-2">
                {/* Fake Bar Chart */}
                {[40, 60, 45, 80, 55, 90, 75].map((height, i) => (
                  <div key={i} className="w-full bg-gradient-to-t from-[var(--color-success)]/20 to-[var(--color-success)] rounded-t hover:opacity-80 transition-opacity relative group" style={{ height: `${height}%` }}>
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-xs p-1 rounded opacity-0 group-hover:opacity-100">
                      {height * 12}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-[var(--text-secondary)]">
                <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: ACTIVITY LOGS --- */}
        {activeTab === 'activity' && (() => {
          // Categorization & formatting helpers
          const getLogCategory = (type: string) => {
            const t = (type || '').toLowerCase();
            if (t.includes('pin') || t.includes('lock') || t.includes('auth') || t.includes('pair') || t.includes('credential')) return 'security';
            if (t.includes('verify') || t.includes('payment') || t.includes('receipt') || t.includes('tx')) return 'verification';
            if (t.includes('terminal') || t.includes('account') || t.includes('update') || t.includes('create') || t.includes('delete') || t.includes('setting')) return 'config';
            if (t.includes('fail') || t.includes('error') || t.includes('reject') || t.includes('warn')) return 'warning';
            return 'system';
          };

          const getCategoryBadgeStyle = (category: string) => {
            switch (category) {
              case 'security':
                return { bg: 'bg-purple-500/15 text-purple-400 border-purple-500/30', icon: Shield, label: 'Security & Auth' };
              case 'verification':
                return { bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: CheckCircle2, label: 'Verification' };
              case 'config':
                return { bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: Settings, label: 'Configuration' };
              case 'warning':
                return { bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30', icon: AlertTriangle, label: 'Warning' };
              default:
                return { bg: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30', icon: Activity, label: 'System Event' };
            }
          };

          const formatEventTitle = (type: string) => {
            if (!type) return 'System Activity';
            const customMap: Record<string, string> = {
              terminal_unlocked: 'Counter Unlocked via PIN',
              terminal_locked: 'Counter Locked via PIN',
              terminal_created: 'New Counter Registered',
              terminal_updated: 'Counter Settings Updated',
              terminal_deleted: 'Counter Removed',
              credential_sync_initiated: 'Credential Sync Started',
              credential_sync_completed: 'Credential Sync Completed',
              bank_account_created: 'Bank Account Linked',
              bank_account_updated: 'Bank Account Updated',
              bank_account_deleted: 'Bank Account Unlinked',
              payment_uploaded: 'Payment Receipt Uploaded',
              profile_updated: 'Admin Profile Updated'
            };
            return customMap[type] || type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          };

          const getTimeAgo = (dateStr: string) => {
            const date = new Date(dateStr);
            const diffMs = Date.now() - date.getTime();
            const mins = Math.floor(diffMs / (1000 * 60));
            if (mins < 1) return 'Just now';
            if (mins < 60) return `${mins}m ago`;
            const hours = Math.floor(mins / 60);
            if (hours < 24) return `${hours}h ago`;
            const days = Math.floor(hours / 24);
            return `${days}d ago`;
          };

          // Metrics calculation
          const totalEventsCount = totalAuditLogs || auditLogs.length;
          const securityEventsCount = auditLogs.filter(l => ['security', 'warning'].includes(getLogCategory(l.event_type))).length;
          const activeTerminalsCount = new Set(auditLogs.map(l => l.actor).filter(Boolean)).size;

          // Peak hour calculation
          const hourCounts: Record<number, number> = {};
          auditLogs.forEach(l => {
            const h = new Date(l.created_at).getHours();
            hourCounts[h] = (hourCounts[h] || 0) + 1;
          });
          let peakHour = 12;
          let maxHCount = 0;
          Object.entries(hourCounts).forEach(([h, cnt]) => {
            if (cnt > maxHCount) {
              maxHCount = cnt;
              peakHour = parseInt(h, 10);
            }
          });
          const peakHourStr = `${String(peakHour).padStart(2, '0')}:00 - ${String((peakHour + 1) % 24).padStart(2, '0')}:00`;

          // 7-day sparkline bar data
          const daysMap = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            const dayStr = d.toLocaleDateString('en-US', { weekday: 'short' });
            const dateKey = d.toISOString().slice(0, 10);
            const count = auditLogs.filter(l => (l.created_at || '').slice(0, 10) === dateKey).length;
            return { dayStr, count };
          });
          const maxDayCount = Math.max(...daysMap.map(d => d.count), 1);

          // Unique terminal list for dropdown filter
          const uniqueTerminals = Array.from(new Set(auditLogs.map(l => l.actor).filter(Boolean)));

          // Filtering
          const filteredLogs = auditLogs.filter((log: any) => {
            const matchesSearch = !activityLogSearch || 
              (log.event_type || '').toLowerCase().includes(activityLogSearch.toLowerCase()) ||
              (log.actor || '').toLowerCase().includes(activityLogSearch.toLowerCase()) ||
              (log.ip_address || '').toLowerCase().includes(activityLogSearch.toLowerCase()) ||
              formatEventTitle(log.event_type).toLowerCase().includes(activityLogSearch.toLowerCase());

            const cat = getLogCategory(log.event_type);
            const matchesCategory = activityCategoryFilter === 'all' || cat === activityCategoryFilter;
            const matchesTerminal = activityTerminalFilter === 'all' || log.actor === activityTerminalFilter;

            return matchesSearch && matchesCategory && matchesTerminal;
          });

          const totalPages = Math.ceil(filteredLogs.length / activityLogsPageSize);
          const currentPageLogs = filteredLogs.slice((activityLogsPage - 1) * activityLogsPageSize, activityLogsPage * activityLogsPageSize);

          // CSV Export Handler
          const exportActivityLogsCSV = () => {
            if (!auditLogs.length) return;
            const headers = ['ID', 'Date/Time', 'Event Type', 'Category', 'Actor/Terminal', 'IP Address', 'Metadata'];
            const rows = filteredLogs.map((log: any) => [
              log.id,
              new Date(log.created_at).toISOString(),
              log.event_type,
              getLogCategory(log.event_type),
              log.actor || 'System',
              log.ip_address || 'N/A',
              JSON.stringify(log.metadata || {})
            ]);
            const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `viri_activity_logs_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          };

          return (
            <div className="space-y-6 animate-fade-in pb-12">
              {/* Header Title */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2.5 text-[var(--text-primary)]">
                    <Clock size={24} className="text-[var(--color-success)]" />
                    Activity Logs & Audit Telemetry
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">Real-time security events, terminal pairing, and counter activity audit trail.</p>
                </div>
                <button
                  onClick={exportActivityLogsCSV}
                  disabled={!auditLogs.length}
                  className="btn btn-outline text-xs px-3.5 py-2 flex items-center gap-2 font-medium text-[var(--text-primary)] hover:border-emerald-500/40 shrink-0 self-start sm:self-auto disabled:opacity-40"
                >
                  <FileSpreadsheet size={15} className="text-emerald-400" />
                  Export Audit CSV
                </button>
              </div>

              {/* 1. Top Telemetry KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Metric 1: Total Logged Events */}
                <div className="glass-panel bg-[var(--bg-surface)]/60 border border-[var(--border-color)] p-4 rounded-2xl flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <Activity size={22} />
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">Total Logged Events</div>
                    <div className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-0.5">{totalEventsCount}</div>
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                      <span>● Recorded (30 Days)</span>
                    </div>
                  </div>
                </div>

                {/* Metric 2: Security & Auth Events */}
                <div className="glass-panel bg-[var(--bg-surface)]/60 border border-[var(--border-color)] p-4 rounded-2xl flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                    <Shield size={22} />
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">Security Events</div>
                    <div className="text-2xl font-bold font-mono text-purple-400 mt-0.5">{securityEventsCount}</div>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">PIN & pairing events</div>
                  </div>
                </div>

                {/* Metric 3: Active Terminal Counters */}
                <div className="glass-panel bg-[var(--bg-surface)]/60 border border-[var(--border-color)] p-4 rounded-2xl flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                    <MonitorSmartphone size={22} />
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">Active Terminals</div>
                    <div className="text-2xl font-bold font-mono text-blue-400 mt-0.5">{activeTerminalsCount}</div>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Counters with activity</div>
                  </div>
                </div>

                {/* Metric 4: Peak Activity Window */}
                <div className="glass-panel bg-[var(--bg-surface)]/60 border border-[var(--border-color)] p-4 rounded-2xl flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <Calendar size={22} />
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">Peak Window</div>
                    <div className="text-sm font-bold font-mono text-amber-400 mt-1">{peakHourStr}</div>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Highest event volume</div>
                  </div>
                </div>
              </div>

              {/* 2. 7-Day Activity Sparkline Bar Chart */}
              <div className="glass-panel bg-[var(--bg-surface)]/60 border border-[var(--border-color)] p-5 rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                    <BarChart3 size={14} className="text-[var(--color-success)]" />
                    7-Day Activity Volume Sparkline
                  </h3>
                  <span className="text-[10px] text-[var(--text-secondary)] font-mono">Daily Audit Density</span>
                </div>
                <div className="h-20 flex items-end justify-between gap-3 pt-4 border-b border-[var(--border-color)] pb-2 px-2">
                  {daysMap.map((d, idx) => {
                    const heightPct = Math.max(Math.round((d.count / maxDayCount) * 100), 8);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-zinc-900 text-white text-[10px] py-1 px-2 rounded border border-zinc-700 font-mono z-20 whitespace-nowrap">
                          {d.dayStr}: <strong>{d.count}</strong> events
                        </div>
                        <div className="w-full bg-emerald-500/20 hover:bg-emerald-500/40 rounded-t transition-all relative overflow-hidden" style={{ height: `${heightPct}%` }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/10 to-emerald-400/50"></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-mono pt-2 px-2">
                  {daysMap.map((d, idx) => (
                    <span key={idx} className="flex-1 text-center">{d.dayStr}</span>
                  ))}
                </div>
              </div>

              {/* 3. Search & Category Filters Bar */}
              <div className="glass-panel bg-[var(--bg-surface)]/60 border border-[var(--border-color)] p-4 rounded-2xl flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-md">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                  <input
                    type="text"
                    placeholder="Search logs by actor, IP, or event type..."
                    value={activityLogSearch}
                    onChange={(e) => { setActivityLogSearch(e.target.value); setActivityLogsPage(1); }}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl pl-10 pr-4 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-emerald-500/50"
                  />
                  {activityLogSearch && (
                    <button onClick={() => setActivityLogSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Filters & View Switcher */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Category Pills */}
                  <div className="flex items-center bg-[var(--bg-card)] border border-[var(--border-color)] p-1 rounded-xl gap-1 overflow-x-auto">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'security', label: 'Security' },
                      { id: 'verification', label: 'Verifications' },
                      { id: 'config', label: 'Config' },
                      { id: 'warning', label: 'Warnings' }
                    ].map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => { setActivityCategoryFilter(cat.id as any); setActivityLogsPage(1); }}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
                          activityCategoryFilter === cat.id
                            ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30'
                            : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Terminal Filter Dropdown */}
                  {uniqueTerminals.length > 0 && (
                    <select
                      value={activityTerminalFilter}
                      onChange={(e) => { setActivityTerminalFilter(e.target.value); setActivityLogsPage(1); }}
                      className="bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                    >
                      <option value="all">All Terminals</option>
                      {uniqueTerminals.map(term => (
                        <option key={term} value={term}>{term}</option>
                      ))}
                    </select>
                  )}

                  {/* View Mode Toggle (Table vs Timeline) */}
                  <div className="flex items-center bg-[var(--bg-card)] border border-[var(--border-color)] p-1 rounded-xl gap-1">
                    <button
                      onClick={() => setActivityViewMode('table')}
                      title="Table View"
                      className={`p-1.5 rounded-lg transition-all ${activityViewMode === 'table' ? 'bg-emerald-500/20 text-emerald-400' : 'text-[var(--text-secondary)] hover:text-white'}`}
                    >
                      <ListFilter size={15} />
                    </button>
                    <button
                      onClick={() => setActivityViewMode('timeline')}
                      title="Timeline View"
                      className={`p-1.5 rounded-lg transition-all ${activityViewMode === 'timeline' ? 'bg-emerald-500/20 text-emerald-400' : 'text-[var(--text-secondary)] hover:text-white'}`}
                    >
                      <Clock size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. Log Display (Data Grid OR Timeline View) */}
              <div className="glass-panel bg-[var(--bg-surface)]/60 border border-[var(--border-color)] p-5 rounded-2xl overflow-hidden">
                {activityViewMode === 'table' ? (
                  /* Data Grid Table View */
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border-color)] text-[var(--text-secondary)] uppercase tracking-wider font-semibold text-[10px]">
                          <th className="py-3 px-4">Date & Time</th>
                          <th className="py-3 px-4">Event Category</th>
                          <th className="py-3 px-4">Event Description</th>
                          <th className="py-3 px-4">Actor / Counter</th>
                          <th className="py-3 px-4">IP Address</th>
                          <th className="py-3 px-4 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-color)] text-[var(--text-secondary)]">
                        {currentPageLogs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-zinc-500 italic">
                              No activity logs match your search and filter criteria.
                            </td>
                          </tr>
                        ) : (
                          currentPageLogs.map((log: any) => {
                            const cat = getLogCategory(log.event_type);
                            const badgeStyle = getCategoryBadgeStyle(cat);
                            const BadgeIcon = badgeStyle.icon;
                            return (
                              <tr 
                                key={log.id} 
                                onClick={() => setSelectedLogDetail(log)}
                                className="hover:bg-white/5 transition-colors cursor-pointer group"
                              >
                                <td className="py-3 px-4 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                                  <div className="text-[var(--text-primary)] font-medium">{new Date(log.created_at).toLocaleDateString()}</div>
                                  <div className="text-[10px] text-[var(--text-secondary)]">{new Date(log.created_at).toLocaleTimeString()} ({getTimeAgo(log.created_at)})</div>
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${badgeStyle.bg}`}>
                                    <BadgeIcon size={13} />
                                    {badgeStyle.label}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                                  {formatEventTitle(log.event_type)}
                                  <div className="text-[10px] font-mono text-[var(--text-secondary)] font-normal">{log.event_type}</div>
                                </td>
                                <td className="py-3 px-4 font-medium text-[var(--text-primary)] whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <User size={13} className="text-zinc-400" />
                                    {log.actor || 'System Auto'}
                                  </div>
                                </td>
                                <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)] whitespace-nowrap">
                                  {log.ip_address || '127.0.0.1'}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button className="p-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] group-hover:border-emerald-500/50 text-[var(--text-secondary)] group-hover:text-emerald-400 transition-all">
                                    <Eye size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Vertical Activity Timeline View */
                  <div className="space-y-4 py-2">
                    {currentPageLogs.length === 0 ? (
                      <div className="py-12 text-center text-zinc-500 italic">No activity logs match your filter.</div>
                    ) : (
                      currentPageLogs.map((log: any, idx: number) => {
                        const cat = getLogCategory(log.event_type);
                        const badgeStyle = getCategoryBadgeStyle(cat);
                        const BadgeIcon = badgeStyle.icon;
                        return (
                          <div 
                            key={log.id} 
                            onClick={() => setSelectedLogDetail(log)}
                            className="flex items-start gap-4 p-3.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-all cursor-pointer group relative"
                          >
                            {/* Connected vertical timeline line */}
                            {idx < currentPageLogs.length - 1 && (
                              <div className="absolute left-7 top-10 bottom-0 w-0.5 bg-[var(--border-color)] z-0"></div>
                            )}

                            {/* Node icon */}
                            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 z-10 ${badgeStyle.bg}`}>
                              <BadgeIcon size={18} />
                            </div>

                            {/* Event detail body */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-[var(--text-primary)]">{formatEventTitle(log.event_type)}</span>
                                <span className="text-[10px] font-mono text-[var(--text-secondary)]">{getTimeAgo(log.created_at)}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-[var(--text-secondary)] font-mono">
                                <span>Actor: <strong className="text-[var(--text-primary)]">{log.actor || 'System'}</strong></span>
                                <span>IP: <strong>{log.ip_address || 'N/A'}</strong></span>
                                <span>Time: <strong>{new Date(log.created_at).toLocaleString()}</strong></span>
                              </div>
                            </div>

                            <ChevronRight size={16} className="text-[var(--text-secondary)] group-hover:text-emerald-400 transition-colors self-center" />
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* 5. Pagination Bar */}
                {filteredLogs.length > 0 && (
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-[var(--border-color)]">
                    <div className="text-xs text-[var(--text-secondary)]">
                      Showing <span className="font-semibold text-[var(--text-primary)]">{(activityLogsPage - 1) * activityLogsPageSize + 1}</span> to <span className="font-semibold text-[var(--text-primary)]">{Math.min(activityLogsPage * activityLogsPageSize, filteredLogs.length)}</span> of <span className="font-semibold text-[var(--text-primary)]">{filteredLogs.length}</span> logs
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        disabled={activityLogsPage === 1}
                        onClick={() => setActivityLogsPage(prev => Math.max(1, prev - 1))}
                        className="px-3.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] hover:border-emerald-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
                      >
                        Previous
                      </button>
                      <span className="text-xs text-[var(--text-secondary)] px-2 font-mono">
                        Page <strong className="text-[var(--text-primary)]">{activityLogsPage}</strong> of <strong className="text-[var(--text-primary)]">{totalPages || 1}</strong>
                      </span>
                      <button
                        disabled={activityLogsPage >= totalPages || totalPages === 0}
                        onClick={() => setActivityLogsPage(prev => Math.min(totalPages, prev + 1))}
                        className="px-3.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] hover:border-emerald-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Event Detail Inspector Modal */}
              {selectedLogDetail && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-lg shadow-2xl p-6 relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                    <button 
                      onClick={() => setSelectedLogDetail(null)}
                      className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-white transition-colors"
                    >
                      <X size={20} />
                    </button>

                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[var(--border-color)]">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <Activity size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-[var(--text-primary)]">{formatEventTitle(selectedLogDetail.event_type)}</h3>
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">ID: #{selectedLogDetail.id} ● {selectedLogDetail.event_type}</span>
                      </div>
                    </div>

                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-2 gap-3 bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--border-color)]">
                        <div>
                          <span className="text-[var(--text-secondary)] block text-[10px] uppercase font-mono">Actor / Counter</span>
                          <span className="font-semibold text-[var(--text-primary)]">{selectedLogDetail.actor || 'System'}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-secondary)] block text-[10px] uppercase font-mono">IP Address</span>
                          <span className="font-mono text-[var(--text-primary)]">{selectedLogDetail.ip_address || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-secondary)] block text-[10px] uppercase font-mono">Timestamp</span>
                          <span className="font-mono text-[var(--text-primary)]">{new Date(selectedLogDetail.created_at).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-secondary)] block text-[10px] uppercase font-mono">Time Elapsed</span>
                          <span className="text-emerald-400 font-semibold">{getTimeAgo(selectedLogDetail.created_at)}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[var(--text-secondary)] block text-[10px] uppercase font-mono mb-1.5">Event Metadata Payload</span>
                        <pre className="p-3 bg-black/50 border border-[var(--border-color)] rounded-xl font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-48">
                          {JSON.stringify(selectedLogDetail.metadata || {}, null, 2)}
                        </pre>
                      </div>
                    </div>

                    <div className="flex justify-end mt-6 pt-3 border-t border-[var(--border-color)]">
                      <button
                        onClick={() => setSelectedLogDetail(null)}
                        className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400 transition-colors"
                      >
                        Close Inspector
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* --- TAB: HELP CENTER --- */}
        {activeTab === 'help' && (
          <div className="glass-panel p-8 max-w-4xl animate-fade-in space-y-12 mb-12">
            <div className="border-b border-zinc-800 pb-6">
              <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                <Info size={32} className="text-[var(--color-success)]" />
                Viri Terminal — Setup & Feature Guide
              </h2>
              <p className="text-zinc-400 mt-4 text-sm leading-relaxed max-w-3xl">
                This comprehensive guide explains how to configure and deploy Viri cashier terminals, manage bank connectivity, and utilize advanced interface and reconciliation features.
                Steps 1–4 are configured by the admin in the dashboard. Steps 5–8 are executed on the cashier device.
              </p>
            </div>

            <section id="help-setup-1" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm font-bold">1</div>
                Register your company
              </h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                Go to viri.thinksafe.mv and register your company. This creates your administrative account with immediate access to the company dashboard. Within the dashboard, you can monitor paired terminals, view audit and activity logs, review settlement reports, manage subscription plans, and configure local banking setups.
              </p>
            </section>

            <section id="help-subscription" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm font-bold">2</div>
                Choose a subscription plan
              </h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                Every newly registered company receives an active evaluation tier with full access to test Viri's capabilities. When you are ready to scale, select a plan from the Plans & Pricing tab (Starter, Pro, or Enterprise). Your tier determines your maximum terminal capacity, bank account allocations, and access to premium modules such as the Statement Generator, Reports Suite, and Live Sync streaming.
              </p>
            </section>

            <section id="help-banks" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm font-bold">3</div>
                Add your bank accounts
              </h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                From the dashboard, select your banking institution (Bank of Maldives or Maldives Islamic Bank), enter the account holder name, and provide the account number. You can assign optional custom labels (e.g. "Main Register", "Front Counter", "Outlet 2") and select whether the profile is Business or Personal. Once saved, these accounts become instantly available on all paired cashier terminals.
              </p>
            </section>

            <section id="help-terminals" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm font-bold">4</div>
                Configure and create cashier counters
              </h3>
              <div className="text-zinc-300 leading-relaxed pl-8 space-y-4">
                <p>Register new cashier counters and configure granular tool permissions for each device:</p>
                <ol className="list-decimal pl-5 space-y-3">
                  <li id="help-pin">
                    <strong>Settings PIN (6-digit)</strong> — Optionally set an administrative PIN required to access device settings or modify sensitive parameters on the terminal.
                  </li>
                  <li>
                    <strong>Terminal Tools & Permissions</strong> — Select the exact features accessible on this specific counter:
                    <ul className="list-disc pl-5 mt-2 space-y-2 text-sm text-zinc-400">
                      <li>
                        <strong className="text-zinc-300">Verification Panel</strong> — Always enabled on every terminal. Provides rapid single-amount search and credit confirmation across all linked accounts.
                      </li>
                      <li>
                        <strong className="text-zinc-300">Transaction Ledger</strong> — Allows cashiers to view recent transaction streams for linked bank accounts. Includes sub-options:
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                          <li><strong>Show Account Balance:</strong> Displays real-time live account balances in the ledger.</li>
                          <li><strong>Show Outward Transactions (Debit):</strong> Includes outgoing transfers alongside incoming credits.</li>
                        </ul>
                      </li>
                      <li>
                        <strong className="text-zinc-300">Enable / Disable Live Balance & Transactions</strong> — Toggle real-time background balance updates and auto-syncing per terminal to optimize bandwidth or restrict live financial visibility.
                      </li>
                      <li>
                        <strong className="text-zinc-300">BML Combined Ledger & Verification View</strong> — Unifies BML account verification searches and transaction ledger statements into a single, cohesive view.
                      </li>
                      <li>
                        <strong className="text-zinc-300">Shift & Transaction Claim Reports</strong> — Enables cashiers to claim received payments, log register opening/closing balances, and generate printable shift handover summaries.
                      </li>
                      <li>
                        <strong className="text-zinc-300">Hide Sidebar When Collapsed</strong> — Maximizes screen space on compact POS screens by completely hiding sidebar icons when collapsed, accessible anytime via the edge toggle.
                      </li>
                    </ul>
                  </li>
                </ol>
                <p>Click <strong>Create Counter</strong> to generate a temporary 6-digit pairing code.</p>
                <p className="text-sm italic text-zinc-400">Counter permissions can be updated at any time from the dashboard. Changes reflect on active terminals immediately without re-pairing.</p>
              </div>
            </section>

            <section id="help-setup-5" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm font-bold">5</div>
                Open the terminal on the POS device
              </h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                On the physical POS computer or tablet, open a modern browser (such as Google Chrome) and navigate to <strong>viri.thinksafe.mv/cashier</strong>. When prompted, enter the 6-digit pairing code generated in Step 4. The device links permanently to that counter profile.
              </p>
            </section>

            <section id="help-setup-6" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm font-bold">6</div>
                Install Viri Bridge extension
              </h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                On the cashier terminal screen, click the <strong>Help</strong> or <strong>Extension</strong> button to download the Viri Bridge browser extension zip package. Follow the in-app instructions to load the unpacked extension in Chrome Developer mode. Viri Bridge operates entirely locally to facilitate high-speed, direct API communications with bank endpoints.
              </p>
            </section>

            <section id="help-setup-7" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm font-bold">7</div>
                Set a terminal screen lock PIN
              </h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                In the terminal header, click Settings and define a 4-digit lock PIN. Cashiers can lock the screen during unattended register periods or shift handovers with a single click, preventing unauthorized viewing without logging out of the device.
              </p>
            </section>

            <section id="help-setup-8" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm font-bold">8</div>
                Connect bank credentials via Direct API
              </h3>
              <div className="text-zinc-300 leading-relaxed pl-8 space-y-4">
                <p>Connect your bank accounts securely using Viri's direct API architecture:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Bank of Maldives (BML):</strong> Authenticate directly through BML's official OAuth portal. Viri acquires and securely stores encrypted API access and refresh tokens locally. No passwords or seeds are stored.
                  </li>
                  <li>
                    <strong>Maldives Islamic Bank (MIB):</strong> Enter account credentials once via the secure API authentication interface.
                  </li>
                </ul>
                <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-xl text-emerald-300 text-sm">
                  <strong>Automatic Tenant-Wide Credential Sync:</strong> Once a bank account is authenticated on any single terminal within your company, Viri automatically distributes the secure session credentials across all other paired terminals under your tenant. Cashiers do not need to repeat bank authentication on every counter.
                </div>
              </div>
            </section>

            {/* Feature Deep-Dive Section */}
            <div className="pt-8 border-t-2 border-zinc-800 space-y-8">
              <div className="border-b border-zinc-800 pb-4">
                <h3 className="text-2xl font-bold text-white">Feature Guides & Operational Workflows</h3>
                <p className="text-zinc-400 text-xs mt-1">Detailed breakdown of Viri's core operational capabilities and display settings.</p>
              </div>

              <div id="help-sidebar-collapse" className="space-y-3">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-mono font-bold">A</div>
                  Hide Sidebar When Collapsed
                </h4>
                <p className="text-zinc-300 text-sm leading-relaxed pl-8">
                  For compact touchscreen registers and tablet displays, you can configure the cashier sidebar to hide completely rather than remaining in icon-only mode. When collapsed, the full width of the screen is dedicated to transaction rows and receipt verifications. Cashiers can open the sidebar instantly whenever needed using the toggle tab located on the left edge of the screen.
                </p>
              </div>

              <div id="help-live-balance" className="space-y-3">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-mono font-bold">B</div>
                  Enable / Disable Live Balance & Transactions
                </h4>
                <p className="text-zinc-300 text-sm leading-relaxed pl-8">
                  Viri allows administrators to tailor financial visibility per terminal counter. In settings where cashiers should only verify specific customer transfer slips without seeing current account totals or outgoing debits, simply disable balance visibility in the counter permission settings. When Live Balance is enabled, account balances update continuously as new credits arrive.
                </p>
              </div>

              <div id="help-bml-combined" className="space-y-3">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-mono font-bold">C</div>
                  BML — Combined Transaction Ledger & Verification View
                </h4>
                <p className="text-zinc-300 text-sm leading-relaxed pl-8">
                  The Combined View unifies payment verification search tools and the live transaction ledger into a single comprehensive interface. Cashiers can monitor real-time incoming credits, search by transfer amount, and review transaction metadata without navigating between separate tabs.
                </p>
              </div>

              <div id="help-shift-claims" className="space-y-3">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-mono font-bold">D</div>
                  Shift Claiming & Daily Register Reports
                </h4>
                <p className="text-zinc-300 text-sm leading-relaxed pl-8">
                  Cashiers can claim individual customer transactions as verified during their shift. At the end of a shift, cashiers generate a comprehensive Shift Claim Report summarizing total verified amounts, transaction counts, and handover totals for store managers.
                </p>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800 text-center">
              <h3 className="text-2xl font-bold text-[var(--color-success)] mb-2">Setup Complete & Ready for POS Operations</h3>
              <p className="text-zinc-400 text-sm">Once credentials and tools are configured, terminals are ready for cashier use with immediate synchronization.</p>
            </div>
          </div>
        )}

        {/* --- TAB: BILLING & PLANS (COMBINED BILLING, PLANS & PRICING, AND SUPPORT) --- */}
        {activeTab === 'billing' && (
          <div className="space-y-8 animate-fade-in text-left">
            
            {/* Elegant Sub-navigation Pill Bar */}
            <div className="flex flex-wrap items-center gap-2 p-1.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl w-full sm:w-fit shadow-sm">
              <button
                type="button"
                onClick={() => setBillingSubTab('overview')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  billingSubTab === 'overview'
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5'
                }`}
              >
                <CreditCard size={14} /> Subscription & Renewals
              </button>
              <button
                type="button"
                onClick={() => setBillingSubTab('plans')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  billingSubTab === 'plans'
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5'
                }`}
              >
                <Layers size={14} /> Plans & Pricing
              </button>
              <button
                type="button"
                onClick={() => setBillingSubTab('support')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  billingSubTab === 'support'
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5'
                }`}
              >
                <LifeBuoy size={14} /> Support & Help Hotline
              </button>
            </div>

            {/* Sub-tab 1: Subscription & Renewals */}
            {billingSubTab === 'overview' && (
              <div className="space-y-8 animate-fade-in">
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Current Plan Summary Card */}
                  <div className="glass-panel p-6 border border-zinc-800 bg-black/20 rounded-2xl flex flex-col justify-between shadow-xl">
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Plan Status</span>
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase">
                          {user?.tenant?.subscription_tier === 'free' ? 'Free Trial' : `Premium MVR ${user?.tenant?.subscription_tier}`}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Current Active Subscription</h3>
                      <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
                        Here are the active features and operational limits allocated to your business account under your current subscription tier.
                      </p>

                      <div className="space-y-3.5 border-t border-zinc-800/60 pt-4">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-500">Monthly Verification Limit</span>
                          <span className="font-mono font-bold text-white">{getVerificationLimit()} Requests</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-500">Maximum Cashier Counters</span>
                          <span className="font-mono font-bold text-white">{user?.tenant?.max_terminals ?? 1} Counters</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-500">Linked Bank Accounts</span>
                          <span className="font-mono font-bold text-white">{getBankAccountLimit()} Accounts</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-500">Subscription Expiration</span>
                          <span className="font-mono font-bold text-zinc-300">
                            {user?.tenant?.license_expires_at ? new Date(user.tenant.license_expires_at).toLocaleDateString() : 'Never'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-zinc-800/60 pt-4 mt-6">
                      <button onClick={() => setBillingSubTab('plans')} className="btn btn-outline border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-xs w-full py-2.5 justify-center font-bold flex items-center gap-2">
                        <Layers size={14} /> Compare All Plans & Limits
                      </button>
                    </div>
                  </div>

                  {/* Submit Payment Receipt Form */}
                  <div className="glass-panel p-6 border border-zinc-800 bg-black/20 rounded-2xl shadow-xl flex flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Submit Payment Slip</h3>
                      <p className="text-xs text-zinc-400 mb-6">Send us a bank transfer slip receipt copy to renew or upgrade your plan.</p>

                      {paymentError && <div className="p-3 mb-4 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs font-semibold">{paymentError}</div>}
                      {paymentSuccess && <div className="p-3 mb-4 bg-green-950/40 border border-green-500/30 rounded-xl text-green-300 text-xs font-semibold">{paymentSuccess}</div>}

                      <form onSubmit={handleUploadPaymentReceipt} className="space-y-4">
                        <div className="input-group">
                          <label className="input-label">Transfer Amount (MVR)</label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            placeholder="e.g. 499.00"
                            className="input-field"
                            value={paymentAmount}
                            onChange={e => setPaymentAmount(e.target.value)}
                          />
                        </div>

                        <div className="input-group">
                          <label className="input-label">Upload Slip Image (PNG/JPEG)</label>
                          <input
                            id="receipt_slip_file"
                            type="file"
                            accept="image/png, image/jpeg"
                            required
                            className="hidden"
                            onChange={e => {
                              if (e.target.files && e.target.files.length > 0) {
                                setPaymentSlip(e.target.files[0]);
                              }
                            }}
                          />
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            <button
                              type="button"
                              onClick={() => document.getElementById('receipt_slip_file')?.click()}
                              className="btn btn-success px-4 py-2.5 text-xs font-bold flex items-center justify-center gap-2 shrink-0 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all"
                            >
                              <Upload size={14} />
                              {paymentSlip ? 'Change Slip File' : 'Choose Transfer Slip'}
                            </button>
                            <div className="flex items-center gap-2 text-xs font-mono bg-[var(--bg-surface)] border border-[var(--border-color)] px-3.5 py-2.5 rounded-xl flex-1 truncate">
                              {paymentSlip ? (
                                <>
                                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                                  <span className="text-white truncate font-medium">{paymentSlip.name}</span>
                                  <span className="text-[10px] text-zinc-500 shrink-0">({(paymentSlip.size / 1024).toFixed(1)} KB)</span>
                                </>
                              ) : (
                                <span className="text-zinc-500">No file chosen (PNG or JPEG, max 5MB)</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="input-group">
                          <label className="input-label">Optional Remarks</label>
                          <textarea
                            rows={2}
                            placeholder="Any additional details or comments..."
                            className="input-field w-full text-xs"
                            value={paymentRemarks}
                            onChange={e => setPaymentRemarks(e.target.value)}
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={paymentLoading}
                          className="btn btn-success w-full py-3 mt-4 justify-center font-bold"
                        >
                          {paymentLoading ? 'Uploading...' : 'Submit Payment Receipt'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>

                {/* Payment Submissions History list */}
                <div className="glass-panel p-6 border border-zinc-800 bg-black/20 rounded-2xl shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-6">Payment Submission History</h3>
                  {payments.length === 0 ? (
                    <div className="text-center text-zinc-500 italic py-8 border border-dashed border-zinc-800/80 rounded-xl">
                      No payment slip submissions recorded.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-800/60 text-zinc-400 font-bold uppercase tracking-wider">
                            <th className="pb-3">Submitted Date</th>
                            <th className="pb-3">Amount</th>
                            <th className="pb-3">Receipt Image</th>
                            <th className="pb-3">Status</th>
                            <th className="pb-3">Remarks / Superadmin Feedback</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/40">
                          {payments.map((p: any) => (
                            <tr key={p.id} className="hover:bg-zinc-850/10">
                              <td className="py-3 text-zinc-400">{new Date(p.created_at).toLocaleString()}</td>
                              <td className="py-3 font-mono font-bold text-white">MVR {parseFloat(p.amount).toFixed(2)}</td>
                              <td className="py-3">
                                <a
                                  href={p.receipt_slip_path}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-400 hover:text-blue-300 underline font-semibold flex items-center gap-1"
                                >
                                  View Slip
                                </a>
                              </td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                                  p.status === 'pending'
                                    ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                    : p.status === 'approved'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                }`}>
                                  {p.status}
                                </span>
                              </td>
                              <td className="py-3 text-zinc-400 max-w-xs truncate" title={p.remarks}>{p.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab 2: Plans & Pricing */}
            {billingSubTab === 'plans' && (
              <div className="flex flex-col gap-8 animate-fade-in">
                <div className="text-center mb-4">
                  <h2 className="text-3xl font-bold mb-3 text-white">Available Subscription Plans</h2>
                  <p className="text-[var(--text-secondary)] text-sm">Choose the plan that best fits your business needs.</p>
                </div>
                
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Free Plan */}
                  <div className="glass-panel p-8 border-t-4 border-t-zinc-500 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-zinc-300">Free Tier</h3>
                      <div className="text-3xl font-bold my-4 text-white">MVR 0 <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                      <ul className="space-y-3 mb-8 text-sm text-zinc-300">
                        <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> 20 verifications / month</li>
                        <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> 1 Cashier Terminal</li>
                        <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> 2 Bank Accounts</li>
                        <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> Standard Support</li>
                      </ul>
                    </div>
                    <button disabled={user?.tenant?.subscription_tier === 'free'} className="btn w-full bg-zinc-800 disabled:opacity-50 font-bold">
                      {user?.tenant?.subscription_tier === 'free' ? 'Current Plan' : 'Downgrade'}
                    </button>
                  </div>

                  {/* Starter Plan */}
                  <div className="glass-panel p-8 border-t-4 border-t-emerald-500 relative flex flex-col justify-between shadow-2xl shadow-emerald-900/10">
                    <div>
                      <h3 className="text-xl font-bold text-emerald-400">Starter</h3>
                      <div className="text-3xl font-bold my-4 text-white">MVR 349.00 <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                      <ul className="space-y-3 mb-8 text-sm text-zinc-300">
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Verification Panel – Search transactions by amount, or preview most recent credits.</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> See balances and basic transaction lists.</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Per terminal customisation of account balance and debit transaction view.</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Shift &amp; transaction claim function and reports.</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> 2 Bank Accounts Total</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> 1 Terminal connection.</li>
                      </ul>
                    </div>
                    <button
                      disabled={user?.tenant?.subscription_tier === '499' || user?.tenant?.subscription_tier === '349'}
                      onClick={() => {
                        setPaymentAmount('349.00');
                        setBillingSubTab('overview');
                      }}
                      className="btn btn-success w-full disabled:opacity-50 disabled:bg-emerald-900 font-bold"
                    >
                      {user?.tenant?.subscription_tier === '499' || user?.tenant?.subscription_tier === '349' ? 'Current Plan' : 'Select Starter Plan'}
                    </button>
                  </div>

                  {/* Pro Plan */}
                  <div className="glass-panel p-8 border-t-4 border-t-purple-500 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-purple-400">Pro</h3>
                      <div className="text-3xl font-bold my-4 text-white">MVR 899.00 <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                      <ul className="space-y-3 mb-8 text-sm text-zinc-300">
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-purple-500 shrink-0 mt-0.5" /> Pro plan includes: everything in starter plan</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-purple-500 shrink-0 mt-0.5" /> Full Tool Suite Access – Verification Panel + Unified Ledger + Reports Suite + Statement Generator.</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-purple-500 shrink-0 mt-0.5" /> On-Demand Statement Generation. Export to PDF, Excel &amp; CSV.</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-purple-500 shrink-0 mt-0.5" /> 4 Bank Accounts (modular – 100.00 per additional bank account).</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-purple-500 shrink-0 mt-0.5" /> 3 Terminals (modular – 200.00 per additional terminal).</li>
                      </ul>
                    </div>
                    <button
                      disabled={user?.tenant?.subscription_tier === '999' || user?.tenant?.subscription_tier === '899'}
                      onClick={() => {
                        setPaymentAmount('899.00');
                        setBillingSubTab('overview');
                      }}
                      className="btn bg-purple-600 hover:bg-purple-500 text-white w-full disabled:opacity-50 font-bold"
                    >
                      {user?.tenant?.subscription_tier === '999' || user?.tenant?.subscription_tier === '899' ? 'Current Plan' : 'Select Pro Plan'}
                    </button>
                  </div>

                  {/* Enterprise Plan */}
                  <div className="glass-panel p-8 border-t-4 border-t-blue-500 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-blue-400">Enterprise</h3>
                      <div className="text-3xl font-bold my-4 text-white">MVR 1999+ <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                      <ul className="space-y-3 mb-8 text-sm text-zinc-300">
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" /> All feature of Pro</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" /> Unlimited verifications</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" /> 6 Cashier Terminals, additional CT at 200.00</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" /> 10 Bank Accounts, additional account at 100.00</li>
                        <li className="flex items-start gap-2"><CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" /> Live Update (live bank balance and transactions)</li>
                      </ul>
                    </div>
                    <button
                      disabled={user?.tenant?.subscription_tier === '1999'}
                      onClick={() => {
                        setPaymentAmount('1999.00');
                        setBillingSubTab('overview');
                      }}
                      className="btn bg-blue-600 hover:bg-blue-500 text-white w-full disabled:opacity-50 font-bold"
                    >
                      {user?.tenant?.subscription_tier === '1999' ? 'Current Plan' : 'Select Enterprise Plan'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-tab 3: Support & Hotline */}
            {billingSubTab === 'support' && (
              <div className="glass-panel p-8 sm:p-12 max-w-3xl mx-auto text-center animate-fade-in space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
                  <LifeBuoy size={36} />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Dedicated Customer Support</h2>
                  <p className="text-[var(--text-secondary)] text-sm max-w-xl mx-auto leading-relaxed">
                    Our technical team is available to assist your business with cashier counter setups, bank connectivity, plan customizations, and live transaction troubleshooting.
                  </p>
                </div>
                
                <div className="bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border-color)] inline-block shadow-md max-w-md w-full">
                  <div className="text-xs text-[var(--text-secondary)] mb-2 font-medium">Direct Support Hotline:</div>
                  <a href="tel:7793811" className="text-3xl sm:text-4xl font-extrabold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center justify-center gap-3">
                    <PhoneCall size={28} className="text-emerald-400" />
                    779-3811
                  </a>
                  <div className="text-[11px] text-zinc-500 mt-2 font-mono">Available 24/7 for urgent register assistance</div>
                </div>

                <div className="pt-4 flex flex-wrap justify-center gap-4">
                  <button
                    onClick={() => setActiveTab('help')}
                    className="btn btn-outline text-xs px-5 py-2.5 flex items-center gap-2 font-bold"
                  >
                    <Info size={14} /> Open Help Center Guide
                  </button>
                  <button
                    onClick={() => setBillingSubTab('plans')}
                    className="btn btn-success text-xs px-5 py-2.5 flex items-center gap-2 font-bold"
                  >
                    <Layers size={14} /> View Subscription Plans
                  </button>
                </div>
              </div>
            )}

          </div>
        )}


        {/* --- TAB: SETTINGS --- */}
        {activeTab === 'settings' && (
          <div className="glass-panel p-8 max-w-xl animate-fade-in">
            <h2 className="text-xl font-bold text-white mb-4">Account Settings</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-6">Update your phone number and administrative password.</p>
            
            {settingsError && <div className="p-3 mb-6 bg-red-900/30 border border-red-500/50 rounded text-red-200 text-sm">{settingsError}</div>}
            {settingsSuccess && <div className="p-3 mb-6 bg-green-950/40 border border-green-500/30 rounded text-green-200 text-sm">{settingsSuccess}</div>}

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="input-group">
                <label className="input-label">Admin Email (Static)</label>
                <input type="email" disabled className="input-field opacity-60 cursor-not-allowed" value={user?.email || ''} />
              </div>

              <div className="input-group">
                <label className="input-label">Phone Number</label>
                <input 
                  type="text" 
                  required 
                  className="input-field" 
                  value={settingsPhone} 
                  onChange={e => setSettingsPhone(e.target.value)} 
                />
              </div>

              <div className="input-group">
                <label className="input-label">Subscription Expiry Warning Notices</label>
                <select
                  className="input-field w-full font-semibold"
                  value={settingsExpiryWarningDays}
                  onChange={e => setSettingsExpiryWarningDays(parseInt(e.target.value))}
                >
                  <option value={0}>None (Do not warn)</option>
                  <option value={1}>1 Day before</option>
                  <option value={3}>3 Days before</option>
                  <option value={7}>7 Days before (Default)</option>
                  <option value={14}>14 Days before</option>
                  <option value={30}>30 Days before</option>
                </select>
                <p className="text-[10px] text-zinc-500 mt-1 leading-normal">
                  Warn cashier registers when subscription expiration time approaches within this period.
                </p>
              </div>

              <div className="input-group">
                <label className="input-label">New Password (Leave blank to keep current)</label>
                <input 
                  type="password" 
                  className="input-field" 
                  value={settingsPassword} 
                  onChange={e => setSettingsPassword(e.target.value)} 
                />
              </div>

              <div className="input-group">
                <label className="input-label">Confirm New Password</label>
                <input 
                  type="password" 
                  className="input-field" 
                  value={settingsPasswordConfirm} 
                  onChange={e => setSettingsPasswordConfirm(e.target.value)} 
                />
              </div>

              <button 
                type="submit" 
                disabled={settingsLoading} 
                className={`btn btn-success w-full py-3 mt-4 justify-center ${settingsLoading ? 'opacity-70' : ''}`}
              >
                {settingsLoading ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>
        )}

      </main>



      {isTerminalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl max-w-6xl w-full p-5 sm:p-7 shadow-2xl relative animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto backdrop-blur-xl">
            <button 
              type="button"
              onClick={() => setIsTerminalModalOpen(false)} 
              className="absolute top-5 right-5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-full hover:bg-[var(--bg-surface)] transition-colors"
            >
              <X size={20} />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                <MonitorSmartphone size={22} className="text-emerald-400" />
                {editingTerminal ? 'Edit Cashier Counter' : 'Configure Counter Permissions'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Configure device credentials, permissions, and security PINs for this POS terminal</p>
            </div>

            <form onSubmit={saveTerminal} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
                
                {/* Column 1: Counter Identity & Security */}
                <div className="glass-panel bg-[var(--bg-surface)]/60 border border-[var(--border-color)] p-5 rounded-2xl space-y-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-[var(--border-color)]">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <MonitorSmartphone size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)] leading-tight">Counter Access & Security</h3>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Device credentials & security PINs</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                          Counter Name
                        </label>
                        <input 
                          type="text" 
                          required 
                          placeholder="e.g. Counter 1, Front Desk" 
                          className="input-field w-full text-xs" 
                          value={terminalFormName} 
                          onChange={e => setTerminalFormName(e.target.value)} 
                        />
                      </div>

                       <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>Settings PIN (Optional)</span>
                          <Tooltip text="A 6-digit PIN required on the PWA to edit settings or view sensitive information. Leave blank to disable. Click for more info." onClick={() => navigateToHelp('help-pin')} />
                        </label>
                        {hasTerminalSettingsPin && <p className="text-[10px] text-green-500 mb-1 font-mono">PIN is currently configured. Enter a new PIN to change, or leave blank to keep current.</p>}
                        <input 
                          type="text" 
                          maxLength={6}
                          pattern="\d{0,6}"
                          placeholder={hasTerminalSettingsPin ? "Leave blank to keep current PIN" : "e.g. 123456"} 
                          className="input-field w-full font-mono text-xs tracking-wider" 
                          value={terminalSettingsPin} 
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            setTerminalSettingsPin(val);
                          }} 
                        />
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1">6-digit PIN for access to counter settings menu.</p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>PWA Lockout PIN (Optional)</span>
                          <Tooltip text="A 4-digit PIN to lock/unlock the cashier counter screen. Leave blank to disable or clear/unlock." />
                        </label>
                        <div className="flex gap-2">
                          <input 
                            type="password" 
                            maxLength={4}
                            pattern="\d{0,4}"
                            placeholder={editingTerminal?.permissions?.terminal_pin ? "PIN Set (Hidden)" : "e.g. 1234"} 
                            className="input-field flex-1 font-mono text-xs tracking-widest" 
                            value={terminalLockPin} 
                            onChange={e => {
                              const val = e.target.value.replace(/\D/g, '');
                              setTerminalLockPin(val);
                            }} 
                          />
                          {(editingTerminal?.permissions?.terminal_pin || terminalLockPin) && (
                            <button
                              type="button"
                              onClick={() => {
                                setTerminalLockPin('');
                                if (editingTerminal && editingTerminal.permissions) {
                                  editingTerminal.permissions.terminal_pin = null;
                                }
                                alert("Lockout PIN reset/cleared. Click 'Save' to apply changes.");
                              }}
                              className="btn btn-outline border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white px-2.5 py-1 text-[11px] transition-colors shrink-0 rounded-xl"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1">4-digit code to quickly lock terminal screen.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 2: Counter Capabilities & Core Tools */}
                <div className="glass-panel bg-[var(--bg-surface)]/60 border border-[var(--border-color)] p-5 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-[var(--border-color)]">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                      <Shield size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)] leading-tight">Counter Capabilities</h3>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Primary cashier tools & modules</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Verification Panel */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-colors">
                      <label htmlFor="perm-verification" className="relative inline-flex items-center cursor-not-allowed shrink-0 mt-0.5 select-none">
                        <input 
                          type="checkbox" 
                          id="perm-verification"
                          checked={permissionsForm.verification_enabled} 
                          disabled 
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500 peer-disabled:opacity-40"></div>
                      </label>
                      <div>
                        <label htmlFor="perm-verification" className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 cursor-not-allowed">
                          Verification Panel <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold">REQUIRED</span>
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">Allows cashier to verify incoming MVR bank transfer receipts.</p>
                      </div>
                    </div>

                    {/* Shift & Claim Report */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-colors">
                      <label htmlFor="perm-shift-claim-report" className="relative inline-flex items-center cursor-not-allowed shrink-0 mt-0.5 select-none">
                        <input 
                          type="checkbox" 
                          id="perm-shift-claim-report"
                          checked={permissionsForm.shift_claim_report_enabled} 
                          disabled 
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500 peer-disabled:opacity-40"></div>
                      </label>
                      <div>
                        <label htmlFor="perm-shift-claim-report" className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 cursor-not-allowed">
                          Shift & Claim Report <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold">REQUIRED</span>
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">Allows cashier to view and generate end-of-day shift closure and claim reports.</p>
                      </div>
                    </div>

                    {/* Transaction Ledger */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-colors">
                      <label htmlFor="perm-ledger" className={`relative inline-flex items-center shrink-0 mt-0.5 select-none ${isFeatureDisabledByPlan('ledger_enabled') ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input 
                          type="checkbox" 
                          id="perm-ledger"
                          checked={permissionsForm.ledger_enabled} 
                          disabled={isFeatureDisabledByPlan('ledger_enabled')}
                          onChange={e => setPermissionsForm(prev => ({ 
                            ...prev, 
                            ledger_enabled: e.target.checked,
                            ledger_show_balance: e.target.checked ? prev.ledger_show_balance : false,
                            ledger_show_debit: e.target.checked ? prev.ledger_show_debit : false
                          }))}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500 peer-disabled:opacity-40"></div>
                      </label>
                      <div>
                        <label htmlFor="perm-ledger" className={`text-xs font-bold flex items-center gap-1.5 ${isFeatureDisabledByPlan('ledger_enabled') ? 'text-[var(--text-secondary)] cursor-not-allowed opacity-60' : 'text-[var(--text-primary)] cursor-pointer'}`}>
                          Transaction Ledger
                          {isFeatureDisabledByPlan('ledger_enabled') && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">DISABLED BY PLAN</span>
                          )}
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">Allows cashier to view account transaction statement history.</p>
                      </div>
                    </div>

                    {/* View Analytics & Reports */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-colors">
                      <label htmlFor="perm-reports" className={`relative inline-flex items-center shrink-0 mt-0.5 select-none ${isFeatureDisabledByPlan('reports_enabled') ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input 
                          type="checkbox" 
                          id="perm-reports"
                          checked={permissionsForm.reports_enabled} 
                          onChange={e => setPermissionsForm(prev => ({ ...prev, reports_enabled: e.target.checked }))}
                          disabled={isFeatureDisabledByPlan('reports_enabled')}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500 peer-disabled:opacity-40"></div>
                      </label>
                      <div>
                        <label htmlFor="perm-reports" className={`text-xs font-bold flex items-center gap-1.5 ${isFeatureDisabledByPlan('reports_enabled') ? 'text-[var(--text-secondary)] cursor-not-allowed opacity-60' : 'text-[var(--text-primary)] cursor-pointer'}`}>
                          View Analytics & Reports
                          {isFeatureDisabledByPlan('reports_enabled') && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">DISABLED BY PLAN</span>
                          )}
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">Grants access to reporting charts and analytics panels.</p>
                      </div>
                    </div>

                    {/* Bank Statements */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-colors">
                      <label htmlFor="perm-statement" className={`relative inline-flex items-center shrink-0 mt-0.5 select-none ${isFeatureDisabledByPlan('statement_enabled') ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input 
                          type="checkbox" 
                          id="perm-statement"
                          checked={permissionsForm.statement_enabled} 
                          onChange={e => setPermissionsForm(prev => ({ ...prev, statement_enabled: e.target.checked }))}
                          disabled={isFeatureDisabledByPlan('statement_enabled')}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500 peer-disabled:opacity-40"></div>
                      </label>
                      <div>
                        <label htmlFor="perm-statement" className={`text-xs font-bold flex items-center gap-1.5 ${isFeatureDisabledByPlan('statement_enabled') ? 'text-[var(--text-secondary)] cursor-not-allowed opacity-60' : 'text-[var(--text-primary)] cursor-pointer'}`}>
                          Bank Statements Generator
                          {isFeatureDisabledByPlan('statement_enabled') && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">DISABLED BY PLAN</span>
                          )}
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">Allows cashier to generate and export bank account statements.</p>
                      </div>
                    </div>

                    {/* BML Combined Ledger & Verification View */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-colors">
                      <label htmlFor="perm-bml-combined" className={`relative inline-flex items-center shrink-0 mt-0.5 select-none ${isFeatureDisabledByPlan('bml_combined_ledger') ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input 
                          type="checkbox" 
                          id="perm-bml-combined"
                          checked={permissionsForm.bml_combined_ledger} 
                          onChange={e => setPermissionsForm(prev => ({ ...prev, bml_combined_ledger: e.target.checked }))}
                          disabled={isFeatureDisabledByPlan('bml_combined_ledger')}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500 peer-disabled:opacity-40"></div>
                      </label>
                      <div>
                        <label htmlFor="perm-bml-combined" className={`text-xs font-bold flex items-center gap-1.5 ${isFeatureDisabledByPlan('bml_combined_ledger') ? 'text-[var(--text-secondary)] cursor-not-allowed opacity-60' : 'text-[var(--text-primary)] cursor-pointer'}`}>
                          BML Combined Ledger & Verification View
                          {isFeatureDisabledByPlan('bml_combined_ledger') && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">DISABLED BY PLAN</span>
                          )}
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">Merges recent verification entries into statement history when viewing BML account ledgers.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 3: Advanced Data Controls & Diagnostics */}
                <div className="glass-panel bg-[var(--bg-surface)]/60 border border-[var(--border-color)] p-5 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-[var(--border-color)]">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                      <Settings size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)] leading-tight">Advanced Data Controls</h3>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Ledger details & diagnostic logging</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Show Account Balance */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-colors">
                      <label htmlFor="perm-ledger-balance" className={`relative inline-flex items-center shrink-0 mt-0.5 select-none ${(isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_balance')) ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input 
                          type="checkbox" 
                          id="perm-ledger-balance"
                          checked={permissionsForm.ledger_show_balance} 
                          disabled={isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_balance')}
                          onChange={e => setPermissionsForm(prev => ({ ...prev, ledger_show_balance: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500 peer-disabled:opacity-40"></div>
                      </label>
                      <div>
                        <label htmlFor="perm-ledger-balance" className={`text-xs font-bold flex items-center gap-1.5 ${(isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_balance')) ? 'text-[var(--text-secondary)] cursor-not-allowed opacity-60' : 'text-[var(--text-primary)] cursor-pointer'}`}>
                          Show Account Balance
                          {(isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_balance')) && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">DISABLED BY PLAN</span>
                          )}
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">Display live bank account balances on the cashier terminal.</p>
                      </div>
                    </div>

                    {/* Show Outward Transactions (DEBIT) */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-colors">
                      <label htmlFor="perm-ledger-debit" className={`relative inline-flex items-center shrink-0 mt-0.5 select-none ${(isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_debit')) ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input 
                          type="checkbox" 
                          id="perm-ledger-debit"
                          checked={permissionsForm.ledger_show_debit} 
                          disabled={isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_debit')}
                          onChange={e => setPermissionsForm(prev => ({ ...prev, ledger_show_debit: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500 peer-disabled:opacity-40"></div>
                      </label>
                      <div>
                        <label htmlFor="perm-ledger-debit" className={`text-xs font-bold flex items-center gap-1.5 ${(isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_debit')) ? 'text-[var(--text-secondary)] cursor-not-allowed opacity-60' : 'text-[var(--text-primary)] cursor-pointer'}`}>
                          Show Outward Debit Transfers
                          {(isFeatureDisabledByPlan('ledger_enabled') || isFeatureDisabledByPlan('ledger_show_debit')) && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">DISABLED BY PLAN</span>
                          )}
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">Display outgoing payments alongside incoming credits.</p>
                      </div>
                    </div>

                    {/* Show Sale Reference Popover */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-colors">
                      <label htmlFor="perm-sale-ref-popover" className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5 select-none">
                        <input 
                          type="checkbox" 
                          id="perm-sale-ref-popover"
                          checked={permissionsForm.show_sale_reference_popover} 
                          onChange={e => setPermissionsForm(prev => ({ ...prev, show_sale_reference_popover: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500 peer-disabled:opacity-40"></div>
                      </label>
                      <div>
                        <label htmlFor="perm-sale-ref-popover" className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer">
                          Sale Reference Popover
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                          Prompt cashier to enter optional Sale # / Invoice # / POS Slip ID when claiming sales.
                        </p>
                      </div>
                    </div>

                    {/* Share PWA Logs */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl hover:border-emerald-500/40 transition-colors">
                      <label htmlFor="perm-share-logs" className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5 select-none">
                        <input 
                          type="checkbox" 
                          id="perm-share-logs"
                          checked={permissionsForm.share_pwa_logs} 
                          onChange={e => setPermissionsForm(prev => ({ ...prev, share_pwa_logs: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500 peer-disabled:opacity-40"></div>
                      </label>
                      <div>
                        <label htmlFor="perm-share-logs" className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer">
                          Share Diagnostic Logs
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                          Automatically send anonymized execution logs for superadmin troubleshooting.
                        </p>
                      </div>
                    </div>

                    {/* Auto-Sync Live Balance & Transactions (Read-only Indicator) */}
                    <div className="flex items-start gap-3 p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl opacity-80">
                      <label className="relative inline-flex items-center shrink-0 mt-0.5 select-none cursor-not-allowed">
                        <input 
                          type="checkbox" 
                          checked={!isFeatureDisabledByPlan('auto_sync_enabled')} 
                          disabled={true}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700/70 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 peer-checked:after:translate-x-4 peer-checked:bg-emerald-500 border border-white/10 opacity-50"></div>
                      </label>
                      <div>
                        <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2 cursor-not-allowed">
                          Auto-Sync Live Balance & Transactions
                          {isFeatureDisabledByPlan('auto_sync_enabled') ? (
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">DISABLED BY PLAN</span>
                          ) : (
                            <span className="text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono font-bold">ENABLED BY PLAN</span>
                          )}
                        </label>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                          Superadmin plan feature indicator. Toggle switches are configured directly per account on Cashier PWA.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Starter Tier Locked Premium Card */}
              {(user?.tenant?.subscription_tier === 'free' || user?.tenant?.subscription_tier === '499') && (
                <div className="relative overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-5">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs uppercase tracking-wider font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                      🔒 Feature Preview: Transaction Ledger
                    </h4>
                    <span className="text-[10px] bg-purple-500/10 border border-purple-500/30 text-purple-400 px-2 py-0.5 rounded font-medium">Growth / Enterprise</span>
                  </div>

                  <div className="blur-[2px] opacity-25 select-none pointer-events-none transition-all duration-300">
                    <div className="flex justify-between items-end border-b border-[var(--border-color)] pb-2 mb-3">
                      <div>
                        <div className="text-[9px] text-[var(--text-secondary)]">Available Balance</div>
                        <div className="text-sm font-bold font-mono text-emerald-400">MVR 124,539.20</div>
                      </div>
                      <div className="text-[9px] text-[var(--text-secondary)] font-mono">Last synced: Just now</div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] border-b border-[var(--border-color)] pb-1.5">
                        <span className="text-[var(--text-primary)]">Transfer from Ahmed Niyaz</span>
                        <span className="font-mono text-emerald-400 font-bold">+MVR 500.00</span>
                      </div>
                      <div className="flex justify-between text-[10px] border-b border-[var(--border-color)] pb-1.5">
                        <span className="text-[var(--text-primary)]">BML POS Terminal Charge</span>
                        <span className="font-mono text-red-400 font-bold">-MVR 45.00</span>
                      </div>
                      <div className="flex justify-between text-[10px] pb-0.5">
                        <span className="text-[var(--text-primary)]">Transfer from Aminath Ali</span>
                        <span className="font-mono text-emerald-400 font-bold">+MVR 2,400.00</span>
                      </div>
                    </div>
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)]/95 to-[var(--bg-card)]/80 flex flex-col items-center justify-center text-center p-6">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2">
                      <Shield size={18} />
                    </div>
                    <p className="text-xs font-semibold text-[var(--text-primary)] max-w-sm mb-1">
                      Unlock full Cashier features in Growth & Enterprise plans!
                    </p>
                    <p className="text-[10px] text-[var(--text-secondary)] max-w-sm">
                      Enable real-time bank statements, ledger views, debit filtering and live balance indicators right on the terminal counters.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-[var(--border-color)] pt-5 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsTerminalModalOpen(false)} 
                  className="btn btn-outline text-xs px-4 py-2 rounded-xl"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSavingTerminal}
                  className="btn btn-success text-xs px-6 py-2 rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  {isSavingTerminal ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isBankAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <button 
              type="button"
              onClick={() => {
                setIsBankAccountModalOpen(false);
                setEditingBankAccount(null);
              }} 
              className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-full hover:bg-[var(--bg-surface)] transition-colors"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6">
              Edit Bank Account Details
            </h2>

            <form onSubmit={saveBankAccount} className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                {/* Select Bank */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3 rounded-xl space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-0.5">Select Bank</label>
                  <div className="flex flex-col gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                      <input
                        type="radio"
                        name="editBankSelect"
                        value="BML"
                        checked={editBankName === 'BML'}
                        onChange={() => setEditBankName('BML')}
                        className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                      />
                      Bank of Maldives (BML)
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                      <input
                        type="radio"
                        name="editBankSelect"
                        value="MIB"
                        checked={editBankName === 'MIB'}
                        onChange={() => setEditBankName('MIB')}
                        className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                      />
                      Maldives Islamic Bank (MIB)
                    </label>
                  </div>
                </div>

                {/* Profile Type */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3 rounded-xl space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-0.5">Profile Type</label>
                  <div className="flex flex-col gap-2 pt-1">
                    {editBankName === 'BML' ? (
                      <>
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                          <input
                            type="radio"
                            name="editBmlProfileType"
                            value="0"
                            checked={editBmlProfileType === '0'}
                            onChange={() => setEditBmlProfileType('0')}
                            className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                          />
                          Personal
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                          <input
                            type="radio"
                            name="editBmlProfileType"
                            value="1"
                            checked={editBmlProfileType === '1'}
                            onChange={() => setEditBmlProfileType('1')}
                            className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                          />
                          Business
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                          <input
                            type="radio"
                            name="editMibProfileType"
                            value="0"
                            checked={editMibProfileType === '0'}
                            onChange={() => setEditMibProfileType('0')}
                            className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                          />
                          Personal
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                          <input
                            type="radio"
                            name="editMibProfileType"
                            value="1"
                            checked={editMibProfileType === '1'}
                            onChange={() => setEditMibProfileType('1')}
                            className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                          />
                          Business
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Currency */}
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-3 rounded-xl space-y-1 w-fit">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-0.5">Currency</label>
                <div className="flex items-center gap-5 px-1 py-0.5 font-mono">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                    <input
                      type="radio"
                      name="editCurrencySelect"
                      value="MVR"
                      checked={editCurrency === 'MVR'}
                      onChange={() => setEditCurrency('MVR')}
                      className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                    />
                    MVR
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
                    <input
                      type="radio"
                      name="editCurrencySelect"
                      value="USD"
                      checked={editCurrency === 'USD'}
                      onChange={() => setEditCurrency('USD')}
                      className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                    />
                    USD
                  </label>
                </div>
              </div>

              {/* Account Details */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                    Account Holder Name
                  </label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Name on account" 
                    className="input-field w-full text-sm" 
                    value={editAccountName} 
                    onChange={e => setEditAccountName(e.target.value)} 
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                    Account Number
                    <span className="text-[9px] bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded uppercase font-bold tracking-wider">Locked</span>
                  </label>
                  <input 
                    type="text" 
                    disabled 
                    className="input-field w-full text-sm font-mono opacity-50 cursor-not-allowed bg-zinc-950/20" 
                    value={editingBankAccount?.account_number || ''} 
                  />
                  <p className="text-[10px] text-[var(--text-secondary)] mt-1">For integrity, the account number cannot be edited. Delete and re-add if needed.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                    Label / Nickname
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. Main Vault" 
                    className="input-field w-full text-sm" 
                    value={editAccountLabel} 
                    onChange={e => setEditAccountLabel(e.target.value)} 
                  />
                </div>

                {editBankName === 'MIB' && (
                  <div>
                    <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                      MIB Login Username <span className="text-[10px] font-normal text-zinc-500">(optional — leave unchanged to keep existing)</span>
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. johndoe" 
                      autoComplete="off"
                      className="input-field w-full text-sm font-mono" 
                      value={editMibUsername} 
                      onChange={e => setEditMibUsername(e.target.value)} 
                    />
                  </div>
                )}
                {editBankName === 'BML' && (
                  <div>
                    <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                      BML Login Username <span className="text-[10px] font-normal text-zinc-500">(optional — leave unchanged to keep existing)</span>
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. johndoe" 
                      autoComplete="off"
                      className="input-field w-full text-sm font-mono" 
                      value={editBmlUsername} 
                      onChange={e => setEditBmlUsername(e.target.value)} 
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-800 pt-5 mt-6">
                <button 
                  type="button" 
                  onClick={() => {
                    setIsBankAccountModalOpen(false);
                    setEditingBankAccount(null);
                  }} 
                  className="btn btn-outline border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white py-2 px-4 text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSavingBankAccount}
                  className="btn btn-success py-2 px-6 text-sm font-semibold flex items-center justify-center gap-2"
                >
                  {isSavingBankAccount ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

