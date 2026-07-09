import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Terminal, X, Copy, Lock, Info, MonitorSmartphone, Shield, Trash2, Plus, Edit, Building2, Archive, Layers, ClipboardList, Settings, RefreshCw, CreditCard, CheckCircle2, Server, Database, Code, Zap, Activity } from 'lucide-react';

const Tooltip = ({ text }: { text: string }) => (
  <div className="relative inline-flex items-center group ml-1.5 cursor-help align-middle">
    <Info size={14} className="text-[var(--text-secondary)] hover:text-white transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-zinc-900 border border-zinc-700 text-white text-xs leading-relaxed rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 font-normal normal-case">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700"></div>
    </div>
  </div>
);

export default function AdminDashboard() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [securityPin] = useState(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  });

  const [selectedTerminal, setSelectedTerminal] = useState<any | null>(null);
  const [oneTimeCode, setOneTimeCode] = useState('');
  const [modalLogs, setModalLogs] = useState<any[] | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedRunIdx, setSelectedRunIdx] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<'companies' | 'archived' | 'tiers' | 'logs' | 'settings' | 'payments'>('companies');
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logRefreshCountdown, setLogRefreshCountdown] = useState<number | null>(null);
  const [logRefreshInterval, setLogRefreshInterval] = useState<number>(15);

  // Payments State
  const [payments, setPayments] = useState<any[]>([]);
  const pendingPaymentsCount = payments.filter((p: any) => p.status === 'pending').length;
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [approveTier, setApproveTier] = useState('499');
  const [approveExpiry, setApproveExpiry] = useState('');
  const [actionRemarks, setActionRemarks] = useState('');
  const [showSlipPreview, setShowSlipPreview] = useState<string | null>(null);

  // System Settings State
  const [systemSettings, setSystemSettings] = useState<any[]>([]);
  const [serverInfo, setServerInfo] = useState<any | null>(null);
  const [syncHealthSummary, setSyncHealthSummary] = useState<any | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  const fetchSystemSettings = async (showLoading = true) => {
    if (showLoading) setSettingsLoading(true);
    setSettingsError(null);
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch('/api/admin/system-settings', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to fetch system settings');
      const data = await res.json();
      setSystemSettings(data.settings);
      if (data.server_info) {
        setServerInfo(data.server_info);
      }
      if (data.sync_health_summary) {
        setSyncHealthSummary(data.sync_health_summary);
      }
    } catch (err: any) {
      if (showLoading) setSettingsError(err.message);
    } finally {
      if (showLoading) setSettingsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'settings') return;
    const intervalValue = parseInt(systemSettings.find(s => s.key === 'server_metrics_poll_interval')?.value || '60', 10);
    const pollInterval = setInterval(() => {
      fetchSystemSettings(false);
    }, intervalValue * 1000);
    
    return () => clearInterval(pollInterval);
  }, [activeTab, systemSettings]);

  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifySecurityPin()) return;
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSuccess(null);
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch('/api/admin/system-settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings: systemSettings })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to save system settings');
      }
      setSettingsSuccess('System settings saved successfully!');
      setTimeout(() => setSettingsSuccess(null), 5000);
    } catch (err: any) {
      setSettingsError(err.message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const fetchPayments = async () => {
    setPaymentsLoading(true);
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch('/api/admin/payments', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to fetch payments');
      const data = await res.json();
      setPayments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const handleApprovePayment = async () => {
    if (!verifySecurityPin()) return;
    if (!selectedPayment) return;
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch(`/api/admin/payments/${selectedPayment.id}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          subscription_tier: approveTier,
          license_expires_at: approveExpiry,
          remarks: actionRemarks
        })
      });
      if (res.ok) {
        alert("Payment approved and plan updated successfully!");
        setShowApprovalModal(false);
        setSelectedPayment(null);
        setActionRemarks('');
        fetchPayments();
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Failed to approve payment");
      }
    } catch (e) {
      alert("Network error approving payment");
    }
  };

  const handleRejectPayment = async () => {
    if (!verifySecurityPin()) return;
    if (!selectedPayment) return;
    if (!actionRemarks.trim()) {
      alert("Please provide rejection remarks");
      return;
    }
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch(`/api/admin/payments/${selectedPayment.id}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          remarks: actionRemarks
        })
      });
      if (res.ok) {
        alert("Payment rejected successfully!");
        setShowRejectionModal(false);
        setSelectedPayment(null);
        setActionRemarks('');
        fetchPayments();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Failed to reject payment");
      }
    } catch (e) {
      alert("Network error rejecting payment");
    }
  };

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchSystemSettings();
    } else if (activeTab === 'payments') {
      fetchPayments();
    }
  }, [activeTab]);

  const [filterEventType, setFilterEventType] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  
  const [activeTerminalsCount, setActiveTerminalsCount] = useState<number>(0);
  const [sessionHolders, setSessionHolders] = useState<any[]>([]);

  // Subscription Tiers State
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [planForm, setPlanForm] = useState({
    tier_key: '',
    name: '',
    price: 0,
    max_terminals: 1,
    max_bank_accounts: 1,
    lock_timeout: 20,
    features: {
      verification_enabled: true,
      ledger_enabled: false,
      ledger_show_balance: false,
      ledger_show_debit: false,
      reports_enabled: false
    }
  });

  // Buffer for date picker — keyed by company id
  const [pendingExpiry, setPendingExpiry] = useState<Record<number, string>>({});

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchSessionLogs(true);
    }
  }, [activeTab, logsPage, filterEventType, filterCompanyId]);

  useEffect(() => {
    if (activeTab !== 'logs') {
      setLogRefreshCountdown(null);
      return;
    }
    
    const intervalStr = systemSettings.find(s => s.key === 'session_log_poll_interval')?.value || '15';
    const intervalValue = parseInt(intervalStr, 10);
    setLogRefreshInterval(intervalValue);
    setLogRefreshCountdown(intervalValue);

    const timer = setInterval(() => {
      setLogRefreshCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          fetchSessionLogs(false);
          return intervalValue;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeTab, systemSettings, logsPage, filterEventType, filterCompanyId]);

  const fetchSessionLogs = async (showLoading: boolean = true) => {
    if (showLoading) setLogsLoading(true);
    try {
      const token = localStorage.getItem('viri_token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
      
      let url = `/api/admin/session-logs?page=${logsPage}&per_page=20`;
      if (filterEventType) url += `&event_type=${filterEventType}`;
      if (filterCompanyId) url += `&tenant_id=${filterCompanyId}`;

      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setSessionLogs(data.data || []);
        setLogsTotalPages(data.last_page || 1);
        if (data.active_terminals !== undefined) setActiveTerminalsCount(data.active_terminals);
        if (data.session_holders !== undefined) setSessionHolders(data.session_holders);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLogsLoading(false);
    }
  };

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
      
      if (userData.user.role !== 'superadmin') {
        throw new Error('Not an admin');
      }

      const compRes = await fetch('/api/admin/companies', { headers });
      setCompanies(await compRes.json());

      const plansRes = await fetch('/api/admin/subscription-plans', { headers });
      if (plansRes.ok) {
        setSubscriptionPlans(await plansRes.json());
      }

    } catch (err) {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (activeTab === 'companies' || activeTab === 'archived' || activeTab === 'tiers') {
      fetchData();
    } else if (activeTab === 'logs') {
      fetchSessionLogs(true);
    } else if (activeTab === 'settings') {
      fetchSystemSettings();
    } else if (activeTab === 'payments') {
      fetchPayments();
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

  const verifySecurityPin = (): boolean => {
    const userPin = window.prompt(`To confirm this action, please enter the 4-letter security PIN displayed at the top of the panel (${securityPin}):`);
    if (!userPin || userPin.toUpperCase() !== securityPin) {
      alert("Invalid or empty PIN. Action aborted.");
      return false;
    }
    return true;
  };

  const updateCompany = async (id: number, status: string, tier: string, lockTimeout?: number, maxTerminals?: number, licenseExpiresAt?: string | null, features?: any, maxBankAccounts?: number) => {
    if (!verifySecurityPin()) {
      fetchData();
      return;
    }

    const token = localStorage.getItem('viri_token');
    const payload: any = { status, subscription_tier: tier };
    if (lockTimeout !== undefined) {
      payload.lock_timeout = lockTimeout;
    }
    if (maxTerminals !== undefined) {
      payload.max_terminals = maxTerminals;
    }
    if (maxBankAccounts !== undefined) {
      payload.max_bank_accounts = maxBankAccounts;
    }
    if (licenseExpiresAt !== undefined) {
      payload.license_expires_at = licenseExpiresAt;
    }
    if (features !== undefined) {
      payload.features = features;
    }
    await fetch(`/api/admin/companies/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    fetchData();
  };

  const handleDeleteCompany = async (id: number, name: string) => {
    if (!verifySecurityPin()) return;
    if (!window.confirm(`Are you absolutely sure you want to permanently delete company "${name}" and all of its associated users, terminals, bank accounts, and logs? This cannot be undone.`)) {
      return;
    }

    const token = localStorage.getItem('viri_token');
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Company deleted successfully!");
        fetchData();
      } else {
        alert("Failed to delete company.");
      }
    } catch (e) {
      alert("Network error deleting company.");
    }
  };

  const handleResetUserPassword = async (userId: number, email: string) => {
    if (!verifySecurityPin()) return;
    const newPassword = window.prompt(`Enter new dashboard password for ${email} (minimum 8 characters):`);
    if (!newPassword) return;
    if (newPassword.length < 8) {
      alert("Password must be at least 8 characters long.");
      return;
    }

    const token = localStorage.getItem('viri_token');
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: newPassword })
      });
      if (res.ok) {
        alert("Password reset successfully!");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error || 'Failed to reset password'}`);
      }
    } catch (e) {
      alert("Network error occurred.");
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifySecurityPin()) return;

    const token = localStorage.getItem('viri_token');
    const method = editingPlan ? 'PUT' : 'POST';
    const url = editingPlan ? `/api/admin/subscription-plans/${editingPlan.id}` : '/api/admin/subscription-plans';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(planForm)
      });
      if (res.ok) {
        alert(editingPlan ? "Plan updated successfully!" : "Plan created successfully!");
        setEditingPlan(null);
        setPlanForm({
          tier_key: '',
          name: '',
          price: 0,
          max_terminals: 1,
          max_bank_accounts: 1,
          lock_timeout: 20,
          features: {
            verification_enabled: true,
            ledger_enabled: false,
            ledger_show_balance: false,
            ledger_show_debit: false,
            reports_enabled: false
          }
        });
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.message || 'Failed to save plan'}`);
      }
    } catch (e) {
      alert("Network error saving plan.");
    }
  };

  const handleDeletePlan = async (id: number) => {
    if (!verifySecurityPin()) return;
    if (!window.confirm("Are you sure you want to delete this subscription plan? Existing companies on this plan will not be automatically deleted but should be migrated to another plan.")) return;

    const token = localStorage.getItem('viri_token');
    try {
      const res = await fetch(`/api/admin/subscription-plans/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Plan deleted successfully!");
        fetchData();
      } else {
        alert("Failed to delete plan.");
      }
    } catch (e) {
      alert("Network error deleting plan.");
    }
  };

  const handleRunMigrations = async () => {
    if (!verifySecurityPin()) return;
    setMigrationRunning(true);
    const token = localStorage.getItem('viri_token');
    try {
      const res = await fetch('/api/admin/run-migrations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        alert("Migrations run successfully!\n\nOutput:\n" + data.output);
        fetchData();
      } else {
        alert("Failed to run migrations.");
      }
    } catch (e) {
      alert("Network error running migrations.");
    } finally {
      setMigrationRunning(false);
    }
  };

  const updateTerminalPermission = async (terminalId: number, showVbtl: boolean) => {
    if (!verifySecurityPin()) return;

    const token = localStorage.getItem('viri_token');
    try {
      const response = await fetch(`/api/admin/terminals/${terminalId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ show_vbtl: showVbtl })
      });
      if (response.ok) {
        fetchData();
      } else {
        alert("Failed to update terminal settings.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error updating terminal settings.");
    }
  };

  const openDebugLogModal = (terminal: any) => {
    setSelectedTerminal(terminal);
    setOneTimeCode('');
    setModalLogs(null);
    setModalError(null);
    setModalLoading(false);
    setSelectedRunIdx(0);
  };

  const closeDebugLogModal = () => {
    setSelectedTerminal(null);
  };

  const fetchTerminalLogs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTerminal) return;
    setModalLoading(true);
    setModalError(null);
    try {
      const token = localStorage.getItem('viri_token');
      const response = await fetch(`/api/admin/terminals/${selectedTerminal.id}/view-log`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ one_time_code: oneTimeCode })
      });
      const data = await response.json();
      if (response.ok) {
        setModalLogs(data.logs || []);
        setSelectedRunIdx(0);
      } else {
        setModalError(data.error || 'Failed to fetch logs.');
      }
    } catch (err: any) {
      console.error(err);
      setModalError('Network error while fetching logs.');
    } finally {
      setModalLoading(false);
    }
  };

  const renderCompanyCard = (company: any) => {
    const adminUser = company.users?.find((u: any) => u.role === 'company_admin') || company.users?.[0];
    return (
      <div key={company.id} className="glass-panel p-6 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col gap-6 bg-black/20 rounded-2xl text-left">
        {/* Header: Company Name & Status */}
        <div className="flex flex-wrap justify-between items-center gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">{company.name}</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 mt-1">
              <span>ID: #{company.id}</span>
              {adminUser && (
                <>
                  <span className="text-zinc-700">•</span>
                  <span>Email: <strong className="text-zinc-300 font-mono">{adminUser.email}</strong></span>
                  <span className="text-zinc-700">•</span>
                  <span>Phone: <strong className="text-zinc-300 font-mono">{adminUser.phone_number || 'N/A'}</strong></span>
                  <span className="text-zinc-700">•</span>
                  <button
                    onClick={() => handleResetUserPassword(adminUser.id, adminUser.email)}
                    className="text-[10px] text-yellow-500 hover:text-yellow-400 font-bold border border-yellow-500/30 px-2 py-0.5 rounded hover:bg-yellow-500/10 transition-all flex items-center gap-1"
                  >
                    <Lock size={10} /> Reset Password
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Badge */}
            <span className={`px-2.5 py-1 rounded text-xs font-bold ${
              company.status === 'active' 
                ? 'bg-green-900/40 text-green-300 border border-green-500/20' 
                : company.status === 'suspended'
                  ? 'bg-orange-900/40 text-orange-300 border border-orange-500/20'
                  : company.status === 'archived'
                    ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    : 'bg-yellow-900/40 text-yellow-300 border border-yellow-500/20'
            }`}>
              {company.status === 'pending' ? 'PENDING APPROVAL' : company.status.toUpperCase()}
            </span>

            {/* Actions */}
            {company.status !== 'active' && (
              <button 
                onClick={() => updateCompany(company.id, 'active', company.subscription_tier, company.lock_timeout, company.max_terminals, company.license_expires_at, company.features)}
                className="btn btn-success text-xs py-1.5 px-3 flex items-center gap-1.5 font-semibold"
              >
                Activate
              </button>
            )}
            {company.status !== 'suspended' && (
              <button 
                onClick={() => updateCompany(company.id, 'suspended', company.subscription_tier, company.lock_timeout, company.max_terminals, company.license_expires_at, company.features)}
                className="btn btn-outline text-xs py-1.5 px-3 border-orange-500/50 text-orange-400 hover:bg-orange-500/10 font-semibold"
              >
                Suspend
              </button>
            )}
            {company.status !== 'archived' && (
              <button 
                onClick={() => updateCompany(company.id, 'archived', company.subscription_tier, company.lock_timeout, company.max_terminals, company.license_expires_at, company.features)}
                className="btn btn-outline text-xs py-1.5 px-3 border-zinc-700 text-zinc-400 hover:bg-zinc-800 font-semibold"
              >
                Archive
              </button>
            )}
            {company.status === 'archived' && (
              <button 
                onClick={() => handleDeleteCompany(company.id, company.name)}
                className="btn btn-outline text-xs py-1.5 px-3 border-red-500/50 text-red-400 hover:bg-red-500/10 flex items-center gap-1 font-semibold"
              >
                <Trash2 size={13} /> Delete Company
              </button>
            )}
          </div>
        </div>

        {/* Grid Section: Key settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {/* Subscription Plan/Tier Selector */}
          <div className="input-group">
            <label className="input-label flex items-center gap-1">
              Subscription Tier
              <Tooltip text="Billing plan selection controlling account limits and default features." />
            </label>
            <select 
              className="input-field w-full text-sm font-medium"
              value={company.subscription_tier}
              onChange={(e) => {
                const selectedTier = e.target.value;
                const matchedPlan = subscriptionPlans.find(p => p.tier_key === selectedTier);
                const defaultFeatures = matchedPlan ? matchedPlan.features : {};
                updateCompany(
                  company.id,
                  company.status,
                  selectedTier,
                  matchedPlan ? matchedPlan.lock_timeout : company.lock_timeout,
                  matchedPlan ? matchedPlan.max_terminals : company.max_terminals,
                  company.license_expires_at,
                  defaultFeatures,
                  matchedPlan ? matchedPlan.max_bank_accounts : company.max_bank_accounts
                );
              }}
            >
              {subscriptionPlans.map(plan => (
                <option key={plan.id} value={plan.tier_key}>
                  {plan.name} - MVR {plan.price} ({plan.max_terminals} {plan.max_terminals === 1 ? 'Terminal' : 'Terminals'})
                </option>
              ))}
            </select>
          </div>

          {/* Verifications Count */}
          <div className="input-group">
            <label className="input-label flex items-center gap-1">
              Verifications (Used / Limit)
              <Tooltip text="Total checks processed vs billing cycle limit." />
            </label>
            <div className="input-field bg-black/40 flex items-center justify-between text-sm font-mono opacity-80 cursor-not-allowed select-none">
              <span>{company.verifications_count}</span>
              <span className="text-zinc-500">/</span>
              <span>
                {(() => {
                  const matchedPlan = subscriptionPlans.find(p => p.tier_key === company.subscription_tier);
                  if (!matchedPlan) return 'Unlimited';
                  return matchedPlan.price === 0 ? 20 : (matchedPlan.tier_key === '499' ? 300 : 'Unlimited');
                })()}
              </span>
            </div>
          </div>

          {/* Max Terminals limit */}
          <div className="input-group">
            <label className="input-label flex items-center gap-1">
              Terminals Limit
              <Tooltip text="Current active terminals vs the max terminals limit (editable by superadmin)." />
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="number"
                min="1"
                className="input-field text-sm font-mono text-center w-24"
                value={company.max_terminals ?? 1}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) {
                    const updated = companies.map(c => c.id === company.id ? { ...c, max_terminals: val } : c);
                    setCompanies(updated);
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) {
                    updateCompany(company.id, company.status, company.subscription_tier, company.lock_timeout, val, company.license_expires_at, company.features, company.max_bank_accounts);
                  }
                }}
              />
              <span className="text-xs text-zinc-400 font-mono">({company.terminals?.length ?? 0} active)</span>
            </div>
          </div>

          {/* Max Bank Accounts limit */}
          <div className="input-group">
            <label className="input-label flex items-center gap-1">
              Bank Accounts Limit
              <Tooltip text="Maximum number of bank accounts allowed for this company." />
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="number"
                min="1"
                className="input-field text-sm font-mono text-center w-24"
                value={company.max_bank_accounts ?? 1}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) {
                    const updated = companies.map(c => c.id === company.id ? { ...c, max_bank_accounts: val } : c);
                    setCompanies(updated);
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) {
                    updateCompany(company.id, company.status, company.subscription_tier, company.lock_timeout, company.max_terminals, company.license_expires_at, company.features, val);
                  }
                }}
              />
              <span className="text-xs text-zinc-400 font-mono">({company.bank_accounts?.length ?? 0} active)</span>
            </div>
          </div>

          {/* Lock Timeout */}
          <div className="input-group">
            <label className="input-label flex items-center gap-1">
              Lock Timeout
              <Tooltip text="Maximum inactive duration (seconds) before terminals lock automatically." />
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="number"
                min="5"
                max="300"
                className="input-field text-sm font-mono text-center w-24"
                value={company.lock_timeout ?? 20}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) {
                    const updated = companies.map(c => c.id === company.id ? { ...c, lock_timeout: val } : c);
                    setCompanies(updated);
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) {
                    updateCompany(company.id, company.status, company.subscription_tier, val, company.max_terminals, company.license_expires_at, company.features, company.max_bank_accounts);
                  }
                }}
              />
              <span className="text-xs text-zinc-400 font-mono">seconds</span>
            </div>
          </div>

          {/* Plan Expiry Date */}
          <div className="input-group">
            <label className="input-label flex items-center gap-1 text-red-400 font-semibold">
              Plan Expiry Date
              <Tooltip text="The date when this company's subscription will expire. Select a date then click Set." />
            </label>
            <div className="flex gap-2 items-center">
              <input 
                type="date"
                className="input-field flex-1 text-sm font-mono text-white bg-zinc-900 border-zinc-800"
                value={pendingExpiry[company.id] ?? (company.license_expires_at ? String(company.license_expires_at).substring(0, 10) : '')}
                onChange={(e) => {
                  setPendingExpiry(prev => ({ ...prev, [company.id]: e.target.value }));
                }}
              />
              <button
                type="button"
                className="btn btn-success text-xs py-1.5 px-3 whitespace-nowrap"
                onClick={() => {
                  const val = pendingExpiry[company.id] ?? (company.license_expires_at ? String(company.license_expires_at).substring(0, 10) : '');
                  updateCompany(company.id, company.status, company.subscription_tier, company.lock_timeout, company.max_terminals, val || null, company.features, company.max_bank_accounts);
                  setPendingExpiry(prev => { const n = {...prev}; delete n[company.id]; return n; });
                }}
              >
                Set
              </button>
            </div>
          </div>

          {/* Custom Feature Overrides Section */}
          <div className="col-span-full border-t border-zinc-800/80 pt-4 mt-2 text-left">
            <h4 className="text-xs font-bold text-zinc-400 mb-3 flex items-center gap-1.5">
              <Shield size={14} className="text-yellow-500 animate-pulse" />
              Individual Feature Overrides
            </h4>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {[
                { key: 'verification_enabled', label: 'Verification Module' },
                { key: 'ledger_enabled', label: 'Transaction Ledger' },
                { key: 'ledger_show_balance', label: 'Ledger Show Balance' },
                { key: 'ledger_show_debit', label: 'Ledger Show Debit (Outgoing)' },
                { key: 'reports_enabled', label: 'Reports & Analytics' }
              ].map(f => {
                const isChecked = company.features?.[f.key] ?? false;
                return (
                  <label key={f.key} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer hover:text-white select-none">
                    <input
                      type="checkbox"
                      className="rounded bg-black border-zinc-700 text-yellow-500 focus:ring-yellow-500"
                      checked={isChecked}
                      onChange={(e) => {
                        const updatedFeatures = {
                          ...(company.features || {}),
                          [f.key]: e.target.checked
                        };
                        updateCompany(
                          company.id,
                          company.status,
                          company.subscription_tier,
                          company.lock_timeout,
                          company.max_terminals,
                          company.license_expires_at,
                          updatedFeatures
                        );
                      }}
                    />
                    {f.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Terminals list sub-section inside card */}
        <div className="bg-black/35 rounded-xl border border-zinc-800/80 p-4">
          <h4 className="text-sm font-bold text-zinc-300 mb-3 flex items-center gap-2">
            <MonitorSmartphone size={16} className="text-zinc-400" />
            Terminal Instances ({company.terminals?.length ?? 0})
          </h4>
          {company.terminals && company.terminals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {company.terminals.map((term: any) => {
                const showVbtl = term.permissions?.show_vbtl ?? false;
                return (
                  <div key={term.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-950/40 border border-zinc-800 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-xs text-white truncate" title={term.terminal_name}>
                        {term.terminal_name}
                      </span>
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono shrink-0">
                        {term.hardware_id ? term.hardware_id.substring(0, 8) + '...' : 'Unpaired'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {/* Toggle switch for VBTL show logs */}
                      <label className="flex items-center gap-2 text-xs text-zinc-400 select-none cursor-pointer">
                        <span>Show VBTL Logs</span>
                        <input 
                          type="checkbox"
                          className="toggle-switch-checkbox opacity-0 absolute w-0 h-0"
                          checked={showVbtl}
                          onChange={() => updateTerminalPermission(term.id, !showVbtl)}
                        />
                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${showVbtl ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                          <div className={`w-3 h-3 rounded-full bg-white transition-transform ${showVbtl ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                      </label>

                      {/* View Logs Button */}
                      <button 
                        onClick={() => openDebugLogModal(term)} 
                        className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-500/30 px-2.5 py-1 rounded hover:bg-blue-500/10 transition-all flex items-center gap-1 font-mono font-medium"
                      >
                        <Terminal size={10} /> View Logs
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-zinc-500 italic text-xs py-1">No active cashier terminals linked to this company.</p>
          )}
        </div>

        {/* Bank Accounts management sub-section inside card */}
        <div className="bg-black/35 rounded-xl border border-zinc-800/80 p-4 mt-4">
          <h4 className="text-sm font-bold text-zinc-300 mb-3 flex items-center gap-2">
            <Database size={16} className="text-zinc-400" />
            Bank Accounts & Session Locks ({company.bank_accounts?.length ?? 0})
          </h4>
          {company.bank_accounts && company.bank_accounts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {company.bank_accounts.map((acct: any) => {
                const isFetchLocked = acct.fetch_in_progress_until && new Date(acct.fetch_in_progress_until).getTime() > Date.now();
                return (
                  <div key={acct.id} className="flex flex-col gap-2 p-3 bg-zinc-950/40 border border-zinc-800 rounded-lg text-xs">
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-semibold text-white">
                        {acct.bank_name} ({acct.account_number})
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        isFetchLocked ? 'bg-amber-950 text-amber-400 border border-amber-500/25 animate-pulse' : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {isFetchLocked ? 'Fetching Lock' : 'Idle'}
                      </span>
                    </div>

                    <div className="text-zinc-400 flex flex-col gap-1 font-mono text-[10px]">
                      <div>
                        Holder Terminal ID: <span className="text-zinc-300">{acct.session_holder_terminal_id || 'None'}</span>
                      </div>
                      <div>
                        Last Heartbeat: <span className="text-zinc-300">
                          {acct.session_last_heartbeat_at ? new Date(acct.session_last_heartbeat_at).toLocaleTimeString() : 'N/A'}
                        </span>
                      </div>
                      {isFetchLocked && (
                        <div>
                          Lock Expires: <span className="text-amber-400">
                            {new Date(acct.fetch_in_progress_until).toLocaleTimeString()}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 justify-end border-t border-zinc-900/60 pt-2 mt-1">
                      <button
                        onClick={async () => {
                          if (confirm(`Are you sure you want to release the locks and reset fetch state for ${acct.bank_name}?`)) {
                            try {
                              const token = localStorage.getItem('viri_token');
                              const res = await fetch(`/api/admin/bank-accounts/${acct.id}/clear-lock`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
                              });
                              if (res.ok) {
                                alert('Stuck lock cleared successfully.');
                                // Refresh companies data to update UI
                                const compRes = await fetch('/api/admin/companies', {
                                  headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
                                });
                                if (compRes.ok) {
                                  setCompanies(await compRes.json());
                                }
                              } else {
                                const data = await res.json();
                                alert('Failed to clear lock: ' + (data.error || 'Unknown error'));
                              }
                            } catch (err: any) {
                              alert('Error: ' + err.message);
                            }
                          }
                        }}
                        className="text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-500/10 transition-all font-semibold"
                      >
                        Clear Stuck Lock
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-zinc-500 italic text-xs py-1">No bank accounts linked to this company.</p>
          )}
        </div>
      </div>
    );
  };

  const renderSubscriptionTiersManager = () => {
    return (
      <div className="flex flex-col gap-6 text-left">
        {/* Tier Config Form */}
        <div className="glass-panel p-6 border border-zinc-800 bg-black/20 rounded-2xl">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Plus size={20} className="text-yellow-500" />
            {editingPlan ? 'Edit Subscription Tier Plan' : 'Create New Subscription Tier Plan'}
          </h3>
          <form onSubmit={handleSavePlan} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="input-group">
              <label className="input-label">Tier Key (Unique URL key)</label>
              <input
                type="text"
                required
                disabled={!!editingPlan}
                placeholder="e.g. starter, basic, custom_tier"
                className="input-field text-sm"
                value={planForm.tier_key}
                onChange={e => setPlanForm(prev => ({ ...prev, tier_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Plan Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Starter Plan"
                className="input-field text-sm"
                value={planForm.name}
                onChange={e => setPlanForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Monthly Price (MVR)</label>
              <input
                type="number"
                min="0"
                required
                placeholder="0"
                className="input-field text-sm font-mono"
                value={planForm.price}
                onChange={e => setPlanForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Terminals Limit</label>
              <input
                type="number"
                min="1"
                required
                className="input-field text-sm font-mono"
                value={planForm.max_terminals}
                onChange={e => setPlanForm(prev => ({ ...prev, max_terminals: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Bank Accounts Limit</label>
              <input
                type="number"
                min="1"
                required
                className="input-field text-sm font-mono"
                value={planForm.max_bank_accounts}
                onChange={e => setPlanForm(prev => ({ ...prev, max_bank_accounts: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div className="input-group col-span-1">
              <label className="input-label">Lock Timeout (seconds)</label>
              <input
                type="number"
                min="5"
                max="300"
                required
                className="input-field text-sm font-mono"
                value={planForm.lock_timeout}
                onChange={e => setPlanForm(prev => ({ ...prev, lock_timeout: parseInt(e.target.value) || 20 }))}
              />
            </div>

            {/* Default Features Checkboxes */}
            <div className="col-span-full border-t border-zinc-800/80 pt-4 mt-2">
              <h4 className="text-xs font-bold text-zinc-400 mb-3">Default Enabled Functions/Modules</h4>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {[
                  { key: 'verification_enabled', label: 'Verification Module' },
                  { key: 'ledger_enabled', label: 'Transaction Ledger' },
                  { key: 'ledger_show_balance', label: 'Ledger Show Balance' },
                  { key: 'ledger_show_debit', label: 'Ledger Show Debit (Outgoing)' },
                  { key: 'reports_enabled', label: 'Reports & Analytics' }
                ].map(f => {
                  const isChecked = (planForm.features as any)[f.key] ?? false;
                  return (
                    <label key={f.key} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer hover:text-white select-none">
                      <input
                        type="checkbox"
                        className="rounded bg-black border-zinc-700 text-yellow-500 focus:ring-yellow-500"
                        checked={isChecked}
                        onChange={(e) => {
                          setPlanForm(prev => ({
                            ...prev,
                            features: {
                              ...prev.features,
                              [f.key]: e.target.checked
                            }
                          }));
                        }}
                      />
                      {f.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="col-span-full flex gap-3 mt-2 justify-end">
              {editingPlan && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlan(null);
                    setPlanForm({
                      tier_key: '',
                      name: '',
                      price: 0,
                      max_terminals: 1,
                      max_bank_accounts: 1,
                      lock_timeout: 20,
                      features: {
                        verification_enabled: true,
                        ledger_enabled: false,
                        ledger_show_balance: false,
                        ledger_show_debit: false,
                        reports_enabled: false
                      }
                    });
                  }}
                  className="btn btn-outline text-xs px-4"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="submit"
                className="btn btn-success text-xs px-6 py-2 font-bold"
              >
                {editingPlan ? 'Update Plan Tier' : 'Create Plan Tier'}
              </button>
            </div>
          </form>
        </div>

        {/* Plans List Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subscriptionPlans.map(plan => (
            <div key={plan.id} className="glass-panel p-5 border border-zinc-800 bg-zinc-950/20 rounded-2xl flex flex-col gap-4">
              <div className="flex justify-between items-start border-b border-zinc-900 pb-3">
                <div>
                  <h4 className="text-lg font-bold text-white tracking-tight">{plan.name}</h4>
                  <span className="font-mono text-[10px] text-zinc-500">Key: {plan.tier_key}</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold text-yellow-400 font-mono">MVR {parseFloat(plan.price).toLocaleString()}</div>
                  <span className="text-[10px] text-zinc-400">/ month</span>
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Terminals Limit:</span>
                  <strong className="text-white font-mono">{plan.max_terminals}</strong>
                </div>
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Bank Accounts Limit:</span>
                  <strong className="text-white font-mono">{plan.max_bank_accounts ?? 1}</strong>
                </div>
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Auto-Lock Timeout:</span>
                  <strong className="text-white font-mono">{plan.lock_timeout}s</strong>
                </div>
                
                <div className="pt-2 border-t border-zinc-900">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-1.5">Enabled Functions:</span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { key: 'verification_enabled', label: 'Verify' },
                      { key: 'ledger_enabled', label: 'Ledger' },
                      { key: 'ledger_show_balance', label: 'Balance' },
                      { key: 'ledger_show_debit', label: 'Debit' },
                      { key: 'reports_enabled', label: 'Reports' }
                    ].map(f => {
                      const isEnabled = plan.features?.[f.key] ?? false;
                      return (
                        <span
                          key={f.key}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                            isEnabled
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20'
                              : 'bg-zinc-900/30 text-zinc-600 border-zinc-800'
                          }`}
                        >
                          {f.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-zinc-900">
                <button
                  onClick={() => {
                    setEditingPlan(plan);
                    setPlanForm({
                      tier_key: plan.tier_key,
                      name: plan.name,
                      price: plan.price,
                      max_terminals: plan.max_terminals,
                      max_bank_accounts: plan.max_bank_accounts ?? 1,
                      lock_timeout: plan.lock_timeout,
                      features: {
                        verification_enabled: plan.features?.verification_enabled ?? true,
                        ledger_enabled: plan.features?.ledger_enabled ?? false,
                        ledger_show_balance: plan.features?.ledger_show_balance ?? false,
                        ledger_show_debit: plan.features?.ledger_show_debit ?? false,
                        reports_enabled: plan.features?.reports_enabled ?? false
                      }
                    });
                  }}
                  className="btn btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5 font-semibold text-zinc-300 hover:text-white"
                >
                  <Edit size={12} /> Edit
                </button>
                {/* Prevent deleting default system plan keys if necessary, or just check */}
                {!['free', '499', '999', '1999'].includes(plan.tier_key) && (
                  <button
                    onClick={() => handleDeletePlan(plan.id)}
                    className="btn btn-outline text-xs px-3 py-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 flex items-center gap-1.5 font-semibold"
                  >
                    <Trash2 size={12} /> Delete Plan
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPaymentsTab = () => {
    return (
      <div className="space-y-8 animate-fade-in text-left">
        <div className="glass-panel p-6 border border-zinc-800 bg-black/20 rounded-2xl shadow-xl">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <CreditCard className="text-yellow-500" size={20} />
            Pending Payment Approvals
          </h3>
          
          {paymentsLoading ? (
            <div className="text-center text-zinc-500 py-10 font-medium">Loading payments...</div>
          ) : payments.filter(p => p.status === 'pending').length === 0 ? (
            <div className="text-center text-zinc-500 italic py-10 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/10">
              No pending payment submissions.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800/80 text-zinc-400 font-bold uppercase tracking-wider">
                    <th className="pb-3">Company</th>
                    <th className="pb-3">Amount</th>
                    <th className="pb-3">Reference Number</th>
                    <th className="pb-3">Submitted At</th>
                    <th className="pb-3">Admin Remarks</th>
                    <th className="pb-3">Receipt Slip</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {payments.filter(p => p.status === 'pending').map((pay: any) => (
                    <tr key={pay.id} className="hover:bg-zinc-850/20">
                      <td className="py-3 font-semibold text-white">{pay.tenant?.name || 'Unknown'}</td>
                      <td className="py-3 font-mono font-bold text-yellow-400">MVR {parseFloat(pay.amount).toFixed(2)}</td>
                      <td className="py-3 font-mono text-zinc-300">{pay.reference_number}</td>
                      <td className="py-3 text-zinc-500">{new Date(pay.created_at).toLocaleString()}</td>
                      <td className="py-3 text-zinc-400 max-w-xs truncate" title={pay.remarks}>{pay.remarks || '-'}</td>
                      <td className="py-3">
                        <button
                          onClick={() => setShowSlipPreview(pay.receipt_slip_path)}
                          className="text-blue-400 hover:text-blue-300 underline font-semibold flex items-center gap-1.5"
                        >
                          View Slip Image
                        </button>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedPayment(pay);
                              setApproveTier(pay.tenant?.subscription_tier || '499');
                              const defaultExpiry = new Date();
                              defaultExpiry.setDate(defaultExpiry.getDate() + 30);
                              setApproveExpiry(defaultExpiry.toISOString().split('T')[0]);
                              setShowApprovalModal(true);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-3 rounded-lg transition-colors text-[10px]"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPayment(pay);
                              setShowRejectionModal(true);
                            }}
                            className="bg-red-950/40 hover:bg-red-900 border border-red-500/30 hover:border-red-500 text-red-300 hover:text-white font-bold py-1 px-3 rounded-lg transition-colors text-[10px]"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass-panel p-6 border border-zinc-800 bg-black/20 rounded-2xl shadow-xl">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <ClipboardList className="text-zinc-500" size={20} />
            Payment History Log
          </h3>
          
          {payments.filter(p => p.status !== 'pending').length === 0 ? (
            <div className="text-center text-zinc-600 italic py-10">
              No historical payment entries found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800/80 text-zinc-400 font-bold uppercase tracking-wider">
                    <th className="pb-3">Company</th>
                    <th className="pb-3">Amount</th>
                    <th className="pb-3">Reference Number</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Receipt Slip</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Remarks / Comments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {payments.filter(p => p.status !== 'pending').map((pay: any) => (
                    <tr key={pay.id} className="hover:bg-zinc-850/20">
                      <td className="py-3 text-zinc-300 font-semibold">{pay.tenant?.name || 'Unknown'}</td>
                      <td className="py-3 font-mono font-semibold text-zinc-300">MVR {parseFloat(pay.amount).toFixed(2)}</td>
                      <td className="py-3 font-mono text-zinc-400">{pay.reference_number}</td>
                      <td className="py-3 text-zinc-500">{new Date(pay.created_at).toLocaleDateString()}</td>
                      <td className="py-3">
                        <button
                          onClick={() => setShowSlipPreview(pay.receipt_slip_path)}
                          className="text-blue-400 hover:text-blue-300 underline font-semibold flex items-center gap-1"
                        >
                          View Receipt
                        </button>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                          pay.status === 'approved' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {pay.status}
                        </span>
                      </td>
                      <td className="py-3 text-zinc-400 max-w-xs truncate" title={pay.remarks}>{pay.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSystemSettingsTab = () => {
    return (
      <div className="glass-panel p-6 rounded-2xl border border-zinc-800 bg-black/20 text-left max-w-4xl mx-auto shadow-xl">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Settings className="text-yellow-500" size={22} />
              App Configuration & Server Polling Intervals
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Configure system-wide background polling intervals. Reducing intervals increases server load, while increasing them reduces responsiveness.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="btn border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 py-1 px-2.5 text-xs flex items-center gap-1.5 h-auto min-h-0 font-medium rounded-lg"
            title="Refresh settings data"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {/* Synchronization Engine Health & Telemetry */}
        {syncHealthSummary && (
          <div className="mb-8 p-5 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black border border-zinc-800 rounded-xl shadow-2xl relative overflow-hidden">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-4 relative z-10">
              <Zap size={16} className="text-yellow-500 animate-pulse" />
              Synchronization Engine Health & Telemetry
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 relative z-10">
              <div className="bg-black/40 border border-zinc-800/80 rounded-lg p-3 shadow-inner backdrop-blur-sm">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Confidence Score</div>
                <div className={`text-2xl font-bold font-mono ${
                  syncHealthSummary.confidence_score >= 85 ? 'text-emerald-400' :
                  syncHealthSummary.confidence_score >= 60 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {syncHealthSummary.confidence_score}%
                </div>
              </div>

              <div className="bg-black/40 border border-zinc-800/80 rounded-lg p-3 shadow-inner backdrop-blur-sm">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Efficiency Ratio (KPI)</div>
                <div className="text-2xl font-bold font-mono text-blue-400">
                  {Math.round(syncHealthSummary.efficiency_score * 100)}%
                </div>
              </div>

              <div className="bg-black/40 border border-zinc-800/80 rounded-lg p-3 shadow-inner backdrop-blur-sm">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Average Latency</div>
                <div className="text-2xl font-bold font-mono text-zinc-200">
                  {syncHealthSummary.avg_latency_ms ? `${(syncHealthSummary.avg_latency_ms / 1000).toFixed(2)}s` : '0s'}
                </div>
              </div>

              <div className="bg-black/40 border border-zinc-800/80 rounded-lg p-3 shadow-inner backdrop-blur-sm">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Active Backlog</div>
                <div className={`text-2xl font-bold font-mono ${
                  syncHealthSummary.backlog > 0 ? 'text-amber-400 animate-pulse' : 'text-zinc-500'
                }`}>
                  {syncHealthSummary.backlog} request(s)
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10 text-xs text-zinc-400 border-t border-zinc-800/50 pt-3">
              <div>
                <span className="text-zinc-500 font-bold block uppercase tracking-wider text-[9px]">Total Requests (24h)</span>
                <span className="font-mono text-zinc-300 text-sm font-semibold">{syncHealthSummary.total_requests || 0}</span>
              </div>
              <div>
                <span className="text-zinc-500 font-bold block uppercase tracking-wider text-[9px]">Actual Fetches (24h)</span>
                <span className="font-mono text-zinc-300 text-sm font-semibold">{syncHealthSummary.total_fetches || 0}</span>
              </div>
              <div>
                <span className="text-zinc-500 font-bold block uppercase tracking-wider text-[9px]">Failed Fetches (24h)</span>
                <span className={`font-mono text-sm font-semibold ${syncHealthSummary.failures_24h > 0 ? 'text-red-400 font-bold' : 'text-zinc-300'}`}>
                  {syncHealthSummary.failures_24h || 0}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 font-bold block uppercase tracking-wider text-[9px]">System Health Status</span>
                <span className={`font-semibold capitalize text-sm ${
                  syncHealthSummary.status === 'excellent' ? 'text-emerald-400' :
                  syncHealthSummary.status === 'stable' ? 'text-emerald-500/80' :
                  syncHealthSummary.status === 'degraded' ? 'text-amber-400' : 'text-red-400 font-bold'
                }`}>
                  {syncHealthSummary.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Server Metrics Dashboard */}
        {serverInfo && (
          <div className="mb-8 p-5 bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 rounded-xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
              <Server size={180} />
            </div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-4 relative z-10">
              <Activity size={16} className="text-blue-400" />
              Performance & Server Environment
            </h4>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 relative z-10">
              <div className="bg-black/40 border border-zinc-800/80 rounded-lg p-3 hover:border-zinc-700 transition-all shadow-inner backdrop-blur-sm">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1"><Server size={12}/> Server OS</div>
                <div className="text-sm font-mono text-zinc-200 truncate" title={serverInfo.server_os}>{serverInfo.server_os}</div>
              </div>
              <div className="bg-black/40 border border-zinc-800/80 rounded-lg p-3 hover:border-zinc-700 transition-all shadow-inner backdrop-blur-sm">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1"><Code size={12}/> PHP Version</div>
                <div className="text-lg font-mono text-zinc-200">{serverInfo.php_version}</div>
              </div>
              <div className="bg-black/40 border border-zinc-800/80 rounded-lg p-3 hover:border-zinc-700 transition-all shadow-inner backdrop-blur-sm">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1"><Layers size={12}/> Laravel Version</div>
                <div className="text-lg font-mono text-zinc-200">{serverInfo.laravel_version}</div>
              </div>
              <div className="bg-black/40 border border-zinc-800/80 rounded-lg p-3 hover:border-zinc-700 transition-all shadow-inner backdrop-blur-sm">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1"><Database size={12}/> MySQL Version</div>
                <div className="text-lg font-mono text-zinc-200 truncate" title={serverInfo.mysql_version}>{serverInfo.mysql_version}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
              {/* PHP INI Settings */}
              <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-4 backdrop-blur-sm">
                <h5 className="text-[11px] uppercase font-bold text-zinc-400 mb-3 tracking-wider flex items-center gap-1.5"><Settings size={12}/> PHP INI Configuration</h5>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono">
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">memory_limit</span>
                    <span className="text-blue-400">{serverInfo.ini?.memory_limit}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">max_execution_time</span>
                    <span className="text-yellow-400">{serverInfo.ini?.max_execution_time}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">upload_max_filesize</span>
                    <span className="text-green-400">{serverInfo.ini?.upload_max_filesize}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">post_max_size</span>
                    <span className="text-green-400">{serverInfo.ini?.post_max_size}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">opcache.enable</span>
                    <span className="text-purple-400">{serverInfo.ini?.opcache_enable}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">max_input_time</span>
                    <span className="text-yellow-400">{serverInfo.ini?.max_input_time}</span>
                  </div>
                </div>
              </div>

              {/* PHP FPM Settings */}
              <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-4 backdrop-blur-sm">
                <h5 className="text-[11px] uppercase font-bold text-zinc-400 mb-3 tracking-wider flex items-center gap-1.5"><Zap size={12}/> PHP-FPM Pool Settings</h5>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono">
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">pm</span>
                    <span className="text-orange-400">{serverInfo.fpm?.pm}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">pm.max_children</span>
                    <span className="text-zinc-300">{serverInfo.fpm?.pm_max_children}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">pm.start_servers</span>
                    <span className="text-zinc-300">{serverInfo.fpm?.pm_start_servers}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">pm.min_spare_servers</span>
                    <span className="text-zinc-300">{serverInfo.fpm?.pm_min_spare_servers}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">pm.max_spare_servers</span>
                    <span className="text-zinc-300">{serverInfo.fpm?.pm_max_spare_servers}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                    <span className="text-zinc-500">pm.max_requests</span>
                    <span className="text-zinc-300">{serverInfo.fpm?.pm_max_requests}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* App Diagnostics */}
            <div className="mt-4 pt-4 border-t border-zinc-800/80 flex flex-wrap gap-6 relative z-10">
              <div className="flex flex-col">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Active Terminals</div>
                <div className="text-sm font-mono text-zinc-200">{activeTerminalsCount}</div>
              </div>
              <div className="flex flex-col">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Memory (Client JS)</div>
                <div className="text-sm font-mono text-zinc-200">
                  {/* @ts-ignore */}
                  {window.performance && (window.performance as any).memory ? Math.round((window.performance as any).memory.usedJSHeapSize / 1024 / 1024) + ' MB' : 'N/A'}
                </div>
              </div>
              <div className="flex flex-col">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">System Status</div>
                <div className="text-sm font-mono text-green-400 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div> Healthy
                </div>
              </div>
            </div>
          </div>
        )}

        {settingsLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400 gap-3 font-medium">
            <div className="w-8 h-8 rounded-full border-2 border-t-yellow-500 border-zinc-700 animate-spin" />
            <span>Loading configurations...</span>
          </div>
        ) : settingsError ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm mb-6">
            ⚠️ Error loading settings: {settingsError}
            <button onClick={() => fetchSystemSettings()} className="ml-3 text-xs underline font-semibold hover:text-red-300">Retry</button>
          </div>
        ) : (
          <form onSubmit={handleSaveSystemSettings} className="space-y-6">
            {settingsSuccess && (
              <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-xl text-sm mb-4">
                {settingsSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Session Status Poll */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-bold text-white block">Session Status Poll Interval</label>
                  <span className="text-xs text-yellow-500 font-mono font-bold bg-yellow-500/10 px-2 py-0.5 rounded">
                    {systemSettings.find(s => s.key === 'session_status_poll_interval')?.value || 6}s
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  How often the cashier terminal checks the backend for locking status, pairing state, and permission updates.
                </p>
                <input
                  type="range"
                  min="2"
                  max="60"
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  value={systemSettings.find(s => s.key === 'session_status_poll_interval')?.value || 6}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSystemSettings(prev => prev.map(s => s.key === 'session_status_poll_interval' ? { ...s, value: val } : s));
                  }}
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                  <span>2s (Heavy load)</span>
                  <span>60s (Slow)</span>
                </div>
              </div>

              {/* Credential Sync Poll */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-bold text-white block">Credential Sync Poll Interval</label>
                  <span className="text-xs text-yellow-500 font-mono font-bold bg-yellow-500/10 px-2 py-0.5 rounded">
                    {systemSettings.find(s => s.key === 'credential_sync_poll_interval')?.value || 10}s
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  Frequency with which the terminal polls for pending zero-knowledge credential export or import sync tasks.
                </p>
                <input
                  type="range"
                  min="3"
                  max="60"
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  value={systemSettings.find(s => s.key === 'credential_sync_poll_interval')?.value || 10}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSystemSettings(prev => prev.map(s => s.key === 'credential_sync_poll_interval' ? { ...s, value: val } : s));
                  }}
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                  <span>3s</span>
                  <span>60s</span>
                </div>
              </div>

              {/* Version Check */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-bold text-white block">Extension Version Check</label>
                  <span className="text-xs text-yellow-500 font-mono font-bold bg-yellow-500/10 px-2 py-0.5 rounded">
                    {systemSettings.find(s => s.key === 'version_check_interval')?.value || 5}s
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  Determines the frequency of checking for the local browser extension context compatibility and version.
                </p>
                <input
                  type="range"
                  min="1"
                  max="60"
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  value={systemSettings.find(s => s.key === 'version_check_interval')?.value || 5}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSystemSettings(prev => prev.map(s => s.key === 'version_check_interval' ? { ...s, value: val } : s));
                  }}
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                  <span>1s</span>
                  <span>60s</span>
                </div>
              </div>

              {/* Active Session Heartbeats */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-bold text-white block">Active Session Heartbeats</label>
                  <span className="text-xs text-yellow-500 font-mono font-bold bg-yellow-500/10 px-2 py-0.5 rounded">
                    {systemSettings.find(s => s.key === 'active_session_heartbeat_interval')?.value || 5}s
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  Interval at which active session locks send heartbeats to keep the bank account session bound to this terminal.
                </p>
                <input
                  type="range"
                  min="2"
                  max="30"
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  value={systemSettings.find(s => s.key === 'active_session_heartbeat_interval')?.value || 5}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSystemSettings(prev => prev.map(s => s.key === 'active_session_heartbeat_interval' ? { ...s, value: val } : s));
                  }}
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                  <span>2s</span>
                  <span>30s</span>
                </div>
              </div>
              {/* Server Metrics Poll Interval */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-bold text-white block">Server Metrics Poll Interval</label>
                  <span className="text-xs text-yellow-500 font-mono font-bold bg-yellow-500/10 px-2 py-0.5 rounded">
                    {systemSettings.find(s => s.key === 'server_metrics_poll_interval')?.value || 60}s
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  Frequency for automatically refreshing the live Performance & Server Environment metrics card.
                </p>
                <input
                  type="range"
                  min="5"
                  max="300"
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  value={systemSettings.find(s => s.key === 'server_metrics_poll_interval')?.value || 60}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSystemSettings(prev => prev.map(s => s.key === 'server_metrics_poll_interval' ? { ...s, value: val } : s));
                  }}
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                  <span>5s</span>
                  <span>300s</span>
                </div>
              </div>
              {/* Real-time Event Polling */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-bold text-white block">Real-time Event Polling</label>
                  <span className="text-xs text-yellow-500 font-mono font-bold bg-yellow-500/10 px-2 py-0.5 rounded">
                    {systemSettings.find(s => s.key === 'realtime_event_poll_interval')?.value || 3}s
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  Interval for SSE (Server-Sent Events) alternative polling to fetch real-time sync signals and background tasks.
                </p>
                <input
                  type="range"
                  min="1"
                  max="15"
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  value={systemSettings.find(s => s.key === 'realtime_event_poll_interval')?.value || 3}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSystemSettings(prev => prev.map(s => s.key === 'realtime_event_poll_interval' ? { ...s, value: val } : s));
                  }}
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                  <span>1s</span>
                  <span>15s</span>
                </div>
              </div>
              {/* Session Log Poll Interval */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-bold text-white block">Session Log Poll Interval</label>
                  <span className="text-xs text-yellow-500 font-mono font-bold bg-yellow-500/10 px-2 py-0.5 rounded">
                    {systemSettings.find(s => s.key === 'session_log_poll_interval')?.value || 15}s
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  Frequency for automatically refreshing the active sessions and logs audit table.
                </p>
                <input
                  type="range"
                  min="5"
                  max="120"
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  value={systemSettings.find(s => s.key === 'session_log_poll_interval')?.value || 15}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSystemSettings(prev => prev.map(s => s.key === 'session_log_poll_interval' ? { ...s, value: val } : s));
                  }}
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                  <span>5s</span>
                  <span>120s</span>
                </div>
              </div>

              {/* Debug MIB Profile HTML */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-bold text-white block">Debug MIB Profile HTML</label>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    (systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === '1' || systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === true) 
                      ? 'text-emerald-400 bg-emerald-500/10' 
                      : 'text-zinc-400 bg-zinc-800'
                  }`}>
                    {(systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === '1' || systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === true) ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  When enabled, the companion browser extension will output the raw, cleaned HTML of the MIB profiles page into the superadmin logs chunk-by-chunk for debugging purposes.
                </p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer">
                    <input
                      type="radio"
                      name="debug_log_mib_html"
                      value="1"
                      className="accent-yellow-500"
                      checked={systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === '1' || systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === true || systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === 1}
                      onChange={() => {
                        setSystemSettings(prev => {
                          const exists = prev.some(s => s.key === 'debug_log_mib_html');
                          if (exists) {
                            return prev.map(s => s.key === 'debug_log_mib_html' ? { ...s, value: '1' } : s);
                          } else {
                            return [...prev, { key: 'debug_log_mib_html', value: '1' }];
                          }
                        });
                      }}
                    />
                    Enable
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer">
                    <input
                      type="radio"
                      name="debug_log_mib_html"
                      value="0"
                      className="accent-yellow-500"
                      checked={systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === '0' || systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === false || systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === 0 || !systemSettings.find(s => s.key === 'debug_log_mib_html') || systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === '0'}
                      onChange={() => {
                        setSystemSettings(prev => {
                          const exists = prev.some(s => s.key === 'debug_log_mib_html');
                          if (exists) {
                            return prev.map(s => s.key === 'debug_log_mib_html' ? { ...s, value: '0' } : s);
                          } else {
                            return [...prev, { key: 'debug_log_mib_html', value: '0' }];
                          }
                        });
                      }}
                    />
                    Disable
                  </label>
                </div>
              </div>
            </div>



            <div className="flex justify-end pt-4 border-t border-zinc-800 gap-3">
              <button
                type="button"
                onClick={() => fetchSystemSettings()}
                className="btn btn-outline text-xs px-4 py-2"
                disabled={settingsSaving}
              >
                Reset Changes
              </button>
              <button
                type="submit"
                className="btn btn-success text-xs px-5 py-2 font-bold flex items-center gap-1.5"
                disabled={settingsSaving}
              >
                {settingsSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border border-t-transparent border-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  };

  const renderSessionLogsTab = () => {
    return (
      <div className="glass-panel p-6 border border-zinc-800 bg-black/20 rounded-2xl text-left animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-white tracking-tight">Active Sessions & Logs Audit</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  handleRefresh();
                  const intervalStr = systemSettings.find(s => s.key === 'session_log_poll_interval')?.value || '15';
                  const iv = parseInt(intervalStr, 10);
                  setLogRefreshInterval(iv);
                  setLogRefreshCountdown(iv);
                }}
                className="btn border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 py-1 px-2.5 text-xs flex items-center gap-1.5 h-auto min-h-0 font-medium rounded-lg"
                title="Refresh logs data"
              >
                <RefreshCw size={11} /> Refresh Logs
              </button>
              {logRefreshCountdown !== null && (
                <div className="flex items-center gap-2 bg-black/40 px-2.5 py-1.5 rounded-lg border border-zinc-800/50" title={`Auto-refreshes in ${logRefreshCountdown}s`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0"></div>
                  <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-linear"
                      style={{ width: `${Math.max(0, (logRefreshCountdown / logRefreshInterval) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono w-6 text-right">{logRefreshCountdown}s</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Company Filter */}
            <select
              className="input-field text-xs py-1.5 px-3 font-medium bg-zinc-900 border-zinc-800"
              value={filterCompanyId}
              onChange={(e) => {
                setFilterCompanyId(e.target.value);
                setLogsPage(1);
              }}
            >
              <option value="">All Companies</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Event Type Filter */}
            <select
              className="input-field text-xs py-1.5 px-3 font-medium bg-zinc-900 border-zinc-800"
              value={filterEventType}
              onChange={(e) => {
                setFilterEventType(e.target.value);
                setLogsPage(1);
              }}
            >
              <option value="">All Events</option>
              <option value="session_login_started">Login Started</option>
              <option value="session_login_success">Login Success</option>
              <option value="session_login_failed">Login Failed</option>
              <option value="session_claimed">Session Claimed</option>
              <option value="session_heartbeat_lost">Heartbeat Lost</option>
              <option value="session_released">Session Released</option>
              <option value="fetch_request_submitted">Request Submitted</option>
              <option value="fetch_request_fulfilled">Request Fulfilled</option>
              <option value="fetch_request_failed">Request Failed</option>
            </select>
          </div>
        </div>

        {/* Active Terminals and Session Holders Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 flex items-center gap-4">
            <div className="p-3 bg-emerald-900/30 text-emerald-400 rounded-full">
              <MonitorSmartphone size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{activeTerminalsCount}</div>
              <div className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Active Terminals</div>
            </div>
          </div>

          <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 flex items-center gap-4">
            <div className="p-3 bg-blue-900/30 text-blue-400 rounded-full">
              <Shield size={24} />
            </div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-white">{sessionHolders.length}</div>
              <div className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Session Holding Terminals</div>
            </div>
            {sessionHolders.length > 0 && (
              <div className="text-right">
                <div className="text-[10px] text-zinc-500 mb-1">Current Holders:</div>
                {sessionHolders.slice(0, 2).map((acc: any) => (
                  <div key={acc.id} className="text-[10px] text-zinc-300 font-mono">
                    {acc.session_holder_terminal?.terminal_name || 'Terminal'} ({acc.tenant?.name})
                  </div>
                ))}
                {sessionHolders.length > 2 && (
                  <div className="text-[10px] text-zinc-500 italic">+{sessionHolders.length - 2} more</div>
                )}
              </div>
            )}
          </div>
        </div>

        {logsLoading ? (
          <div className="text-center py-12 text-zinc-500 font-medium animate-pulse">Loading session activity logs...</div>
        ) : sessionLogs.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 italic">No session logs match your criteria.</div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-semibold">
                    <th className="pb-3 pr-4">Timestamp</th>
                    <th className="pb-3 pr-4">Terminal / Company</th>
                    <th className="pb-3 pr-4">Account</th>
                    <th className="pb-3 pr-4">Event Type</th>
                    <th className="pb-3 pr-4">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {sessionLogs.map((log: any) => {
                    const dateStr = new Date(log.created_at).toLocaleString();
                    let badgeClass = "bg-zinc-800 text-zinc-400 border border-zinc-700";
                    if (['session_login_success', 'session_claimed', 'fetch_request_fulfilled', 'search_not_found'].includes(log.event_type)) {
                      badgeClass = "bg-green-950/40 text-green-400 border border-green-500/20";
                    } else if (['session_login_failed'].includes(log.event_type)) {
                      badgeClass = "bg-red-950/40 text-red-400 border border-red-500/20";
                    } else if (['session_heartbeat_lost', 'session_released', 'fetch_request_failed'].includes(log.event_type)) {
                      badgeClass = "bg-orange-950/40 text-orange-400 border border-orange-500/20";
                    }
                    const isExpanded = expandedLogId === log.id;
                    return (
                      <Fragment key={log.id}>
                        <tr 
                          className={`transition-colors border-b border-zinc-900/50 ${log.event_detail ? 'cursor-pointer hover:bg-zinc-800/25' : 'hover:bg-zinc-900/20'} ${isExpanded ? 'bg-zinc-850/40 border-b-0' : ''}`}
                          onClick={() => log.event_detail && setExpandedLogId(isExpanded ? null : log.id)}
                        >
                          <td className="py-3 pr-4 font-mono text-zinc-400">{dateStr}</td>
                          <td className="py-3 pr-4 font-medium text-white">
                            {log.terminal_name || "System"} 
                            {log.event_detail?.extension_version && (
                              <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono font-bold ml-1.5 align-middle">
                                v{log.event_detail.extension_version}
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-500 block">{log.tenant?.name}</span>
                          </td>
                          <td className="py-3 pr-4 font-mono text-zinc-400">
                            {log.bank_name || "N/A"}
                            <span className="text-[10px] block">{log.account_number_masked || ""}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}`}>
                              {log.event_type === 'search_not_found' ? 'SEARCH NOT FOUND!' : log.event_type.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-zinc-300 font-medium">
                            <div className="flex items-center justify-between gap-4">
                              <span>{log.event_summary}</span>
                              {log.event_detail && (
                                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                                  {isExpanded ? 'Hide Details' : 'View Details'}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && log.event_detail && (
                          <tr className="bg-zinc-950/20 border-b border-zinc-900">
                            <td colSpan={5} className="p-4">
                              {log.event_detail.pwa_logs && log.event_detail.pwa_logs.length > 0 ? (
                                <div className="flex flex-col gap-4">
                                  {Object.keys(log.event_detail).filter(k => k !== 'pwa_logs').length > 0 && (
                                    <div>
                                      <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1 px-1">Event Details</div>
                                      <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-950/80 p-3 rounded-lg border border-zinc-800/80 overflow-x-auto max-w-full scrollbar-thin">
                                        {JSON.stringify(Object.fromEntries(Object.entries(log.event_detail).filter(([k]) => k !== 'pwa_logs')), null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  <div>
                                    <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1 px-1">Terminal Session Logs</div>
                                    <div className="bg-[#0D0D0D] rounded-lg p-3.5 border border-zinc-800/80 font-mono text-[11px] text-[#4AF626] overflow-y-auto scrollbar-thin max-h-96 shadow-inner">
                                      {Array.isArray(log.event_detail.pwa_logs) 
                                        ? log.event_detail.pwa_logs.map((line: string, i: number) => (
                                            <div key={i} className="whitespace-pre leading-relaxed">{line}</div>
                                          ))
                                        : <div className="whitespace-pre leading-relaxed">{JSON.stringify(log.event_detail.pwa_logs, null, 2)}</div>}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-950/80 p-3 rounded-lg border border-zinc-800/80 overflow-x-auto max-w-full scrollbar-thin">
                                  {JSON.stringify(log.event_detail, null, 2)}
                                </pre>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between border-t border-zinc-800 pt-4 mt-2">
              <button
                className="btn btn-outline text-xs px-3 py-1.5"
                disabled={logsPage === 1}
                onClick={() => setLogsPage(prev => Math.max(prev - 1, 1))}
              >
                Previous
              </button>
              <span className="text-xs text-zinc-400 font-mono">
                Page {logsPage} of {logsTotalPages}
              </span>
              <button
                className="btn btn-outline text-xs px-3 py-1.5"
                disabled={logsPage === logsTotalPages}
                onClick={() => setLogsPage(prev => Math.min(prev + 1, logsTotalPages))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <img src="/logo_en.png" alt="Viri Logo" className="h-32 object-contain" />
              <span className="text-[var(--text-secondary)] text-lg font-normal border-l border-zinc-700 pl-3">Superadmin Portal</span>
            </h1>
            <p className="text-[var(--text-secondary)]">Manage tenant subscriptions and approvals</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleRefresh} className="btn btn-outline flex items-center gap-2">
              <RefreshCw size={16} /> Refresh
            </button>
            <button onClick={handleLogout} className="btn btn-outline flex items-center gap-2">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 mb-6 flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('companies')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'companies'
                ? 'border-yellow-500 text-yellow-500'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Building2 size={16} className="shrink-0" />
            <span>Registered Companies ({companies.filter(c => c.status !== 'archived').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'archived'
                ? 'border-yellow-500 text-yellow-500'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Archive size={16} className="shrink-0" />
            <span>Archived Companies ({companies.filter(c => c.status === 'archived').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('tiers')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'tiers'
                ? 'border-yellow-500 text-yellow-500'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers size={16} className="shrink-0" />
            <span>Subscription Tiers ({subscriptionPlans.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'logs'
                ? 'border-yellow-500 text-yellow-500'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ClipboardList size={16} className="shrink-0" />
            <span>Session Activity Log</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-yellow-500 text-yellow-500'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings size={16} className="shrink-0" />
            <span>App Configuration</span>
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 relative ${
              activeTab === 'payments'
                ? 'border-yellow-500 text-yellow-500'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CreditCard size={16} className="shrink-0" />
            <span>Payment Receipts</span>
            {pendingPaymentsCount > 0 && (
              <span className="absolute -top-1.5 -right-1 px-1.5 py-0.5 text-[9px] font-bold bg-red-600 text-white rounded-full leading-none shrink-0 border border-black animate-pulse">
                {pendingPaymentsCount}
              </span>
            )}
          </button>
        </div>

        {/* Security Confirmation PIN display */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
              <Lock size={20} />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Security Confirmation PIN</h4>
              <p className="text-xs text-zinc-400">Enter this PIN to confirm company updates, password resets, plan edits, or deletions.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunMigrations}
              disabled={migrationRunning}
              className="btn btn-outline text-xs border-zinc-700 text-zinc-400 font-mono py-1.5"
            >
              {migrationRunning ? 'Running...' : 'Run DB Migrations'}
            </button>
            <div className="bg-zinc-800 border border-zinc-700 px-4 py-2 rounded-lg">
              <span className="font-mono text-xl font-extrabold text-yellow-400 tracking-widest">{securityPin}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-6">
          {activeTab === 'companies' && (
            companies.filter(c => c.status !== 'archived').length === 0 ? (
              <div className="glass-panel p-8 text-center text-zinc-500 italic bg-black/20 rounded-2xl border border-zinc-850">
                No active registered companies found.
              </div>
            ) : (
              companies.filter(c => c.status !== 'archived').map(company => renderCompanyCard(company))
            )
          )}

          {activeTab === 'archived' && (
            companies.filter(c => c.status === 'archived').length === 0 ? (
              <div className="glass-panel p-8 text-center text-zinc-500 italic bg-black/20 rounded-2xl border border-zinc-850">
                No archived companies found.
              </div>
            ) : (
              companies.filter(c => c.status === 'archived').map(company => renderCompanyCard(company))
            )
          )}

          {activeTab === 'tiers' && renderSubscriptionTiersManager()}

          {activeTab === 'logs' && renderSessionLogsTab()}

          {activeTab === 'settings' && renderSystemSettingsTab()}

          {activeTab === 'payments' && renderPaymentsTab()}
        </div>

        {/* Debug Logs Viewer Modal */}
        {selectedTerminal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 max-w-lg w-full max-h-[85vh] flex flex-col relative shadow-2xl">
              <button 
                onClick={closeDebugLogModal} 
                className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-white transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>

              <h3 className="text-lg font-bold mb-2 flex items-center gap-2 pr-8 text-left">
                <Terminal size={18} className="text-blue-400" />
                Debug Logs: {selectedTerminal.terminal_name}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4 text-left">
                Enter the 6-digit debug code generated by the tenant admin to view this terminal's logs.
              </p>

              {modalError && (
                <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400 text-left">
                  {modalError}
                </div>
              )}

              {modalLogs === null ? (
                <form onSubmit={fetchTerminalLogs} className="flex flex-col gap-4 mt-2">
                  <div className="input-group text-left">
                    <label className="input-label">One-Time Debug Code</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. A8B39F" 
                      maxLength={6}
                      className="input-field text-center text-2xl tracking-widest font-mono py-3" 
                      value={oneTimeCode} 
                      onChange={e => setOneTimeCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                      disabled={modalLoading}
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="btn btn-success py-3 text-sm justify-center font-bold"
                    disabled={modalLoading || oneTimeCode.length < 6}
                  >
                    {modalLoading ? 'Fetching logs...' : 'Retrieve Logs'}
                  </button>
                </form>
              ) : (
                <div className="flex flex-col flex-1 overflow-hidden mt-2">
                  {/* If logs are in run-history format, show selector */}
                  {modalLogs.length > 0 && typeof modalLogs[0] === 'object' && (
                    <div className="mb-3 flex items-center justify-between gap-2 bg-zinc-900/50 p-2 rounded border border-zinc-800">
                      <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Select Run History:</label>
                      <select 
                        className="bg-black border border-zinc-700 text-zinc-200 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-blue-500"
                        value={selectedRunIdx}
                        onChange={e => setSelectedRunIdx(Number(e.target.value))}
                      >
                        {modalLogs.map((run: any, idx: number) => (
                          <option key={idx} value={idx}>
                            Run #{modalLogs.length - idx} ({new Date(run.timestamp).toLocaleString()})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="bg-black/50 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-green-400 h-80 overflow-y-auto flex flex-col gap-1.5 scrollbar-thin text-left">
                    {modalLogs.length === 0 ? (
                      <span className="text-zinc-500 italic">No logs uploaded.</span>
                    ) : (
                      (() => {
                        const currentRunLogs = (modalLogs.length > 0 && typeof modalLogs[0] === 'object')
                          ? (modalLogs[selectedRunIdx]?.logs || [])
                          : modalLogs;

                        return currentRunLogs.length === 0 ? (
                          <span className="text-zinc-500 italic">No logs recorded for this run.</span>
                        ) : (
                          currentRunLogs.map((logLine: string, idx: number) => (
                            <div key={idx} className="whitespace-pre-wrap leading-relaxed border-b border-zinc-900/50 pb-1.5 last:border-0">
                              {logLine}
                            </div>
                          ))
                        );
                      })()
                    )}
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button 
                      onClick={() => {
                        const currentRunLogs = (modalLogs.length > 0 && typeof modalLogs[0] === 'object')
                          ? (modalLogs[selectedRunIdx]?.logs || [])
                          : modalLogs;
                        navigator.clipboard.writeText(currentRunLogs.join('\n'));
                        alert('Logs copied to clipboard!');
                      }}
                      className="btn btn-outline text-xs py-2 px-4 flex-1 justify-center gap-1.5"
                      disabled={modalLogs.length === 0}
                    >
                      <Copy size={14} /> Copy Selected Logs
                    </button>
                    <button 
                      onClick={() => {
                        setModalLogs(null);
                        setOneTimeCode('');
                      }} 
                      className="btn btn-outline border-zinc-700 hover:bg-zinc-800 text-xs py-2 px-4 flex-1 justify-center"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Receipt Slip Preview Modal */}
        {showSlipPreview && (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-3xl w-full flex flex-col relative shadow-2xl">
              <button 
                onClick={() => setShowSlipPreview(null)} 
                className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
              <h3 className="text-lg font-bold text-white mb-4 text-left">Transfer Slip Receipt Preview</h3>
              <div className="flex-1 flex justify-center bg-black/40 border border-zinc-800 rounded-xl overflow-hidden max-h-[70vh]">
                <img src={showSlipPreview} alt="Receipt Slip" className="object-contain max-h-full max-w-full" />
              </div>
            </div>
          </div>
        )}

        {/* Approval Modal */}
        {showApprovalModal && selectedPayment && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative shadow-2xl text-left">
              <button 
                onClick={() => {
                  setShowApprovalModal(false);
                  setSelectedPayment(null);
                }} 
                className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-500" size={20} />
                Approve Payment Receipt
              </h3>
              <p className="text-xs text-zinc-400 mb-4">
                Confirm receipt validation and adjust subscription settings for <strong>{selectedPayment.tenant?.name}</strong>.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase text-zinc-500 font-bold mb-1.5 block">Reference Number</label>
                  <div className="input-field bg-zinc-950 font-mono text-zinc-300 select-all border-zinc-800/80">{selectedPayment.reference_number}</div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-zinc-500 font-bold mb-1.5 block">Amount Approved</label>
                  <div className="input-field bg-zinc-950 font-mono text-emerald-400 font-bold border-zinc-800/80">MVR {parseFloat(selectedPayment.amount).toFixed(2)}</div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-zinc-500 font-bold mb-1.5 block">Assign Subscription Tier</label>
                  <select
                    className="input-field w-full font-semibold"
                    value={approveTier}
                    onChange={(e) => setApproveTier(e.target.value)}
                  >
                    {subscriptionPlans.map((plan: any) => (
                      <option key={plan.id} value={plan.tier_key}>
                        {plan.name} (MVR {plan.price}/mo)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-zinc-500 font-bold mb-1.5 block">New Expiration Date</label>
                  <input
                    type="date"
                    required
                    className="input-field w-full font-mono text-zinc-200"
                    value={approveExpiry}
                    onChange={(e) => setApproveExpiry(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-zinc-500 font-bold mb-1.5 block">Approval Remarks / Notes</label>
                  <textarea
                    rows={2}
                    className="input-field w-full text-xs"
                    placeholder="Enter approval details or comments..."
                    value={actionRemarks}
                    onChange={(e) => setActionRemarks(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleApprovePayment}
                  className="btn btn-success flex-1 py-2 font-bold justify-center"
                >
                  Confirm Approval
                </button>
                <button
                  onClick={() => {
                    setShowApprovalModal(false);
                    setSelectedPayment(null);
                  }}
                  className="btn btn-outline border-zinc-800 py-2 flex-1 justify-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rejection Modal */}
        {showRejectionModal && selectedPayment && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative shadow-2xl text-left">
              <button 
                onClick={() => {
                  setShowRejectionModal(false);
                  setSelectedPayment(null);
                }} 
                className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <X className="text-red-500" size={20} />
                Reject Payment Receipt
              </h3>
              <p className="text-xs text-zinc-400 mb-4">
                Reject the uploaded slip reference <strong>{selectedPayment.reference_number}</strong>. Rejection reason is required.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase text-zinc-500 font-bold mb-1.5 block">Rejection Reason / Remarks</label>
                  <textarea
                    rows={3}
                    required
                    className="input-field w-full text-xs"
                    placeholder="Provide the reason for rejecting this payment (e.g. Reference not found, Incorrect amount)..."
                    value={actionRemarks}
                    onChange={(e) => setActionRemarks(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleRejectPayment}
                  className="btn bg-red-650 hover:bg-red-500 text-white flex-1 py-2 font-bold justify-center"
                  disabled={!actionRemarks.trim()}
                >
                  Confirm Rejection
                </button>
                <button
                  onClick={() => {
                    setShowRejectionModal(false);
                    setSelectedPayment(null);
                  }}
                  className="btn btn-outline border-zinc-800 py-2 flex-1 justify-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
