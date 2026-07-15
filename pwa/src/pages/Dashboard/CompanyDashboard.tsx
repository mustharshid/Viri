import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, Trash2, LogOut, Copy, MonitorSmartphone, LayoutDashboard, BarChart3, CreditCard, LifeBuoy, CheckCircle2, Info, Download, Bug, Clock, Edit, X, RefreshCw, Settings, Sun, Moon, ArrowRight, Loader2, KeyRound } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

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
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">
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
  const LATEST_EXTENSION_VERSION = "1.2.27";
  const [theme, toggleTheme] = useTheme();
  const [user, setUser] = useState<any>(null);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [now, setNow] = useState(Date.now());
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [syncHealthSummary, setSyncHealthSummary] = useState<any>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, type: 'terminal' | 'account' | null, id: number | null, name: string}>({isOpen: false, type: null, id: null, name: ''});

  // ── Credential Sync (Standalone Page) ──────────────────────────────────────
  const [credSync, setCredSync] = useState<{
    state: 'idle' | 'syncing' | 'done' | 'error';
    syncId: string | null;
    sourceTerminalId: string;
    targetTerminalId: string;
    syncStartedAt: number | null;
    sourceReady: boolean;  // source has encrypted & uploaded
    error: string | null;
  }>({
    state: 'idle',
    syncId: null,
    sourceTerminalId: '',
    targetTerminalId: '',
    syncStartedAt: null,
    sourceReady: false,
    error: null,
  });
  const credSyncCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [credSyncSecondsLeft, setCredSyncSecondsLeft] = useState(300);

  const startCredSync = async () => {
    if (!credSync.sourceTerminalId || !credSync.targetTerminalId) return;
    const token = localStorage.getItem('viri_token');
    const res = await fetch('/api/company/credential-sync/initiate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_terminal_id: parseInt(credSync.sourceTerminalId),
        target_terminal_id: parseInt(credSync.targetTerminalId),
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setCredSync(prev => ({ ...prev, state: 'error', error: data.error || 'Failed to start sync.' }));
      return;
    }
    setCredSync(prev => ({
      ...prev,
      state: 'syncing',
      syncId: data.sync_id,
      syncStartedAt: Date.now(),
      sourceReady: false,
      error: null,
    }));
    setCredSyncSecondsLeft(300);
  };

  const cancelCredSync = async () => {
    if (credSync.syncId) {
      const token = localStorage.getItem('viri_token');
      await fetch(`/api/company/credential-sync/${credSync.syncId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
    setCredSync({ state: 'idle', syncId: null, sourceTerminalId: '', targetTerminalId: '', syncStartedAt: null, sourceReady: false, error: null });
    if (credSyncCountdownRef.current) clearInterval(credSyncCountdownRef.current);
  };

  // Countdown timer while syncing
  useEffect(() => {
    if (credSync.state !== 'syncing' || !credSync.syncStartedAt) {
      if (credSyncCountdownRef.current) clearInterval(credSyncCountdownRef.current);
      return;
    }
    credSyncCountdownRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - credSync.syncStartedAt!) / 1000);
      const left = Math.max(0, 300 - elapsed);
      setCredSyncSecondsLeft(left);
      if (left === 0) {
        clearInterval(credSyncCountdownRef.current!);
        setCredSync(prev => ({ ...prev, state: 'error', error: 'Sync session expired (5 min timeout). Please start again.' }));
      }
    }, 1000);
    return () => { if (credSyncCountdownRef.current) clearInterval(credSyncCountdownRef.current); };
  }, [credSync.state, credSync.syncStartedAt]);

  // Poll status while syncing
  useEffect(() => {
    if (credSync.state !== 'syncing' || !credSync.syncId) return;
    const token = localStorage.getItem('viri_token');
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/company/credential-sync/${credSync.syncId}/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'ready' || data.status === 'pending_import') {
          setCredSync(prev => ({ ...prev, sourceReady: true }));
        }
        if (data.status === 'completed') {
          setCredSync(prev => ({ ...prev, state: 'done' }));
          if (credSyncCountdownRef.current) clearInterval(credSyncCountdownRef.current);
        }
        if (data.status === 'expired') {
          setCredSync(prev => ({ ...prev, state: 'error', error: 'Sync session expired on the server. Please start again.' }));
          if (credSyncCountdownRef.current) clearInterval(credSyncCountdownRef.current);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [credSync.state, credSync.syncId]);


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
  const [terminalSettingsPin, setTerminalSettingsPin] = useState('');
  const [terminalLockPin, setTerminalLockPin] = useState('');
  const [permissionsForm, setPermissionsForm] = useState({
    verification_enabled: true,
    ledger_enabled: false,
    ledger_show_balance: false,
    ledger_show_debit: false,
    reports_enabled: false,
    show_vbtl: false,
    share_pwa_logs: true
  });
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [mibProfileType, setMibProfileType] = useState('0');
  const [bmlProfileType, setBmlProfileType] = useState('0');
  const [currency, setCurrency] = useState('MVR');

  // Settings Form States
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsPassword, setSettingsPassword] = useState('');
  const [settingsPasswordConfirm, setSettingsPasswordConfirm] = useState('');
  const [settingsExpiryWarningDays, setSettingsExpiryWarningDays] = useState(7);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Billing & Payments States
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
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
    if (tier === '1999') return 20;
    if (tier === '999') return 4;
    return 2; // free & 499
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('viri_token');
      if (!token) throw new Error('Not logged in');

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      };

      const userRes = await fetch('/api/me', { headers });
      if (!userRes.ok) throw new Error('Unauthorized');
      const userData = await userRes.json();
      setUser(userData.user);
      setSettingsPhone(userData.user.phone_number || '');
      setSettingsExpiryWarningDays(userData.user.tenant?.features?.expiry_warning_days ?? 7);
      fetchPayments();

      const termsRes = await fetch('/api/company/terminals', { headers });
      setTerminals(await termsRes.json());

      const banksRes = await fetch('/api/company/bank-accounts', { headers });
      setBankAccounts(await banksRes.json());

      const logsRes = await fetch('/api/company/audit-logs', { headers });
      setAuditLogs(await logsRes.json());

      try {
        const healthRes = await fetch('/api/company/sync-health', { headers });
        if (healthRes.ok) {
          setSyncHealthSummary(await healthRes.json());
        }
      } catch (e) {
        console.error("Failed to fetch sync health:", e);
      }

    } catch (err) {
      navigate('/login');
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
      formData.append('reference_number', paymentRef);
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
        setPaymentRef('');
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
        ledger_enabled: false,
        ledger_show_balance: false,
        ledger_show_debit: false,
        reports_enabled: false,
        show_vbtl: false,
        share_pwa_logs: true
      });
      setIsTerminalModalOpen(true);
    }
  };

  const editTerminal = (term: any) => {
    setEditingTerminal(term);
    setTerminalFormName(term.terminal_name);
    setTerminalSettingsPin(term.settings_pin || '');
    setTerminalLockPin(term.permissions?.terminal_pin || '');
    setPermissionsForm({
      verification_enabled: term.permissions?.verification_enabled ?? true,
      ledger_enabled: term.permissions?.ledger_enabled ?? false,
      ledger_show_balance: term.permissions?.ledger_show_balance ?? false,
      ledger_show_debit: term.permissions?.ledger_show_debit ?? false,
      reports_enabled: term.permissions?.reports_enabled ?? false,
      show_vbtl: term.permissions?.show_vbtl ?? false,
      share_pwa_logs: term.permissions?.share_pwa_logs ?? true
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

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: terminalFormName,
          settings_pin: String(terminalSettingsPin || '').trim() || null,
          permissions: {
            ...permissionsForm,
            terminal_pin: terminalLockPin ? String(terminalLockPin).trim() : null
          }
        })
      });

      if (response.ok) {
        setIsTerminalModalOpen(false);
        setNewTerminalName('');
        setTerminalFormName('');
        setTerminalSettingsPin('');
        setTerminalLockPin('');
        setEditingTerminal(null);
        fetchData();
      } else {
        const errData = await response.json().catch(() => ({}));
        alert(errData.message || 'Failed to save terminal');
      }
    } catch (err: any) {
      console.error(err);
      alert('An error occurred while saving terminal settings.');
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
        currency: currency
      })
    });
    
    if (!res.ok) {
      const data = await res.json();
      alert(data.message || 'Error adding account');
    } else {
      setAccountName('');
      setAccountNumber('');
      setAccountLabel('');
      setMibProfileType('0');
      setBmlProfileType('0');
      setCurrency('MVR');
      fetchData();
    }
  };

  const deleteBankAccount = async (id: number) => {
    const token = localStorage.getItem('viri_token');
    await fetch(`/api/company/bank-accounts/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }});
    fetchData();
  };

  const resetBankAccountFailures = async (id: number) => {
    const token = localStorage.getItem('viri_token');
    const res = await fetch(`/api/company/bank-accounts/${id}/reset-failures`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (res.ok) {
      fetchData();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.message || 'Error resetting failures');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Hardware ID copied to clipboard!');
  };

  if (loading) return <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center text-white">Loading...</div>;

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
      
      {/* ── Sidebar Navigation ── */}
      <aside className="w-64 border-r border-zinc-800/60 bg-zinc-950/40 backdrop-blur-xl p-6 hidden md:flex flex-col justify-between h-screen sticky top-0 shrink-0">
        <div>
          <div className="mb-8 flex items-center justify-center p-3 rounded-2xl bg-zinc-900/20 border border-zinc-800/40 shadow-inner">
            <img src="/logo_en.png" alt="Viri Logo" className="h-16 object-contain filter drop-shadow-[0_0_15px_rgba(16,185,129,0.15)]" />
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
            <button onClick={() => setActiveTab('credential-sync')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'credential-sync' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
              <KeyRound size={18} /> Credential Sync
            </button>
            <button onClick={() => setActiveTab('plans')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'plans' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
              <CreditCard size={18} /> Plans & Pricing
            </button>
            <button onClick={() => { setActiveTab('billing'); fetchPayments(); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'billing' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
              <CreditCard size={18} /> Billing & Payments
            </button>
            <button onClick={() => setActiveTab('support')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'support' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
              <LifeBuoy size={18} /> Support
            </button>
            <button onClick={() => setActiveTab('help')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'help' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
              <Info size={18} /> Help Center
            </button>
          </nav>
        </div>
        <div>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-semibold ${activeTab === 'settings' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'hover:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-white'}`}>
            <Settings size={18} /> Settings
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 p-6 lg:p-10 overflow-y-auto">
        <header className="flex justify-between items-center mb-8 bg-zinc-900/10 border border-zinc-800/30 p-5 rounded-2xl backdrop-blur-md">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight capitalize flex items-center gap-2">
              {activeTab === 'dashboard' ? 'Overview' : activeTab}
            </h1>
            <p className="text-zinc-400 text-xs mt-0.5">Manage and monitor cashier counters and local banking setups</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5 bg-zinc-900/60 border border-zinc-800/80 px-4 py-2 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                {user?.name?.slice(0, 2) || 'US'}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-white leading-none">{user?.name}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5 leading-none">{user?.tenant?.name}</div>
              </div>
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase">
                {user?.tenant?.subscription_tier === 'free' ? 'Free' : `Tier: ${user?.tenant?.subscription_tier}`}
              </span>
            </div>
            
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:text-white hover:border-emerald-500/40 transition-all shadow-sm"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={handleLogout} className="btn btn-outline text-xs py-2.5 flex items-center gap-2 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400 transition-all rounded-xl">
              <LogOut size={14} /> Logout
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
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid md:grid-cols-4 gap-6">
              
              {/* Subscription card with dynamic usage metrics */}
              <div className="glass-panel p-6 flex flex-col justify-between min-h-[220px]">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Subscription</span>
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase">
                      {user?.tenant?.subscription_tier === 'free' ? 'Free Trial' : `MVR ${user?.tenant?.subscription_tier}`}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-3">Monthly Usage</h3>
                  
                  {/* Dynamic Progress Bar */}
                  {(() => {
                    const limitVal = getVerificationLimit();
                    const limitNum = limitVal === 'Unlimited' ? Infinity : parseInt(limitVal);
                    const used = user?.tenant?.verifications_count ?? 0;
                    const percent = limitNum === Infinity ? 0 : Math.min(100, (used / limitNum) * 100);
                    return (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-zinc-400 mb-1.5 font-mono">
                          <span>{used} / {limitVal} Verifications</span>
                          <span>{percent > 0 ? `${Math.round(percent)}%` : 'Active'}</span>
                        </div>
                        <div className="w-full bg-zinc-800/80 h-2.5 rounded-full overflow-hidden border border-zinc-700/30">
                          <div 
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500" 
                            style={{ width: limitVal === 'Unlimited' ? '10%' : `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                <div className="border-t border-zinc-800/60 pt-3 mt-4 flex justify-between text-xs text-zinc-500">
                  <span>Expires:</span>
                  <span className="font-mono text-zinc-300">{user?.tenant?.license_expires_at ? new Date(user.tenant.license_expires_at).toLocaleDateString() : 'Never'}</span>
                </div>
              </div>

              {/* Terminals summary card */}
              <div className="glass-panel p-6 flex flex-col justify-between min-h-[220px]">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Counter Limits</span>
                    <span className="text-xs font-bold text-zinc-300 bg-zinc-800/60 border border-zinc-700/60 px-2 py-0.5 rounded-full">
                      {terminals.length} / {user?.tenant?.max_terminals ?? 1} Used
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-3">Cashier Counters</h3>
                  {(() => {
                    const limit = user?.tenant?.max_terminals ?? 1;
                    const used = terminals.length;
                    const percent = Math.min(100, (used / limit) * 100);
                    return (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-zinc-400 mb-1.5 font-mono">
                          <span>{used} / {limit} Counters</span>
                          <span>{Math.round(percent)}%</span>
                        </div>
                        <div className="w-full bg-zinc-800/80 h-2 rounded-full overflow-hidden border border-zinc-700/30">
                          <div 
                            className="bg-gradient-to-r from-blue-500 to-indigo-400 h-full rounded-full transition-all duration-500" 
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                <div className="pt-3 border-t border-zinc-800/60 mt-4 flex justify-between items-center text-xs">
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
              <div className="glass-panel p-6 flex flex-col justify-between min-h-[220px]">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Banking</span>
                    <span className="text-xs font-bold text-zinc-300 bg-zinc-800/60 border border-zinc-700/60 px-2 py-0.5 rounded-full">
                      {bankAccounts.length} / {getBankAccountLimit()} Linked
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-3">Linked Accounts</h3>
                  {(() => {
                    const limit = getBankAccountLimit();
                    const used = bankAccounts.length;
                    const percent = Math.min(100, (used / limit) * 100);
                    return (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-zinc-400 mb-1.5 font-mono">
                          <span>{used} / {limit} Accounts</span>
                          <span>{Math.round(percent)}%</span>
                        </div>
                        <div className="w-full bg-zinc-800/80 h-2 rounded-full overflow-hidden border border-zinc-700/30">
                          <div 
                            className="bg-gradient-to-r from-purple-500 to-pink-400 h-full rounded-full transition-all duration-500" 
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                <div className="pt-3 border-t border-zinc-800/60 mt-4 text-xs text-zinc-500">
                  Secure local browser vault storage
                </div>
              </div>

              {/* Synchronization Health summary card */}
              <div className="glass-panel p-6 flex flex-col justify-between min-h-[220px]">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Sync Engine</span>
                    {syncHealthSummary && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                        syncHealthSummary.confidence_score >= 85 ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' :
                        syncHealthSummary.confidence_score >= 60 ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20' :
                        'text-red-400 bg-red-500/10 border border-red-500/20'
                      }`}>
                        {syncHealthSummary.status}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-white mt-3">Sync Confidence</h3>
                  {syncHealthSummary ? (
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-xs text-zinc-400 font-mono">
                        <span>Confidence Score</span>
                        <span className={`font-bold ${
                          syncHealthSummary.confidence_score >= 85 ? 'text-emerald-400' :
                          syncHealthSummary.confidence_score >= 60 ? 'text-amber-400' : 'text-red-400'
                        }`}>{syncHealthSummary.confidence_score}%</span>
                      </div>
                      <div className="w-full bg-zinc-800/80 h-2 rounded-full overflow-hidden border border-zinc-700/30">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            syncHealthSummary.confidence_score >= 85 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' :
                            syncHealthSummary.confidence_score >= 60 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                            'bg-gradient-to-r from-red-500 to-orange-400'
                          }`}
                          style={{ width: `${syncHealthSummary.confidence_score}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/30">
                        <span>Efficiency Ratio (KPI)</span>
                        <span className="font-bold text-blue-400">{Math.round(syncHealthSummary.efficiency_score * 100)}%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-xs text-zinc-500 font-mono">Loading telemetry...</div>
                  )}
                </div>
                
                {syncHealthSummary ? (
                  <div className="pt-3 border-t border-zinc-800/60 mt-4 flex justify-between text-[10px] text-zinc-500 font-mono">
                    <span>Backlog: {syncHealthSummary.backlog} reqs</span>
                    <span>Failures (24h): {syncHealthSummary.failures_24h}</span>
                  </div>
                ) : null}
              </div>

            </div>

            {/* Grid for detailed management */}
            <div className="grid lg:grid-cols-3 gap-8">
              
              {/* Terminals list & creation (2/3 width) */}
              <div id="cashier-counters-section" className="lg:col-span-2 space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    Cashier Counters
                    <Tooltip text="Create and configure cashier counter device IDs. Edit permissions or allow debugging. Click to learn more." onClick={() => navigateToHelp('help-terminals')} />
                  </h2>
                </div>

                <form onSubmit={handleAddTerminalClick} className="flex gap-2.5 bg-zinc-900/40 p-2.5 border border-zinc-800/80 rounded-2xl">
                  <input 
                    type="text" 
                    required 
                    placeholder="Counter name (e.g. Counter 1, Shop Front)" 
                    className="input-field border-transparent bg-transparent focus:ring-0 focus:border-transparent flex-1 py-2" 
                    value={newTerminalName} 
                    onChange={e => setNewTerminalName(e.target.value)} 
                  />
                  <button type="submit" className="btn btn-success px-5 py-2.5 text-sm flex items-center gap-1">
                    <Plus size={16} /> Create
                  </button>
                </form>

                <div className="grid sm:grid-cols-2 gap-4">
                  {terminals.map(term => {
                    const isExpired = term.pairing_code_expires_at ? new Date(term.pairing_code_expires_at).getTime() < now : true;
                    const minutesLeft = term.pairing_code_expires_at ? Math.max(0, Math.floor((new Date(term.pairing_code_expires_at).getTime() - now) / 60000)) : 0;
                    const secondsLeft = term.pairing_code_expires_at ? Math.max(0, Math.floor(((new Date(term.pairing_code_expires_at).getTime() - now) % 60000) / 1000)) : 0;

                    return (
                      <div key={term.id} className="bg-zinc-900/35 border border-zinc-850 hover:border-zinc-800 hover:shadow-xl hover:shadow-emerald-500/[0.01] rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all duration-300 group">
                        
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-zinc-800/60 border border-zinc-700/30 flex items-center justify-center text-zinc-400 group-hover:text-emerald-400 transition-colors">
                              <MonitorSmartphone size={16} />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white leading-tight">{term.terminal_name}</h4>
                              <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                ID: ...{term.hardware_id ? term.hardware_id.slice(-8) : 'Unpaired'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => editTerminal(term)} className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors rounded-md hover:bg-white/5" title="Edit Terminal"><Edit size={14}/></button>
                            <button onClick={() => setDeleteConfirm({isOpen: true, type: 'terminal', id: term.id, name: term.name})} className="p-1 text-red-500/60 hover:text-red-400 transition-colors rounded-md hover:bg-red-500/5" title="Delete Terminal"><Trash2 size={14}/></button>
                          </div>
                        </div>

                        {term.pairing_code && !isExpired ? (
                          <div className="bg-zinc-950/40 p-4 rounded-xl border border-yellow-500/20 flex justify-between items-center">
                            <div>
                              <div className="text-[9px] font-bold text-yellow-500 uppercase tracking-widest mb-0.5">Pairing Code</div>
                              <div className="text-2xl font-mono text-yellow-400 tracking-wider font-extrabold">{term.pairing_code}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5">Expires</div>
                              <div className="text-xs font-mono text-yellow-300 bg-yellow-950/60 border border-yellow-500/20 px-2 py-0.5 rounded">
                                {minutesLeft}:{secondsLeft.toString().padStart(2, '0')}
                              </div>
                            </div>
                          </div>
                        ) : term.pairing_code && isExpired ? (
                          <div className="bg-red-950/20 p-3 rounded-xl border border-red-500/20 flex flex-col gap-2">
                            <span className="text-red-400 text-xs font-medium">Pairing Code Expired</span>
                            <button onClick={() => regeneratePairingCode(term.id)} className="w-full text-center text-xs py-1.5 border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500 hover:text-black rounded-lg transition-all font-semibold">Regenerate Code</button>
                          </div>
                        ) : (
                          <div className="space-y-3.5">
                            
                            {/* Device connected status indicator */}
                            <div className="flex justify-between items-center bg-emerald-950/10 px-3.5 py-2.5 rounded-xl border border-emerald-500/20">
                              <span className="flex items-center gap-2 text-xs text-emerald-400 font-semibold uppercase tracking-wider">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                                Connected
                              </span>
                              <button onClick={() => copyToClipboard(term.hardware_id)} className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 font-mono uppercase bg-zinc-800/40 border border-zinc-700/30 px-2 py-0.5 rounded" title="Copy Hardware ID">
                                Copy ID <Copy size={10} />
                              </button>
                            </div>

                            <button type="button" onClick={() => regeneratePairingCode(term.id)} className="w-full border border-yellow-500/30 hover:border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black py-2.5 text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all font-semibold shadow-sm">
                              <RefreshCw size={12} /> Reconnect / Pair Device
                            </button>

                            {terminals.filter(t => t.id !== term.id && !t.pairing_code).length > 0 && (
                              <div className="text-[10px] text-zinc-600 text-center py-1">
                                Use <button onClick={() => setActiveTab('credential-sync')} className="text-emerald-500 hover:underline">Credential Sync</button> to copy credentials to this terminal.
                              </div>
                            )}

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
                                    <div className="text-[8px] text-zinc-500 uppercase tracking-widest">OTC Code</div>
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
                                <p className="text-[9px] text-zinc-500 text-center mt-0.5 leading-normal">
                                  Credentials are never sent during debugging
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {terminals.length === 0 && (
                    <div className="col-span-2 text-center py-10 bg-zinc-900/10 border border-zinc-800/40 rounded-2xl">
                      <p className="text-sm text-zinc-500">No cashier counters configured.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bank accounts management list (1/3 width) */}
              <div className="space-y-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  Linked Accounts
                  <Tooltip text="Link bank accounts here. The cashier counters use these to scan bank transaction statements dynamically." onClick={() => navigateToHelp('help-banks')} />
                </h2>

                <form onSubmit={createBankAccount} className="bg-zinc-900/30 border border-zinc-850 p-5 rounded-2xl space-y-4 shadow-xl">
                  <div className="space-y-3.5">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Select Bank</label>
                      <select className="input-field text-sm" value={bankName} onChange={e => setBankName(e.target.value)}>
                        <option value="BML">Bank of Maldives (BML)</option>
                        <option value="MIB">Maldives Islamic Bank (MIB)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Account Holder Name</label>
                      <input type="text" required placeholder="Name on account" className="input-field text-sm" value={accountName} onChange={e => setAccountName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Account Number</label>
                      <input type="text" required placeholder="Account number" className="input-field text-sm font-mono" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Label / Nickname</label>
                      <input type="text" placeholder="Counter 1, Main Vault..." className="input-field text-sm" value={accountLabel} onChange={e => setAccountLabel(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Currency</label>
                        <select className="input-field text-sm font-mono" value={currency} onChange={e => setCurrency(e.target.value)}>
                          <option value="MVR">MVR</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                      <div className="flex flex-col justify-end">
                        <button type="submit" className="btn btn-success w-full py-3 text-xs flex justify-center items-center gap-1.5 font-bold shadow-md">
                          <Plus size={14}/> Add Account
                        </button>
                      </div>
                    </div>
                  </div>

                  {bankName === 'MIB' && (
                    <div className="bg-emerald-950/20 border border-emerald-500/25 p-3 rounded-xl space-y-2">
                      <label className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block">MIB Profile Type</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setMibProfileType('0')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${mibProfileType === '0' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-emerald-500/40'}`}>
                          Personal
                        </button>
                        <button type="button" onClick={() => setMibProfileType('1')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${mibProfileType === '1' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-emerald-500/40'}`}>
                          Business
                        </button>
                      </div>
                    </div>
                  )}

                  {bankName === 'BML' && (
                    <div className="bg-rose-950/20 border border-rose-500/25 p-3 rounded-xl space-y-2">
                      <label className="text-[9px] font-bold text-rose-400 uppercase tracking-widest block">BML Profile Type</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setBmlProfileType('0')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${bmlProfileType === '0' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-rose-500/40'}`}>
                          Personal
                        </button>
                        <button type="button" onClick={() => setBmlProfileType('1')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${bmlProfileType === '1' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-transparent border-zinc-800 text-zinc-400 hover:border-rose-500/40'}`}>
                          Business
                        </button>
                      </div>
                    </div>
                  )}
                </form>

                <div className="space-y-3">
                  {bankAccounts.map(acc => (
                    <div key={acc.id} className="bg-zinc-900/35 border border-zinc-850 hover:border-zinc-800 rounded-xl p-4 flex justify-between items-center transition-all duration-300">
                      <div className="flex gap-3 items-center min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center p-1 border border-zinc-800 shrink-0">
                          <img 
                            src={acc.bank_name === 'BML' ? '/logo_bml.png' : '/logo_mib.png'} 
                            alt={acc.bank_name} 
                            className="w-full h-full object-contain" 
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-white flex items-center gap-1.5 truncate">
                            <span className="truncate">{acc.label ? acc.label : (acc.bank_name === 'BML' ? 'BML Account' : 'MIB Account')}</span>
                            {(acc.login_failures || 0) >= 2 ? (
                              <span className="text-[8px] font-extrabold text-red-400 bg-red-950/40 border border-red-500/30 px-1.5 py-0.5 rounded uppercase font-sans shrink-0">
                                Locked
                              </span>
                            ) : (acc.login_failures || 0) > 0 ? (
                              <span className="text-[8px] font-extrabold text-yellow-500 bg-yellow-950/40 border border-yellow-500/30 px-1.5 py-0.5 rounded uppercase font-sans shrink-0">
                                {acc.login_failures} Fail
                              </span>
                            ) : (
                              <span className="text-[8px] font-extrabold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-1.5 py-0.5 rounded uppercase font-sans shrink-0">
                                Secure
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">{acc.account_name}</div>
                          <div className="font-mono text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
                            <span>{acc.account_number}</span>
                            <span className="text-[8px] bg-zinc-800 border border-zinc-700 px-1 rounded font-bold font-mono text-zinc-300">
                              {acc.currency || 'MVR'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(acc.login_failures || 0) > 0 && (
                          <button 
                            type="button"
                            onClick={() => resetBankAccountFailures(acc.id)} 
                            className="text-[9px] font-bold px-2.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 transition-all"
                          >
                            Reset
                          </button>
                        )}
                        <button onClick={() => setDeleteConfirm({isOpen: true, type: 'account', id: acc.id, name: `${acc.bank_name} - ${acc.account_name} (${acc.account_number})`})} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/5 rounded-lg transition-colors"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))}
                  {bankAccounts.length === 0 && (
                    <div className="text-center py-8 bg-zinc-900/10 border border-zinc-800/40 rounded-xl">
                      <p className="text-xs text-zinc-500">No bank accounts linked.</p>
                    </div>
                  )}
                </div>

              </div>

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
        {activeTab === 'activity' && (
          <div className="glass-panel p-6 animate-fade-in overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Clock size={24} className="text-[var(--color-success)]" />
              Activity Logs (Last 30 Days)
            </h2>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-[var(--text-secondary)]">
                    <th className="py-3 px-4">Date / Time</th>
                    <th className="py-3 px-4">Event Type</th>
                    <th className="py-3 px-4">Terminal (Actor)</th>
                    <th className="py-3 px-4">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-zinc-500">No activity logs found.</td>
                    </tr>
                  ) : (
                    auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4 text-xs font-mono text-[var(--text-secondary)]">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className="bg-zinc-800 text-zinc-200 px-2 py-1 rounded text-xs font-medium uppercase tracking-wider">
                            {log.event_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-white">
                          {log.actor || 'System'}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-[var(--text-secondary)]">
                          {log.ip_address || 'N/A'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB: HELP CENTER --- */}
        {activeTab === 'help' && (
          <div className="glass-panel p-8 max-w-4xl animate-fade-in space-y-12 mb-12">
            <div className="border-b border-zinc-800 pb-6">
              <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                <Info size={32} className="text-[var(--color-success)]" />
                Viri Terminal — Setup Guide
              </h2>
              <p className="text-zinc-400 mt-4 text-sm leading-relaxed max-w-3xl">
                This guide walks through the full process of setting up a Viri terminal, from registering your company to handing a ready terminal to a cashier. 
                Steps 1–4 are completed by the admin in the dashboard. Steps 5–8 are completed on the terminal device itself, and should be done by the admin before handing off to an employee.
              </p>
            </div>

            <section id="help-setup-1" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm">1</div> Register your company</h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                Go to viri.thinksafe.mv and register your company. This creates your admin account and gives you access to the admin dashboard and panel. Within the admin dashboard, you get access to reports and activity logs of your terminals. Additionally, you can view plans and upgrades, along with the help center. A support number is also provided in case you need extra assistance.
              </p>
            </section>

            <section id="help-subscription" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm">2</div> Choose a subscription plan</h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                After registering, you'll automatically receive a live account (with limits) that allows you to test the full functionality of Viri. Once you're ready, select and pay for a subscription plan from the dashboard. Your plan determines how many terminals you can create, how many bank accounts can be linked, and which features are available.
              </p>
            </section>

            <section id="help-banks" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm">3</div> Add your bank accounts</h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                From the admin dashboard select your bank type (BML or MIB), then enter the name associated with the bank account, along with the account number. You may also assign a label (e.g., "Main Store" or "Shop 3") for easy identification. Choose the profile type — Business or Personal — that matches the account you're adding. You can add multiple accounts across both banks, depending on your subscription plan limits. Once added, these accounts become available in your terminals.
              </p>
            </section>

            <section id="help-terminals" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm">4</div> Configure and create a terminal</h3>
              <div className="text-zinc-300 leading-relaxed pl-8 space-y-4">
                <p>In the dashboard, create a new terminal. During creation, you will configure two things:</p>
                <ol className="list-decimal pl-5 space-y-3">
                  <li id="help-pin">
                    <strong>Settings PIN</strong> — Optionally set a 6-digit PIN. This would be required to be granted entry on the terminal's settings.
                  </li>
                  <li>
                    <strong>Terminal Tools & Permissions</strong> — choose which tools are available on this terminal. The options are:
                    <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-zinc-400">
                      <li><strong className="text-zinc-300">Verification Panel</strong> — always enabled on every terminal. This is the core payment verification screen and cannot be turned off.</li>
                      <li><strong className="text-zinc-300">Transaction Ledger</strong> — optional. When enabled, the terminal can view the transaction history for linked accounts. Enabling this reveals two additional options:
                        <ul className="list-disc pl-5 mt-1">
                          <li><strong>Show Account Balance</strong> — displays the current balance for each account in the ledger.</li>
                          <li><strong>Show Outward Transactions (Debit)</strong> — includes debit/outward transactions in the ledger view. If left off, only inward transactions are shown.</li>
                        </ul>
                      </li>
                      <li><strong className="text-zinc-300">Reports</strong> — optional. Enabling this adds the Reports section to the terminal. (Coming soon — no report content is available yet.)</li>
                    </ul>
                  </li>
                </ol>
                <p>Once configured, click <strong>Create Terminal</strong>. This generates a temporary pairing code for the terminal.</p>
                <p className="text-sm italic text-zinc-400">Already created a terminal and need to change its tools? You can edit these settings at any time from the terminal's entry in the dashboard. Changes take effect on the terminal immediately.</p>
              </div>
            </section>

            <section id="help-setup-5" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm">5</div> Open the terminal on the device</h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                On the device the terminal will be used on, open a browser and go to <strong>viri.thinksafe.mv/cashier</strong>. When prompted, enter the pairing code generated in Step 4. This links the device to your terminal configuration and opens the terminal interface.
              </p>
            </section>

            <section id="help-setup-6" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm">6</div> Install Viri Bridge</h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                On the terminal screen, tap the Help button. This opens a menu with a download link for the Viri Bridge browser extension — this is what connects the terminal to your bank and retrieves live data. Detailed installation and setup instructions are available within that same menu.
              </p>
            </section>

            <section id="help-setup-7" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm">7</div> Set a terminal PIN</h3>
              <p className="text-zinc-300 leading-relaxed pl-8">
                Next to the Help button, open Settings and set a PIN code. This PIN can be used to lock the terminal when it is left unattended, preventing unauthorised access.
              </p>
            </section>

            <section id="help-setup-8" className="space-y-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 rounded bg-[var(--color-success)] text-black flex items-center justify-center text-sm">8</div> Enter bank credentials</h3>
              <div className="text-zinc-300 leading-relaxed pl-8 space-y-4">
                <p>For each bank account linked to this terminal, you will need to enter the account's login credentials: username, password, and OTP seed.</p>
                <p>The <strong>OTP seed</strong> is a one-time setup step that allows Viri Bridge to generate login verification codes automatically. It is stored locally on this device only.</p>
                <div className="bg-blue-900/20 border border-blue-900/50 p-4 rounded-lg">
                  <strong>Getting your OTP seed:</strong> Retrieving the seed requires a short process in your bank's internet or mobile banking app. If you have not done this before, refer to the <strong><a href="#help-auth-guide" className="text-blue-400 hover:underline" onClick={(e) => { e.preventDefault(); navigateToHelp('help-auth-guide'); }}>Authenticator Seed Setup Guide</a></strong> below for step-by-step instructions for both BML and MIB, including what to do if you already have an authenticator app connected to your account.
                </div>
                <p className="italic text-sm text-zinc-400">This step should be completed by the admin before the terminal is handed to a cashier.</p>
              </div>
            </section>

            <div className="pt-6 border-t border-zinc-800 text-center">
              <h3 className="text-2xl font-bold text-[var(--color-success)] mb-2">Setup complete</h3>
              <p className="text-zinc-400">Once credentials are entered, the terminal is ready for use. The cashier will see only the tools that were configured in Step 4.</p>
            </div>

            <div className="mt-16 pt-12 border-t-4 border-zinc-800">
              <h2 id="help-auth-guide" className="text-3xl font-bold text-white mb-6">Viri Bridge — Authenticator Seed Setup Guide</h2>
              
              <div className="bg-zinc-900 border border-zinc-700 p-5 rounded-lg mb-8">
                <h3 className="text-lg font-bold text-white mb-2">What you're doing and why</h3>
                <p className="text-sm text-zinc-300">
                  Viri needs your bank's TOTP (one-time password) seed to generate login codes on your behalf on this device. This seed is the same text key that appears when you set up an authenticator app like Google Authenticator. It never leaves this device.<br/><br/>
                  You will need to go through your bank's authenticator setup process to reach the screen that shows this key. If you already have an authenticator app connected to your bank account, you will need to reset it first — this disconnects your existing app, so you will need to re-link it after completing this process.
                </p>
              </div>

              <div className="space-y-10">
                {/* BML Guide */}
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-red-500 border-b border-zinc-800 pb-2">Bank of Maldives (BML)</h3>
                  <p className="text-sm text-zinc-400">For visual reference, BML's official setup guide is available as a step-by-step PDF and on their authenticator info page.</p>
                  
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-white">Scenario A — Fresh setup (no authenticator previously enabled)</h4>
                    
                    <div className="bg-zinc-900/50 p-4 rounded-lg">
                      <h5 className="font-bold text-zinc-300 mb-2 text-sm uppercase tracking-wider">Via Internet Banking:</h5>
                      <ol className="list-decimal pl-5 space-y-2 text-sm text-zinc-300">
                        <li>Log in to BML Internet Banking at bankofmaldives.com.mv/internetbanking</li>
                        <li>Go to <strong>Settings</strong></li>
                        <li>Scroll down and click <strong>Setup Authenticator</strong></li>
                        <li>Enter your debit card details — select your card from the dropdown, then enter the expiry date and security code</li>
                        <li>Click <strong>Authorize</strong></li>
                        <li>A QR code will appear on screen. <em>Do not scan it yet.</em> Instead, click <strong>Can't scan QR?</strong> below the QR code</li>
                        <li>A text key (a long string of letters and numbers) will be revealed. <strong>This is your seed.</strong> Copy it exactly and paste it into the Viri setup screen</li>
                        <li>Open your authenticator app, add the account manually using that same key, and generate a 6-digit code</li>
                        <li>Enter that 6-digit code on the BML screen to confirm and activate</li>
                      </ol>
                    </div>

                    <div className="bg-zinc-900/50 p-4 rounded-lg">
                      <h5 className="font-bold text-zinc-300 mb-2 text-sm uppercase tracking-wider">Via Mobile Banking App:</h5>
                      <ol className="list-decimal pl-5 space-y-2 text-sm text-zinc-300">
                        <li>Log in to the BML Mobile Banking app</li>
                        <li>Tap <strong>More</strong> at the bottom navigation</li>
                        <li>Go to <strong>Applications → Authenticator Setup</strong></li>
                        <li>Scroll down and tap <strong>Set-up Authenticator</strong></li>
                        <li>Enter your debit card details (card, expiry, CVC) and tap <strong>Authorize</strong></li>
                        <li>On the QR code screen, tap the QR link option and then choose <strong>Enter code manually</strong> — this reveals the text seed</li>
                        <li>Copy that seed and paste it into the Viri setup screen</li>
                        <li>In your authenticator app, add the account using the same key and enter the generated 6-digit code back into the BML app to confirm</li>
                      </ol>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-white">Scenario B — Authenticator already enabled (reset required)</h4>
                    <p className="text-sm text-zinc-400">You will need to reset your existing authenticator link before a new seed can be issued. Resetting permanently disconnects your current authenticator app from BML.</p>
                    <div className="bg-zinc-900/50 p-4 rounded-lg">
                      <ol className="list-decimal pl-5 space-y-2 text-sm text-zinc-300">
                        <li>Log in to BML Internet Banking or the Mobile Banking app</li>
                        <li>Navigate to the same authenticator settings screen (Settings → Authenticator on internet banking, or More → Applications → Authenticator Setup on mobile)</li>
                        <li>Look for a <strong>Reset or Remove Authenticator</strong> option and confirm the reset — you may need to verify using your current method (SMS or existing authenticator code)</li>
                        <li>Once reset, follow all steps in Scenario A above from step 3 onwards to complete a fresh setup and retrieve your new seed</li>
                      </ol>
                    </div>
                    <p className="text-xs text-zinc-500 italic">If you cannot locate the reset option, contact BML customer support at 1600 or visit your nearest branch. Their authenticator info page also has further guidance.</p>
                  </div>
                </div>

                {/* MIB Guide */}
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-emerald-500 border-b border-zinc-800 pb-2">Maldives Islamic Bank (MIB)</h3>
                  <p className="text-sm text-zinc-400">For visual reference, MIB's official authenticator setup guide is available at mib.com.mv/authenticator-set-up-guide, including a video walkthrough.</p>
                  
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-white">Scenario A — Fresh setup (no authenticator previously enabled)</h4>
                    <p className="text-sm text-zinc-400">MIB's authenticator is managed through their internet banking platform, faisanet.</p>
                    <div className="bg-zinc-900/50 p-4 rounded-lg">
                      <ol className="list-decimal pl-5 space-y-2 text-sm text-zinc-300">
                        <li>Open a browser and log in to faisanet at faisanet.mib.com.mv</li>
                        <li>Once logged in, go to the menu and select <strong>Personal Profile</strong></li>
                        <li>In your profile settings, select <strong>Set Authenticator</strong></li>
                        <li>A prompt will ask you to re-enter your password. Enter it and press Submit</li>
                        <li>You will be asked to enter your card details. <em>If you do not have an MIB card, use the chat function within faisanet or the faisamobilex app to request that MIB set up the authenticator for you</em></li>
                        <li>After card verification, a QR code will appear. Look for the option to <strong>enter the code manually</strong> instead of scanning</li>
                        <li>Copy the text key that is shown. <strong>This is your seed.</strong> Paste it into the Viri setup screen</li>
                        <li>In your authenticator app, add the account using that key and generate a 6-digit OTP</li>
                        <li>Enter that OTP on the faisanet screen to validate and complete setup</li>
                        <li>Lastly, in your settings, select <strong>Authenticator Mobile App</strong> as your default 2FA verification method under "Select your preferred channel to receive OTP"</li>
                      </ol>
                    </div>
                    <p className="text-xs text-zinc-500 italic">MIB supports all standard TOTP apps including Google Authenticator, Microsoft Authenticator, and Authy.</p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-white">Scenario B — Authenticator already enabled (reset required)</h4>
                    <div className="bg-zinc-900/50 p-4 rounded-lg">
                      <ol className="list-decimal pl-5 space-y-2 text-sm text-zinc-300">
                        <li>Log in to faisanet</li>
                        <li>Go to Personal Profile → Set Authenticator</li>
                        <li>If a reset or reconfigure option is available, select it. You will likely be asked to verify using your current SMS OTP before the reset is allowed</li>
                        <li>Once the existing authenticator is cleared, follow all steps in Scenario A above to complete fresh setup and retrieve your new seed</li>
                      </ol>
                    </div>
                    <p className="text-xs text-zinc-500 italic">If you do not see a reset option, contact MIB customer support via the in-app chat, call 1400, or visit a branch. The official MIB setup guide may also have updated instructions.</p>
                  </div>
                </div>

                <div className="bg-yellow-900/20 border border-yellow-700/50 p-5 rounded-lg mt-8">
                  <h4 className="text-yellow-500 font-bold mb-2 flex items-center gap-2"><Shield size={18} /> A note for admins</h4>
                  <p className="text-sm text-zinc-300">
                    This step should be completed by the account owner (typically the business admin) before handing the terminal over to a cashier. The seed is stored locally on this device only and is required for Viri to generate login OTPs automatically. <strong>Keep this process confidential and do not share the seed with anyone outside of this setup flow.</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: BILLING & PAYMENTS --- */}
        {activeTab === 'billing' && (
          <div className="space-y-8 animate-fade-in text-left">
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
                    Here are the active features and limits allocated to your business account under your current subscription tier.
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
                  <button onClick={() => setActiveTab('plans')} className="btn btn-outline border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-xs w-full py-2.5 justify-center font-bold">
                    View Pricing Plans & Limits
                  </button>
                </div>
              </div>

              {/* Submit Payment Receipt Form */}
              <div className="glass-panel p-6 border border-zinc-800 bg-black/20 rounded-2xl shadow-xl">
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
                    <label className="input-label">Bank Reference Number</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter bank transaction reference ID"
                      className="input-field"
                      value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Upload Slip Image (PNG/JPEG)</label>
                    <input
                      id="receipt_slip_file"
                      type="file"
                      accept="image/png, image/jpeg"
                      required
                      className="input-field py-1.5"
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) {
                          setPaymentSlip(e.target.files[0]);
                        }
                      }}
                    />
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
                        <th className="pb-3">Reference Number</th>
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
                          <td className="py-3 font-mono text-zinc-300">{p.reference_number}</td>
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

        {/* --- TAB: PLANS --- */}
        {activeTab === 'plans' && (
          <div className="flex flex-col gap-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Available Subscription Plans</h2>
              <p className="text-[var(--text-secondary)]">Choose the plan that best fits your business needs.</p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Free Plan */}
              <div className="glass-panel p-8 border-t-4 border-t-zinc-500 flex flex-col">
                <h3 className="text-xl font-bold text-zinc-300">Free Tier</h3>
                <div className="text-3xl font-bold my-4">MVR 0 <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> 20 verifications / month</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> 1 Cashier Terminal</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> 2 Bank Accounts</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> Standard Support</li>
                </ul>
                <button disabled={user?.tenant?.subscription_tier === 'free'} className="btn w-full bg-zinc-800 disabled:opacity-50">
                  {user?.tenant?.subscription_tier === 'free' ? 'Current Plan' : 'Downgrade'}
                </button>
              </div>

              {/* Starter Plan */}
              <div className="glass-panel p-8 border-t-4 border-t-emerald-500 relative flex flex-col shadow-2xl shadow-emerald-900/10">
                <h3 className="text-xl font-bold text-emerald-400">Starter</h3>
                <div className="text-3xl font-bold my-4">MVR 499 <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> 300 verifications / month</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> 1 Cashier Terminal</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> 2 Bank Accounts</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> Standard Support</li>
                </ul>
                <button disabled={user?.tenant?.subscription_tier === '499'} className="btn btn-success w-full disabled:opacity-50 disabled:bg-emerald-900">
                  {user?.tenant?.subscription_tier === '499' ? 'Current Plan' : 'Upgrade'}
                </button>
              </div>

              {/* Growth Plan */}
              <div className="glass-panel p-8 border-t-4 border-t-purple-500 flex flex-col">
                <h3 className="text-xl font-bold text-purple-400">Growth</h3>
                <div className="text-3xl font-bold my-4">MVR 999 <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-purple-500" /> Unlimited verifications</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-purple-500" /> 1 Cashier Terminal, additional CT at 499/-</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-purple-500" /> 4 Bank Accounts</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-purple-500" /> Priority Support</li>
                </ul>
                <button disabled={user?.tenant?.subscription_tier === '999'} className="btn bg-purple-600 hover:bg-purple-500 text-white w-full disabled:opacity-50">
                  {user?.tenant?.subscription_tier === '999' ? 'Current Plan' : 'Upgrade'}
                </button>
              </div>

              {/* Enterprise Plan */}
              <div className="glass-panel p-8 border-t-4 border-t-blue-500 flex flex-col">
                <h3 className="text-xl font-bold text-blue-400">Enterprise</h3>
                <div className="text-3xl font-bold my-4">MVR 1999 <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-blue-500" /> Unlimited verifications</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-blue-500" /> 2 Cashier Terminals, additional CT at 399/-</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-blue-500" /> 20 Bank Accounts</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-blue-500" /> 24/7 Dedicated Support</li>
                </ul>
                <button disabled={user?.tenant?.subscription_tier === '1999'} className="btn bg-blue-600 hover:bg-blue-500 text-white w-full disabled:opacity-50">
                  {user?.tenant?.subscription_tier === '1999' ? 'Current Plan' : 'Upgrade'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: SUPPORT --- */}
        {activeTab === 'support' && (
          <div className="glass-panel p-8 max-w-2xl mx-auto text-center mt-12">
            <LifeBuoy size={64} className="mx-auto text-[var(--color-success)] mb-6" />
            <h2 className="text-3xl font-bold mb-4">Need Help?</h2>
            <p className="text-[var(--text-secondary)] mb-8 text-lg">
              Our support team is available to assist you with any questions or technical issues you might face while using Viri.
            </p>
            <div className="bg-[var(--bg-canvas)] p-6 rounded-lg border border-[var(--border-color)] inline-block">
              <div className="text-sm text-[var(--text-secondary)] mb-1">Call our support hotline:</div>
              <a href="tel:7793811" className="text-4xl font-extrabold text-white hover:text-[var(--color-success)] transition-colors">
                779-3811
              </a>
            </div>
          </div>
        )}

        {/* --- TAB: CREDENTIAL SYNC --- */}
        {activeTab === 'credential-sync' && (() => {
          const pairedTerminals = terminals.filter(t => !t.pairing_code && t.status === 'active');
          const mins = String(Math.floor(credSyncSecondsLeft / 60)).padStart(2, '0');
          const secs = String(credSyncSecondsLeft % 60).padStart(2, '0');
          return (
            <div className="glass-panel p-8 max-w-2xl animate-fade-in">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-900/50 border border-emerald-600/30 flex items-center justify-center">
                  <KeyRound size={18} className="text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Credential Sync</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Securely copy bank credentials from one terminal to another using AES-256 encryption.</p>
                </div>
              </div>

              {/* Security note */}
              <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-xl p-4 text-xs text-emerald-300 space-y-1.5 mb-6">
                <div className="flex gap-2"><span>🔐</span><span>Credentials are encrypted on the source terminal before leaving the device</span></div>
                <div className="flex gap-2"><span>🗑️</span><span>The encrypted package is permanently deleted from Viri servers after import</span></div>
                <div className="flex gap-2"><span>👤</span><span>The target cashier must actively press "Import Credentials" to accept the transfer</span></div>
              </div>

              {/* IDLE STATE: select terminals */}
              {credSync.state === 'idle' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="input-group">
                      <label className="input-label flex items-center gap-1.5"><MonitorSmartphone size={13} /> Source Terminal <span className="text-zinc-500">(has credentials)</span></label>
                      <select
                        className="input-field w-full"
                        value={credSync.sourceTerminalId}
                        onChange={e => setCredSync(prev => ({ ...prev, sourceTerminalId: e.target.value, targetTerminalId: prev.targetTerminalId === e.target.value ? '' : prev.targetTerminalId }))}
                      >
                        <option value="">Select source terminal...</option>
                        {pairedTerminals.map(t => (
                          <option key={t.id} value={t.id.toString()}>{t.terminal_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="input-group">
                      <label className="input-label flex items-center gap-1.5"><MonitorSmartphone size={13} /> Target Terminal <span className="text-zinc-500">(needs credentials)</span></label>
                      <select
                        className="input-field w-full"
                        value={credSync.targetTerminalId}
                        onChange={e => setCredSync(prev => ({ ...prev, targetTerminalId: e.target.value }))}
                      >
                        <option value="">Select target terminal...</option>
                        {pairedTerminals.filter(t => t.id.toString() !== credSync.sourceTerminalId).map(t => (
                          <option key={t.id} value={t.id.toString()}>{t.terminal_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {pairedTerminals.length < 2 && (
                    <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-700/30 rounded-lg p-3">
                      ⚠️ You need at least 2 active paired terminals to use Credential Sync.
                    </p>
                  )}
                  <button
                    onClick={startCredSync}
                    disabled={!credSync.sourceTerminalId || !credSync.targetTerminalId || credSync.sourceTerminalId === credSync.targetTerminalId}
                    className="btn btn-success w-full py-3 flex items-center justify-center gap-2 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Start Sync <ArrowRight size={16} />
                  </button>
                </div>
              )}

              {/* SYNCING STATE: progress steps + countdown */}
              {credSync.state === 'syncing' && (() => {
                const srcTerm = pairedTerminals.find(t => t.id.toString() === credSync.sourceTerminalId);
                const tgtTerm = pairedTerminals.find(t => t.id.toString() === credSync.targetTerminalId);
                return (
                  <div className="space-y-6">
                    {/* Countdown */}
                    <div className="flex items-center justify-between bg-black/30 border border-zinc-800 rounded-xl px-4 py-3">
                      <span className="text-xs text-zinc-400">Session expires in</span>
                      <span className={`font-mono font-bold text-lg ${credSyncSecondsLeft < 60 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>{mins}:{secs}</span>
                    </div>

                    {/* Steps */}
                    <div className="space-y-3">
                      {/* Step 1 */}
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/30">
                        <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-white">Sync initiated</p>
                          <p className="text-xs text-zinc-400">Source: <span className="text-white">{srcTerm?.terminal_name}</span> → Target: <span className="text-white">{tgtTerm?.terminal_name}</span></p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                        credSync.sourceReady
                          ? 'bg-emerald-950/20 border-emerald-800/30'
                          : 'bg-zinc-900/30 border-zinc-800'
                      }`}>
                        {credSync.sourceReady
                          ? <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                          : <Loader2 size={18} className="text-zinc-400 mt-0.5 shrink-0 animate-spin" />}
                        <div>
                          <p className="text-sm font-semibold text-white">Source terminal encrypting</p>
                          <p className="text-xs text-zinc-400">
                            {credSync.sourceReady
                              ? 'Credentials encrypted and uploaded — ready for import.'
                              : `Waiting for ${srcTerm?.terminal_name} to encrypt credentials in the background...`}
                          </p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                        !credSync.sourceReady ? 'opacity-40 bg-zinc-900/20 border-zinc-800/40' : 'bg-zinc-900/30 border-zinc-700'
                      }`}>
                        <Loader2 size={18} className="text-zinc-400 mt-0.5 shrink-0 animate-spin" />
                        <div>
                          <p className="text-sm font-semibold text-white">Waiting for target cashier</p>
                          <p className="text-xs text-zinc-400">
                            Tell the cashier at <span className="text-white">{tgtTerm?.terminal_name}</span> to open Settings and press <strong className="text-emerald-400">"Import Credentials"</strong>.
                          </p>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={cancelCredSync}
                      className="btn btn-outline border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white w-full py-2.5 text-sm"
                    >
                      Cancel Sync
                    </button>
                  </div>
                );
              })()}

              {/* DONE STATE */}
              {credSync.state === 'done' && (
                <div className="text-center space-y-5 py-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-900/50 border-2 border-emerald-500 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={32} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg">Sync Complete!</p>
                    <p className="text-zinc-400 text-sm mt-1">Credentials synchronized successfully.</p>
                    <p className="text-zinc-600 text-xs mt-2">The encrypted package and passphrase have been permanently deleted from Viri's servers.</p>
                  </div>
                  <button
                    onClick={() => setCredSync({ state: 'idle', syncId: null, sourceTerminalId: '', targetTerminalId: '', syncStartedAt: null, sourceReady: false, error: null })}
                    className="btn btn-success w-full py-3 font-semibold"
                  >
                    Start Another Sync
                  </button>
                </div>
              )}

              {/* ERROR STATE */}
              {credSync.state === 'error' && (
                <div className="text-center space-y-5 py-4">
                  <div className="w-14 h-14 rounded-full bg-red-950/50 border-2 border-red-500 flex items-center justify-center mx-auto">
                    <X size={28} className="text-red-400" />
                  </div>
                  <div>
                    <p className="text-red-300 font-semibold">Sync Failed</p>
                    <p className="text-zinc-400 text-sm mt-1">{credSync.error}</p>
                  </div>
                  <button
                    onClick={() => setCredSync({ state: 'idle', syncId: null, sourceTerminalId: '', targetTerminalId: '', syncStartedAt: null, sourceReady: false, error: null })}
                    className="btn btn-outline border-zinc-600 text-zinc-300 hover:bg-zinc-800 w-full py-2.5 font-semibold"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          );
        })()}


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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button 
              type="button"
              onClick={() => setIsTerminalModalOpen(false)} 
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-full hover:bg-white/5 transition-colors"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold text-white mb-6">
              {editingTerminal ? 'Edit Cashier Counter' : 'Configure Counter Permissions'}
            </h2>

            <form onSubmit={saveTerminal} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                  Counter Name
                </label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Counter 1" 
                  className="input-field w-full" 
                  value={terminalFormName} 
                  onChange={e => setTerminalFormName(e.target.value)} 
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                  Settings PIN (Optional)
                  <Tooltip text="A 6-digit PIN required on the PWA to edit settings or view sensitive information. Leave blank to disable. Click for more info." onClick={() => navigateToHelp('help-pin')} />
                </label>
                <input 
                  type="text" 
                  maxLength={6}
                  pattern="\d{0,6}"
                  placeholder="e.g. 123456" 
                  className="input-field w-full font-mono" 
                  value={terminalSettingsPin} 
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    setTerminalSettingsPin(val);
                  }} 
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                  PWA Lockout PIN / Password (Optional)
                  <Tooltip text="A 4-digit PIN to lock/unlock the cashier counter screen. Leave blank to disable or clear/unlock." />
                </label>
                <div className="flex gap-2">
                  <input 
                    type="password" 
                    maxLength={4}
                    pattern="\d{0,4}"
                    placeholder={editingTerminal?.permissions?.terminal_pin ? "PIN Set (Hidden)" : "e.g. 1234"} 
                    className="input-field flex-1 font-mono" 
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
                      className="btn btn-outline border-red-500 text-red-500 hover:bg-red-500 hover:text-white px-3 py-2 text-xs transition-colors shrink-0"
                    >
                      Reset PIN
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">
                  Terminal Tools & Permissions
                </h3>

                <div className="space-y-4 bg-black/30 p-4 rounded-lg border border-zinc-800">
                  {/* Verification Panel */}
                  <div className="flex items-start gap-3">
                    <input 
                      type="checkbox" 
                      id="perm-verification"
                      checked={permissionsForm.verification_enabled} 
                      disabled 
                      className="mt-1 rounded border-zinc-700 text-[var(--color-success)] focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
                    />
                    <div>
                      <label htmlFor="perm-verification" className="text-sm font-medium text-white flex items-center gap-1.5 cursor-not-allowed">
                        Verification Panel <span className="text-[10px] bg-[var(--color-success)]/15 text-[var(--color-success)] px-1.5 py-0.5 rounded font-mono">REQUIRED</span>
                      </label>
                      <p className="text-xs text-[var(--text-secondary)]">Allows cashier to verify incoming MVR bank transfer screenshots.</p>
                    </div>
                  </div>

                  {/* Transaction Ledger */}
                  <div className="flex items-start gap-3">
                    <input 
                      type="checkbox" 
                      id="perm-ledger"
                      checked={permissionsForm.ledger_enabled} 
                      disabled={user?.tenant?.subscription_tier === 'free' || user?.tenant?.subscription_tier === '499'}
                      onChange={e => setPermissionsForm(prev => ({ 
                        ...prev, 
                        ledger_enabled: e.target.checked,
                        ledger_show_balance: e.target.checked ? prev.ledger_show_balance : false,
                        ledger_show_debit: e.target.checked ? prev.ledger_show_debit : false
                      }))}
                      className="mt-1 rounded border-zinc-700 text-[var(--color-success)] focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
                    />
                    <div>
                      <label htmlFor="perm-ledger" className={`text-sm font-medium flex items-center gap-1.5 ${user?.tenant?.subscription_tier === 'free' || user?.tenant?.subscription_tier === '499' ? 'text-zinc-500 cursor-not-allowed' : 'text-white cursor-pointer'}`}>
                        Transaction Ledger
                      </label>
                      <p className="text-xs text-[var(--text-secondary)]">Allows cashier to view account transaction ledger/history.</p>
                    </div>
                  </div>

                  {/* Show Account Balance */}
                  <div className="flex items-start gap-3">
                    <input 
                      type="checkbox" 
                      id="perm-ledger-balance"
                      checked={permissionsForm.ledger_show_balance} 
                      disabled={user?.tenant?.subscription_tier === 'free' || user?.tenant?.subscription_tier === '499'}
                      onChange={e => setPermissionsForm(prev => ({ ...prev, ledger_show_balance: e.target.checked }))}
                      className="mt-1 rounded border-zinc-700 text-[var(--color-success)] focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
                    />
                    <div>
                      <label htmlFor="perm-ledger-balance" className={`text-sm font-medium flex items-center gap-1.5 ${user?.tenant?.subscription_tier === 'free' || user?.tenant?.subscription_tier === '499' ? 'text-zinc-500 cursor-not-allowed' : 'text-white cursor-pointer'}`}>
                        Show Account Balance
                      </label>
                      <p className="text-xs text-[var(--text-secondary)]">Expose real-time balance metrics for connected accounts.</p>
                    </div>
                  </div>

                  {/* Show Outward Transactions (DEBIT) */}
                  <div className="flex items-start gap-3">
                    <input 
                      type="checkbox" 
                      id="perm-ledger-debit"
                      checked={permissionsForm.ledger_show_debit} 
                      disabled={user?.tenant?.subscription_tier === 'free' || user?.tenant?.subscription_tier === '499'}
                      onChange={e => setPermissionsForm(prev => ({ ...prev, ledger_show_debit: e.target.checked }))}
                      className="mt-1 rounded border-zinc-700 text-[var(--color-success)] focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
                    />
                    <div>
                      <label htmlFor="perm-ledger-debit" className={`text-sm font-medium flex items-center gap-1.5 ${user?.tenant?.subscription_tier === 'free' || user?.tenant?.subscription_tier === '499' ? 'text-zinc-500 cursor-not-allowed' : 'text-white cursor-pointer'}`}>
                        Show Outward Transactions (DEBIT)
                      </label>
                      <p className="text-xs text-[var(--text-secondary)]">Display outward transfers and charges alongside credits.</p>
                    </div>
                  </div>

                  {/* Reports */}
                  <div className="flex items-start gap-3">
                    <input 
                      type="checkbox" 
                      id="perm-reports"
                      checked={permissionsForm.reports_enabled} 
                      onChange={e => setPermissionsForm(prev => ({ ...prev, reports_enabled: e.target.checked }))}
                      disabled={user?.tenant?.subscription_tier === 'free' || user?.tenant?.subscription_tier === '499'}
                      className="mt-1 rounded border-zinc-700 text-[var(--color-success)] focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
                    />
                    <div>
                      <label htmlFor="perm-reports" className={`text-sm font-medium flex items-center gap-1.5 ${user?.tenant?.subscription_tier === 'free' || user?.tenant?.subscription_tier === '499' ? 'text-zinc-500 cursor-not-allowed' : 'text-white cursor-pointer'}`}>
                        View Analytics & Reports
                      </label>
                      <p className="text-xs text-[var(--text-secondary)]">Allow access to historical charts and performance reports.</p>
                    </div>
                  </div>

                  {/* Share PWA Logs */}
                  <div className="flex items-start gap-3 mt-4 pt-4 border-t border-zinc-800">
                    <input 
                      type="checkbox" 
                      id="perm-share-logs"
                      checked={permissionsForm.share_pwa_logs} 
                      onChange={e => setPermissionsForm(prev => ({ ...prev, share_pwa_logs: e.target.checked }))}
                      className="mt-1 rounded border-zinc-700 text-[var(--color-success)] focus:ring-0 focus:ring-offset-0"
                    />
                    <div>
                      <label htmlFor="perm-share-logs" className="text-sm font-medium flex items-center gap-1.5 text-white cursor-pointer">
                        Share PWA Logs to Viri for Debug & Software Improvements
                      </label>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Automatically send terminal execution logs to the superadmin log. Sensitive info (passwords, authenticator seeds) is masked. If disabled, superadmin cannot debug unless temporarily granted access via the Terminals tab.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Starter Tier Locked Premium Card */}
              {(user?.tenant?.subscription_tier === 'free' || user?.tenant?.subscription_tier === '499') && (
                <div className="relative overflow-hidden bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1.5">
                      🔒 Feature Preview: Transaction Ledger
                    </h4>
                    <span className="text-[10px] bg-purple-500/10 border border-purple-500/30 text-purple-400 px-2 py-0.5 rounded font-medium">Growth / Enterprise</span>
                  </div>

                  <div className="blur-[2px] opacity-25 select-none pointer-events-none transition-all duration-300">
                    <div className="flex justify-between items-end border-b border-zinc-800 pb-2 mb-3">
                      <div>
                        <div className="text-[9px] text-zinc-400">Available Balance</div>
                        <div className="text-sm font-bold font-mono text-emerald-400">MVR 124,539.20</div>
                      </div>
                      <div className="text-[9px] text-zinc-500 font-mono">Last synced: Just now</div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] border-b border-zinc-900 pb-1.5">
                        <span className="text-zinc-300">Transfer from Ahmed Niyaz</span>
                        <span className="font-mono text-emerald-400 font-bold">+MVR 500.00</span>
                      </div>
                      <div className="flex justify-between text-[10px] border-b border-zinc-900 pb-1.5">
                        <span className="text-zinc-300">BML POS Terminal Charge</span>
                        <span className="font-mono text-red-400 font-bold">-MVR 45.00</span>
                      </div>
                      <div className="flex justify-between text-[10px] pb-0.5">
                        <span className="text-zinc-300">Transfer from Aminath Ali</span>
                        <span className="font-mono text-emerald-400 font-bold">+MVR 2,400.00</span>
                      </div>
                    </div>
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-zinc-950/80 flex flex-col items-center justify-center text-center p-6">
                    <div className="w-10 h-10 rounded-full bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2">
                      <Shield size={18} />
                    </div>
                    <p className="text-xs font-semibold text-zinc-200 max-w-sm mb-1">
                      Unlock full Cashier features in Growth & Enterprise plans!
                    </p>
                    <p className="text-[10px] text-zinc-400 max-w-sm">
                      Enable real-time bank statements, ledger views, debit filtering and live balance indicators right on the terminal counters.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-zinc-800 pt-5 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsTerminalModalOpen(false)} 
                  className="btn btn-outline border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white py-2 px-4 text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-success py-2 px-6 text-sm font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

