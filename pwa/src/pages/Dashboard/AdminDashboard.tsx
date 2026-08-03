import { useState, useEffect, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Terminal, X, Copy, Lock, Info, MonitorSmartphone, Shield, Trash2, Plus, Edit, Building2, Archive, Layers, ClipboardList, Settings, RefreshCw, CreditCard, CheckCircle2, Server, Database, Code, Zap, Activity, Sun, Moon, Briefcase, Sparkles, Clock, AlertTriangle, Search, Key, ArrowLeft, ChevronDown, TrendingUp } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

const Tooltip = ({ text }: { text: string }) => (
  <div className="relative inline-flex items-center group/tooltip ml-1.5 cursor-help align-middle">
    <Info size={14} className="text-[var(--text-secondary)] hover:text-white transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-zinc-900 border border-zinc-700 text-white text-xs leading-relaxed rounded shadow-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 font-normal normal-case">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700"></div>
    </div>
  </div>
);

export default function AdminDashboard() {
  const [theme, toggleTheme] = useTheme();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<{ message: string; retry: () => void } | null>(null);
  const navigate = useNavigate();
  const pinInputRef = useRef<HTMLInputElement>(null);

  const [companiesPage, setCompaniesPage] = useState(1);
  const [companiesTotalPages, setCompaniesTotalPages] = useState(1);
  const [drafts, setDrafts] = useState<Record<number, any>>({});
  
  // Custom Modals State
  const [pinModalState, setPinModalState] = useState<{isOpen: boolean; resolve: (val: string|null) => void; message: string;}>({isOpen: false, resolve: () => {}, message: ''});
  const [confirmModalState, setConfirmModalState] = useState<{isOpen: boolean; resolve: (val: boolean) => void; message: string;}>({isOpen: false, resolve: () => {}, message: ''});
  const [alertModalState, setAlertModalState] = useState<{isOpen: boolean; resolve: () => void; message: string;}>({isOpen: false, resolve: () => {}, message: ''});


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

  const [activeTab, setActiveTab] = useState<'overview' | 'companies' | 'archived' | 'tiers' | 'logs' | 'terminalDebug' | 'settings' | 'payments' | 'debug' | 'credentials'>('overview');
  const [singleCompanyFilterId, setSingleCompanyFilterId] = useState<number | null>(null);
  const [overviewSearch, setOverviewSearch] = useState('');
  const [overviewStatusFilter, setOverviewStatusFilter] = useState('all');
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logRefreshCountdown, setLogRefreshCountdown] = useState<number | null>(null);
  const [logRefreshInterval, setLogRefreshInterval] = useState<number>(15);
  const [logDetailsMap, setLogDetailsMap] = useState<Record<number, any>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);
  const [sessionTelemetry, setSessionTelemetry] = useState<any>(null);
  const [sessionLogViewMode, setSessionLogViewMode] = useState<'grouped' | 'raw'>('grouped');
  const [expandedFlowId, setExpandedFlowId] = useState<string | null>(null);
  const [activeFlowStepTabMap, setActiveFlowStepTabMap] = useState<Record<string, 'submitted' | 'debug_logs' | 'result'>>({});

  // Debug state
  const [debugData, setDebugData] = useState<{ mib_keys: any[]; bml_tokens: any[]; total_mib_keys: number; total_bml_tokens: number } | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  // Credentials Inspector State
  const [credsData, setCredsData] = useState<{ bml_groups: any[]; mib_groups: any[]; total_bml: number; total_mib: number } | null>(null);
  const [credsLoading, setCredsLoading] = useState(false);
  const [credsTestingId, setCredsTestingId] = useState<string | null>(null);
  const [credsTestResults, setCredsTestResults] = useState<Record<string, any>>({});
  const [revealedCreds, setRevealedCreds] = useState<Record<string, boolean>>({});
  const [openCredComm, setOpenCredComm] = useState<Record<string, boolean>>({});

  // Clone credential modal
  const [cloneModal, setCloneModal] = useState<{isOpen: boolean; sourceGroup: any | null; unlinkedAccounts: any[]; selectedAccountId: number | null; loading: boolean; loadingAccounts: boolean; result: any | null; error: string | null}>({
    isOpen: false, sourceGroup: null, unlinkedAccounts: [], selectedAccountId: null, loading: false, loadingAccounts: false, result: null, error: null,
  });

  // Inject credential modal
  const [injectModal, setInjectModal] = useState<{
    isOpen: boolean; type: 'bml' | 'mib'; tenants: any[]; selectedTenantId: number | null;
    accounts: any[]; selectedAccountId: number | null; loadingAccounts: boolean;
    fields: Record<string, string>; submitting: boolean; result: any | null; error: string | null;
    loadingTenants: boolean;
  }>({
    isOpen: false, type: 'bml', tenants: [], selectedTenantId: null,
    accounts: [], selectedAccountId: null, loadingAccounts: false,
    fields: {}, submitting: false, result: null, error: null, loadingTenants: false,
  });

  const openCloneModal = async (group: any) => {
    setCloneModal({isOpen: true, sourceGroup: group, unlinkedAccounts: [], selectedAccountId: null, loading: false, loadingAccounts: true, result: null, error: null});
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch(`/api/admin/credentials/bml/unlinked-accounts?tenant_id=${group.tenant_id}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = await res.json();
      setCloneModal(prev => ({ ...prev, unlinkedAccounts: Array.isArray(data) ? data : [], loadingAccounts: false }));
    } catch {
      setCloneModal(prev => ({ ...prev, error: 'Failed to load unlinked accounts', loadingAccounts: false }));
    }
  };

  const executeClone = async () => {
    const group = cloneModal.sourceGroup;
    if (!group || !cloneModal.selectedAccountId) return;
    setCloneModal(prev => ({ ...prev, loading: true, result: null, error: null }));
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch(`/api/admin/credentials/bml/${group.id}/clone`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_account_id: cloneModal.selectedAccountId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCloneModal(prev => ({ ...prev, error: data.error || 'Clone failed', loading: false }));
      } else {
        setCloneModal(prev => ({ ...prev, result: data, loading: false }));
      }
    } catch (err: any) {
      setCloneModal(prev => ({ ...prev, error: err.message || 'Network error', loading: false }));
    }
  };

  const closeCloneModal = () => {
    setCloneModal(prev => ({ ...prev, isOpen: false }));
  };

  const openInjectModal = async (type: 'bml' | 'mib') => {
    setInjectModal({
      isOpen: true, type, tenants: [], selectedTenantId: null,
      accounts: [], selectedAccountId: null, loadingAccounts: false,
      fields: {}, submitting: false, result: null, error: null, loadingTenants: true,
    });
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch('/api/admin/companies?per_page=200', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = await res.json();
      const tenantList = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setInjectModal(prev => ({ ...prev, tenants: tenantList, loadingTenants: false }));
    } catch {
      setInjectModal(prev => ({ ...prev, error: 'Failed to load tenants', loadingTenants: false }));
    }
  };

  const loadInjectAccounts = async (tenantId: number, type: 'bml' | 'mib') => {
    setInjectModal(prev => ({ ...prev, loadingAccounts: true, accounts: [], selectedAccountId: null, error: null }));
    try {
      const token = localStorage.getItem('viri_token');
      const bankName = type === 'bml' ? 'BML' : 'MIB';
      const res = await fetch(`/api/admin/tenants/${tenantId}/bank-accounts?bank_name=${bankName}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setInjectModal(prev => {
          if (prev.type !== type) return prev;
          return { ...prev, accounts: Array.isArray(data) ? data : [], loadingAccounts: false };
        });
      } else {
        setInjectModal(prev => {
          if (prev.type !== type) return prev;
          return { ...prev, error: data.error || 'Failed to load accounts', loadingAccounts: false };
        });
      }
    } catch (err: any) {
      setInjectModal(prev => {
        if (prev.type !== type) return prev;
        return { ...prev, error: err.message || 'Failed to load accounts', loadingAccounts: false };
      });
    }
  };

  const executeInject = async () => {
    const { type, selectedAccountId, fields } = injectModal;
    if (!selectedAccountId) return;
    setInjectModal(prev => ({ ...prev, submitting: true, result: null, error: null }));
    try {
      const token = localStorage.getItem('viri_token');
      const body: any = {};
      if (type === 'bml') {
        body.tenant_id = injectModal.selectedTenantId;
        body.bank_account_id = selectedAccountId;
        body.terminal_id = fields.terminal_id ? Number(fields.terminal_id) : null;
        body.bml_username = fields.bml_username || null;
        body.profile_type = fields.profile_type || 'personal';
        body.access_token = fields.access_token || '';
        body.refresh_token = fields.refresh_token || '';
        body.device_id = fields.device_id || '';
        if (fields.expires_in) body.expires_in = Number(fields.expires_in);
      } else {
        body.tenant_id = injectModal.selectedTenantId;
        body.bank_account_id = selectedAccountId;
        body.terminal_id = fields.terminal_id ? Number(fields.terminal_id) : null;
        body.mib_username = fields.mib_username || '';
        body.key1 = fields.key1 || '';
        body.key2 = fields.key2 || '';
        body.app_id = fields.app_id || '';
        body.profile_id = fields.profile_id || 'default_profile';
        body.profile_type = fields.profile_type || '0';
        body.profile_name = fields.profile_name || '';
      }
      const res = await fetch(`/api/admin/credentials/${type}/inject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        let errorMsg = data.error;
        if (!errorMsg && data.errors) {
          errorMsg = Object.values(data.errors).flat().join('. ');
        }
        if (!errorMsg) errorMsg = data.message || 'Injection failed';
        setInjectModal(prev => ({ ...prev, error: errorMsg, submitting: false }));
      } else {
        setInjectModal(prev => ({ ...prev, result: data, submitting: false }));
      }
    } catch (err: any) {
      setInjectModal(prev => ({ ...prev, error: err.message || 'Network error', submitting: false }));
    }
  };

  const closeInjectModal = () => {
    if (injectModal.result) fetchCredentials();
    setInjectModal(prev => ({ ...prev, isOpen: false }));
  };

  const toggleReveal = (key: string) => {
    setRevealedCreds(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Terminal Debug Logs State
  const [terminalDebugLogs, setTerminalDebugLogs] = useState<any[]>([]);
  const [terminalDebugLogsLoading, setTerminalDebugLogsLoading] = useState(false);
  const [terminalDebugError, setTerminalDebugError] = useState<string | null>(null);
  const [selectedDebugTerminal, setSelectedDebugTerminal] = useState<number | null>(null);
  const [selectedDebugTerminalLogs, setSelectedDebugTerminalLogs] = useState<any | null>(null);
  const [selectedDebugRunIdx, setSelectedDebugRunIdx] = useState<number>(0);

  const fetchTerminalDebugLogs = async () => {
    setTerminalDebugLogsLoading(true);
    setTerminalDebugError(null);
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch('/api/admin/terminal-debug-logs?per_page=100', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setTerminalDebugLogs(data.terminals || []);
      } else {
        setTerminalDebugError(`Failed to load (${res.status})`);
      }
      if (selectedDebugTerminal) {
        await fetchTerminalDebugLogDetail(selectedDebugTerminal);
      }
    } catch (err) {
      console.error(err);
      setTerminalDebugError('Network error loading terminal debug logs');
    }
    finally { setTerminalDebugLogsLoading(false); }
  };

  const fetchTerminalDebugLogDetail = async (id: number) => {
    setSelectedDebugTerminal(id);
    setSelectedDebugRunIdx(0);
    setSelectedDebugTerminalLogs(null);
    setTerminalDebugError(null);
    try {
      const token = localStorage.getItem('viri_token');
      const res = await fetch(`/api/admin/terminal-debug-logs/${id}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedDebugTerminalLogs(data);
      } else {
        setTerminalDebugError(`Failed to load logs (${res.status})`);
        setSelectedDebugTerminalLogs(null);
      }
    } catch (err) {
      console.error(err);
      setTerminalDebugError('Network error loading terminal log detail');
      setSelectedDebugTerminalLogs(null);
    }
  };

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
    if (!(await verifySecurityPin())) return;
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
      setPayments(Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []));
    } catch (err) {
      console.error(err);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const handleApprovePayment = async () => {
    if (!(await verifySecurityPin())) return;
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
        await customAlert("Payment approved and plan updated successfully!");
        setShowApprovalModal(false);
        setSelectedPayment(null);
        setActionRemarks('');
        fetchPayments();
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        await customAlert(data.message || "Failed to approve payment");
      }
    } catch (e) {
      await customAlert("Network error approving payment");
    }
  };

  const handleRejectPayment = async () => {
    if (!(await verifySecurityPin())) return;
    if (!selectedPayment) return;
    if (!actionRemarks.trim()) {
      await customAlert("Please provide rejection remarks");
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
        await customAlert("Payment rejected successfully!");
        setShowRejectionModal(false);
        setSelectedPayment(null);
        setActionRemarks('');
        fetchPayments();
      } else {
        const data = await res.json().catch(() => ({}));
        await customAlert(data.message || "Failed to reject payment");
      }
    } catch (e) {
      await customAlert("Network error rejecting payment");
    }
  };

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchSystemSettings();
    } else if (activeTab === 'payments') {
      fetchPayments();
    } else if (activeTab === 'credentials') {
      fetchCredentials();
    }
  }, [activeTab]);

  const [filterEventType, setFilterEventType] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  
  const [activeTerminalsCount, setActiveTerminalsCount] = useState<number>(0);

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
      reports_enabled: false,
      statement_enabled: false,
      custom_recent_tx_limit: false
    }
  });

  // Buffer for date picker — keyed by company id

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'companies' || activeTab === 'overview') {
      fetchData();
    }
  }, [companiesPage, activeTab]);


  useEffect(() => {
    if (activeTab === 'logs') {
      fetchSessionLogs(true);
    }
    if (activeTab === 'terminalDebug') {
      fetchTerminalDebugLogs();
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
        if (data.telemetry) setSessionTelemetry(data.telemetry);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleToggleDetail = async (logId: number) => {
    if (expandedLogId === logId) {
      setExpandedLogId(null);
      return;
    }
    setExpandedLogId(logId);
    if (!logDetailsMap[logId]) {
      setLoadingDetailId(logId);
      try {
        const token = localStorage.getItem('viri_token');
        const res = await fetch(`/api/admin/session-logs/${logId}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          setLogDetailsMap(prev => ({ ...prev, [logId]: data.event_detail || {} }));
        }
      } catch (err) {
        console.error('Failed to fetch log detail:', err);
      } finally {
        setLoadingDetailId(null);
      }
    }
  };

  const fetchDebugInfo = async () => {
    setDebugLoading(true);
    try {
      const token = localStorage.getItem('viri_token');
      if (!token) return;
      const res = await fetch('/api/admin/debug-info', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) setDebugData(await res.json());
    } catch (err) {
      console.error('Failed to fetch debug info:', err);
    } finally {
      setDebugLoading(false);
    }
  };

  const fetchCredentials = async () => {
    setCredsLoading(true);
    try {
      const token = localStorage.getItem('viri_token');
      if (!token) return;
      const res = await fetch('/api/admin/credentials', {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) setCredsData(await res.json());
    } catch (err) {
      console.error('Failed to fetch credentials:', err);
    } finally {
      setCredsLoading(false);
    }
  };

  const testCredential = async (type: 'bml' | 'mib', id: number) => {
    const key = `${type}-${id}`;
    setCredsTestingId(key);
    setCredsTestResults(prev => ({ ...prev, [key]: { loading: true } }));
    try {
      const token = localStorage.getItem('viri_token');
      if (!token) return;
      const res = await fetch(`/api/admin/credentials/${type}/${id}/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = await res.json();
      setCredsTestResults(prev => ({ ...prev, [key]: data }));
    } catch (err: any) {
      setCredsTestResults(prev => ({ ...prev, [key]: { error: err.message, valid: false } }));
    } finally {
      setCredsTestingId(null);
    }
  };

  const renewBmlToken = async (id: number) => {
    const key = `bml-renew-${id}`;
    setCredsTestingId(key);
    setCredsTestResults(prev => ({ ...prev, [key]: { loading: true } }));
    try {
      const token = localStorage.getItem('viri_token');
      if (!token) return;
      const res = await fetch(`/api/admin/credentials/bml/${id}/renew`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = await res.json();
      setCredsTestResults(prev => ({ ...prev, [key]: data }));
    } catch (err: any) {
      setCredsTestResults(prev => ({ ...prev, [key]: { error: err.message, success: false } }));
    } finally {
      setCredsTestingId(null);
    }
  };

  const renewMibKeys = async (id: number) => {
    const key = `mib-renew-${id}`;
    setCredsTestingId(key);
    setCredsTestResults(prev => ({ ...prev, [key]: { loading: true } }));
    try {
      const token = localStorage.getItem('viri_token');
      if (!token) return;
      const res = await fetch(`/api/admin/credentials/mib/${id}/renew`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = await res.json();
      setCredsTestResults(prev => ({ ...prev, [key]: data }));
    } catch (err: any) {
      setCredsTestResults(prev => ({ ...prev, [key]: { error: err.message, cleared: false } }));
    } finally {
      setCredsTestingId(null);
    }
  };

  const toggleCredComm = (key: string) => {
    setOpenCredComm(prev => ({ ...prev, [key]: !prev[key] }));
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
      
      if (userData.user.role !== 'superadmin') {
        throw new Error('Not an admin');
      }

      const perPage = activeTab === 'overview' ? 200 : 10;
      const compRes = await fetch(`/api/admin/companies?page=${companiesPage}&per_page=${perPage}`, { headers });
      const compData = await compRes.json();
      if (compData.data !== undefined) {
        setCompanies(compData.data);
        setCompaniesTotalPages(compData.last_page || 1);
      } else {
        setCompanies(Array.isArray(compData) ? compData : []);
      }

      const plansRes = await fetch('/api/admin/subscription-plans', { headers });
      if (plansRes.ok) {
        setSubscriptionPlans(await plansRes.json());
      }

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

  const handleRefresh = () => {
    setFetchError(null);
    if (activeTab === 'overview' || activeTab === 'companies' || activeTab === 'archived' || activeTab === 'tiers') {
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

  const verifySecurityPin = async (): Promise<boolean> => {
    const userPin = await new Promise<string | null>((resolve) => {
      setPinModalState({ isOpen: true, resolve, message: `To confirm this action, please enter the 4-letter security PIN displayed at the top of the panel (${securityPin}):` });
    });
    setPinModalState({ isOpen: false, resolve: () => {}, message: '' });
    if (!userPin || userPin.toUpperCase() !== securityPin) {
      await customAlert("Invalid or empty PIN. Action aborted.");
      return false;
    }
    return true;
  };

  const customConfirm = async (msg: string): Promise<boolean> => {
    const confirmed = await new Promise<boolean>((resolve) => {
      setConfirmModalState({ isOpen: true, resolve, message: msg });
    });
    setConfirmModalState({ isOpen: false, resolve: () => {}, message: '' });
    return confirmed;
  };

  const customAlert = async (msg: string): Promise<void> => {
    await new Promise<void>((resolve) => {
      setAlertModalState({ isOpen: true, resolve, message: msg });
    });
    setAlertModalState({ isOpen: false, resolve: () => {}, message: '' });
  };

  const updateCompany = async (id: number, status: string, tier: string, lockTimeout?: number, maxTerminals?: number, licenseExpiresAt?: string | null, features?: any, maxBankAccounts?: number, customVerificationsLimit?: number | null) => {
    if (!(await verifySecurityPin())) {
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
    if (features !== undefined && features !== null && (Array.isArray(features) || typeof features === 'object')) {
      payload.features = features;
    }
    if (customVerificationsLimit !== undefined) {
      payload.custom_verifications_limit = customVerificationsLimit;
    }
    console.log('Sending PUT request for company id:', id, 'payload:', payload);
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('Update company error response:', res.status, errText);
        let err;
        try { err = JSON.parse(errText); } catch(e) { err = { message: errText }; }
        await customAlert(`Failed to update company: ${err.message || res.statusText}`);
      }
    } catch (e: any) {
      await customAlert(`Error updating company: ${e.message}`);
    }
    fetchData();
  };

  const handleDeleteCompany = async (id: number, name: string) => {
    if (!(await verifySecurityPin())) return;
    if (!await customConfirm(`Are you absolutely sure you want to permanently delete company "${name}" and all of its associated users, terminals, bank accounts, and logs? This cannot be undone.`)) {
      return;
    }

    const token = localStorage.getItem('viri_token');
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        await customAlert("Company deleted successfully!");
        fetchData();
      } else {
        await customAlert("Failed to delete company.");
      }
    } catch (e) {
      await customAlert("Network error deleting company.");
    }
  };

  const handleResetUserPassword = async (userId: number, email: string) => {
    if (!(await verifySecurityPin())) return;
    const newPassword = await new Promise<string|null>((res) => setPinModalState({isOpen: true, resolve: res, message: `Enter new dashboard password for ${email} (minimum 8 characters):`}));
    if (!newPassword) return;
    if (newPassword.length < 8) {
      await customAlert("Password must be at least 8 characters long.");
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
        await customAlert("Password reset successfully!");
      } else {
        const err = await res.json().catch(() => ({}));
        await customAlert(`Error: ${err.error || 'Failed to reset password'}`);
      }
    } catch (e) {
      await customAlert("Network error occurred.");
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await verifySecurityPin())) return;

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
        await customAlert(editingPlan ? "Plan updated successfully!" : "Plan created successfully!");
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
            reports_enabled: false,
            statement_enabled: false,
            custom_recent_tx_limit: false
          }
        });
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        await customAlert(`Error: ${err.message || 'Failed to save plan'}`);
      }
    } catch (e) {
      await customAlert("Network error saving plan.");
    }
  };

  const handleDeletePlan = async (id: number) => {
    if (!(await verifySecurityPin())) return;
    if (!await customConfirm("Are you sure you want to delete this subscription plan? Existing companies on this plan will not be automatically deleted but should be migrated to another plan.")) return;

    const token = localStorage.getItem('viri_token');
    try {
      const res = await fetch(`/api/admin/subscription-plans/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        await customAlert("Plan deleted successfully!");
        fetchData();
      } else {
        await customAlert("Failed to delete plan.");
      }
    } catch (e) {
      await customAlert("Network error deleting plan.");
    }
  };

  const handleRunMigrations = async () => {
    if (!(await verifySecurityPin())) return;
    setMigrationRunning(true);
    const token = localStorage.getItem('viri_token');
    try {
      const res = await fetch('/api/admin/run-migrations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        await customAlert("Migrations run successfully!\n\nOutput:\n" + data.output);
        fetchData();
      } else {
        await customAlert("Failed to run migrations.");
      }
    } catch (e) {
      await customAlert("Network error running migrations.");
    } finally {
      setMigrationRunning(false);
    }
  };

  const updateTerminalPermission = async (terminalId: number, showVbtl: boolean) => {
    if (!(await verifySecurityPin())) return;

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
        await customAlert("Failed to update terminal settings.");
      }
    } catch (err) {
      console.error(err);
      await customAlert("Network error updating terminal settings.");
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

  const handleDraftChange = (companyId: number, field: string, value: any) => {
    setDrafts(prev => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] || {}),
        [field]: value
      }
    }));
  };

  const handleSaveCompanyChanges = async (company: any) => {
    const draft = drafts[company.id];
    if (!draft || Object.keys(draft).length === 0) return;
    
    const tier = draft.subscription_tier !== undefined ? draft.subscription_tier : company.subscription_tier;
    const lockTimeout = draft.lock_timeout !== undefined ? draft.lock_timeout : company.lock_timeout;
    const maxTerminals = draft.max_terminals !== undefined ? draft.max_terminals : company.max_terminals;
    const maxBankAccounts = draft.max_bank_accounts !== undefined ? draft.max_bank_accounts : company.max_bank_accounts;
    const licenseExpiresAt = draft.license_expires_at !== undefined ? draft.license_expires_at : company.license_expires_at;
    const customVerificationsLimit = draft.custom_verifications_limit !== undefined ? draft.custom_verifications_limit : company.custom_verifications_limit;
    
    // Skip passing features so it uses existing or updates based on tier
    const features = draft.features !== undefined ? draft.features : undefined;
    await updateCompany(company.id, company.status, tier, lockTimeout, maxTerminals, licenseExpiresAt, features, maxBankAccounts, customVerificationsLimit);
    
    // Clear draft
    setDrafts(prev => {
      const next = { ...prev };
      delete next[company.id];
      return next;
    });
  };

  const renderCompanyCard = (company: any) => {
    const adminUser = company.users?.find((u: any) => u.role === 'company_admin') || company.users?.[0];
    const draft = drafts[company.id] || {};
    
    const currentTier = draft.subscription_tier !== undefined ? draft.subscription_tier : company.subscription_tier;
    const currentLockTimeout = draft.lock_timeout !== undefined ? draft.lock_timeout : company.lock_timeout;
    const currentMaxTerminals = draft.max_terminals !== undefined ? draft.max_terminals : company.max_terminals;
    const currentMaxBankAccounts = draft.max_bank_accounts !== undefined ? draft.max_bank_accounts : company.max_bank_accounts;
    const currentLicenseExpiresAt = draft.license_expires_at !== undefined ? draft.license_expires_at : company.license_expires_at;
    const currentCustomVerificationsLimit = draft.custom_verifications_limit !== undefined ? draft.custom_verifications_limit : (company.custom_verifications_limit ?? '');
    
    const hasChanges = Object.keys(draft).length > 0;

    return (
      <div key={company.id} className="glass-panel p-6 border border-white/10 hover:border-white/20 transition-all flex flex-col gap-6 bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-xl rounded-2xl shadow-xl text-left relative overflow-hidden group">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
        
        {/* Header: Company Name & Status */}
        <div className="flex flex-wrap justify-between items-center gap-4 border-b border-white/10 pb-4 relative z-10">
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
                  <span>Verifications Used: <strong className="text-emerald-400 font-mono">{company.verifications_count ?? company.verifications_used ?? 0}</strong></span>
                  <span className="text-zinc-700">•</span>
                  <span>Last Activity: <strong className="text-zinc-300 font-mono">{company.last_activity_at ? new Date(company.last_activity_at).toLocaleString() : 'None'}</strong></span>
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
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold shadow-lg ${
              company.status === 'active' 
                ? 'bg-green-900/40 text-green-300 border border-green-500/30' 
                : company.status === 'suspended'
                  ? 'bg-orange-900/40 text-orange-300 border border-orange-500/30'
                  : company.status === 'archived'
                    ? 'bg-zinc-800/80 text-zinc-400 border border-zinc-700'
                    : 'bg-yellow-900/40 text-yellow-300 border border-yellow-500/30'
            }`}>
              {company.status === 'pending' ? 'PENDING APPROVAL' : company.status.toUpperCase()}
            </span>

            {/* Actions */}
            {company.status !== 'active' && (
              <button 
                onClick={() => updateCompany(company.id, 'active', currentTier || subscriptionPlans[0]?.tier_key || 'free_plan', currentLockTimeout, currentMaxTerminals, currentLicenseExpiresAt, company.features, currentMaxBankAccounts, currentCustomVerificationsLimit)}
                className="btn btn-success text-xs py-1.5 px-3 flex items-center gap-1.5 font-semibold"
              >
                Activate
              </button>
            )}
            {company.status !== 'suspended' && (
              <button 
                onClick={() => updateCompany(company.id, 'suspended', currentTier || subscriptionPlans[0]?.tier_key || 'free_plan', currentLockTimeout, currentMaxTerminals, currentLicenseExpiresAt, company.features, currentMaxBankAccounts, currentCustomVerificationsLimit)}
                className="btn btn-outline text-xs py-1.5 px-3 border-orange-500/50 text-orange-400 hover:bg-orange-500/10 font-semibold"
              >
                Suspend
              </button>
            )}
            {company.status !== 'archived' && (
              <button 
                onClick={() => updateCompany(company.id, 'archived', currentTier || subscriptionPlans[0]?.tier_key || 'free_plan', currentLockTimeout, currentMaxTerminals, currentLicenseExpiresAt, company.features, currentMaxBankAccounts, currentCustomVerificationsLimit)}
                className="btn btn-outline text-xs py-1.5 px-3 border-zinc-500/50 text-zinc-400 hover:bg-zinc-500/10 font-semibold"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 relative z-10">
          {/* Subscription Plan/Tier Selector */}
          <div className="input-group col-span-2 xl:col-span-1">
            <label className="input-label flex items-center gap-1">
              Subscription Tier
              <Tooltip text="Billing plan selection controlling account limits and default features." />
            </label>
            <select 
              className="input-field w-full text-sm font-medium bg-black/40 border-white/10"
              value={currentTier}
              onChange={(e) => handleDraftChange(company.id, 'subscription_tier', e.target.value)}
            >
              {subscriptionPlans.map(plan => (
                <option key={plan.id} value={plan.tier_key}>
                  {plan.name} - MVR {plan.price} ({plan.max_terminals} {plan.max_terminals === 1 ? 'Terminal' : 'Terminals'})
                </option>
              ))}
            </select>
          </div>
          
          {/* Plan Expiry Date */}
          <div className="input-group col-span-2 xl:col-span-1">
            <label className="input-label flex items-center gap-1">
              Plan Expiry Date
            </label>
            <input 
              type="date"
              className="input-field w-full text-sm font-medium bg-black/40 border-white/10"
              value={currentLicenseExpiresAt ? new Date(currentLicenseExpiresAt).toISOString().split('T')[0] : ''}
              onChange={(e) => handleDraftChange(company.id, 'license_expires_at', e.target.value || null)}
            />
          </div>

          {/* Verifications Count */}
          <div className="input-group">
            <label className="input-label flex items-center gap-1">
              Verifications (Used)
            </label>
            <div className="input-field bg-black/40 flex items-center justify-between text-sm font-mono opacity-80 cursor-not-allowed select-none border-white/10">
              <span>{company.verifications_count}</span>
            </div>
          </div>
          
          {/* Custom Verifications Limit */}
          <div className="input-group">
            <label className="input-label flex items-center gap-1">
              Custom Verif. Limit
              <Tooltip text="Overrides the plan's default verification limit. Leave empty for default." />
            </label>
            <input 
              type="number"
              min="0"
              placeholder="Default"
              className="input-field text-sm font-mono w-full bg-black/40 border-white/10"
              value={currentCustomVerificationsLimit}
              onChange={(e) => {
                const val = e.target.value === '' ? null : parseInt(e.target.value);
                handleDraftChange(company.id, 'custom_verifications_limit', val);
              }}
            />
          </div>

          {/* Max Terminals limit */}
          <div className="input-group">
            <label className="input-label flex items-center gap-1">
              Terminals Limit
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="number"
                min="1"
                className="input-field text-sm font-mono text-center w-24 bg-black/40 border-white/10"
                value={currentMaxTerminals ?? 1}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) handleDraftChange(company.id, 'max_terminals', val);
                }}
              />
              <span className="text-xs text-zinc-400 font-mono">({company.terminals?.length ?? 0} active)</span>
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
                className="input-field text-sm font-mono text-center w-24 bg-black/40 border-white/10"
                value={currentLockTimeout ?? 20}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) handleDraftChange(company.id, 'lock_timeout', val);
                }}
              />
              <span className="text-xs text-zinc-400 font-mono">seconds</span>
            </div>
          </div>
          {/* Max Bank Accounts limit */}
          <div className="input-group">
            <label className="input-label flex items-center gap-1">
              Accounts Limit
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="number"
                min="1"
                className="input-field text-sm font-mono text-center w-24 bg-black/40 border-white/10"
                value={currentMaxBankAccounts ?? 1}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) handleDraftChange(company.id, 'max_bank_accounts', val);
                }}
              />
              <span className="text-xs text-zinc-400 font-mono">({company.bank_accounts?.length ?? 0} active)</span>
            </div>
          </div>
        
          {/* Custom Feature Overrides Section */}
          <div className="col-span-full border-t border-white/10 pt-4 mt-2 text-left relative z-10">
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
                { key: 'reports_enabled', label: 'Reports & Analytics' },
                { key: 'statement_enabled', label: 'Bank Statements Generator' },
                { key: 'custom_recent_tx_limit', label: 'Configurable Recent Tx Count' }
              ].map(f => {
                const currentFeatures = draft.features !== undefined ? draft.features : (company.features || {});
                const isChecked = currentFeatures[f.key] ?? false;
                return (
                  <label key={f.key} className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer hover:text-white select-none">
                    <div className="relative inline-flex items-center shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={isChecked}
                        onChange={(e) => {
                          const updatedFeatures = {
                            ...currentFeatures,
                            [f.key]: e.target.checked
                          };
                          handleDraftChange(company.id, 'features', updatedFeatures);
                        }}
                      />
                      <div className="w-8 h-4 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500"></div>
                    </div>
                    <span>{f.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Terminals list sub-section inside card */}
        <div className="bg-black/35 rounded-xl border border-white/10 p-4 relative z-10 mt-6">
          <h4 className="text-sm font-bold text-zinc-300 mb-3 flex items-center gap-2">
            <MonitorSmartphone size={16} className="text-zinc-400" />
            Terminal Instances ({company.terminals?.length ?? 0})
          </h4>
          {company.terminals && company.terminals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {company.terminals.map((term: any) => {
                const showVbtl = term.permissions?.show_vbtl ?? false;
                return (
                  <div key={term.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/5 border border-white/10 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-xs text-white truncate" title={term.terminal_name}>
                        {term.terminal_name}
                      </span>
                      <span className="text-[10px] bg-black/50 text-zinc-400 px-1.5 py-0.5 rounded font-mono shrink-0 border border-white/5">
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
        <div className="bg-black/35 rounded-xl border border-white/10 p-4 mt-4 relative z-10 mb-6">
          <h4 className="text-sm font-bold text-zinc-300 mb-3 flex items-center gap-2">
            <Database size={16} className="text-zinc-400" />
            Bank Accounts & Session Locks ({company.bank_accounts?.length ?? 0})
          </h4>
          {company.bank_accounts && company.bank_accounts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {company.bank_accounts.map((acct: any) => {
                return (
                  <div key={acct.id} className="flex flex-col gap-2 p-3 bg-white/5 border border-white/10 rounded-lg text-xs">
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-semibold text-white">
                        {acct.bank_name} ({acct.account_number})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-zinc-500 italic text-xs py-1">No bank accounts linked to this company.</p>
          )}
        </div>

        {/* Footer: Save Button */}
        {hasChanges && (
          <div className="flex justify-end pt-4 border-t border-white/10 relative z-10 animate-fade-in-up">
            <button 
              onClick={() => handleSaveCompanyChanges(company)}
              className="btn btn-primary px-6 py-2 shadow-lg shadow-blue-500/20"
            >
              Save Changes
            </button>
          </div>
        )}
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
                  { key: 'reports_enabled', label: 'Reports & Analytics' },
                  { key: 'statement_enabled', label: 'Bank Statements Generator' },
                  { key: 'custom_recent_tx_limit', label: 'Configurable Recent Tx Count' }
                ].map(f => {
                  const isChecked = (planForm.features as any)[f.key] ?? false;
                  return (
                    <label key={f.key} className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer hover:text-white select-none">
                      <div className="relative inline-flex items-center shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
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
                        <div className="w-8 h-4 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 border border-white/10 peer-checked:border-emerald-500"></div>
                      </div>
                      <span>{f.label}</span>
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
                        reports_enabled: false,
                        statement_enabled: false,
                        custom_recent_tx_limit: false
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
                        reports_enabled: plan.features?.reports_enabled ?? false,
                        statement_enabled: plan.features?.statement_enabled ?? false,
                        custom_recent_tx_limit: plan.features?.custom_recent_tx_limit ?? false
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
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const historicalPayments = payments.filter(p => p.status !== 'pending');

    return (
      <div className="space-y-8 animate-fade-in text-left">
        <div className="glass-panel p-4 sm:p-6 border border-zinc-800 bg-black/20 rounded-2xl shadow-xl">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <CreditCard className="text-yellow-500" size={20} />
            Pending Payment Approvals ({pendingPayments.length})
          </h3>
          
          {paymentsLoading ? (
            <div className="text-center text-zinc-500 py-10 font-medium">Loading payments...</div>
          ) : pendingPayments.length === 0 ? (
            <div className="text-center text-zinc-500 italic py-10 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/10">
              No pending payment submissions.
            </div>
          ) : (
            <div>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
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
                    {pendingPayments.map((pay: any) => (
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

              {/* Mobile Stacked Card View */}
              <div className="block md:hidden space-y-3">
                {pendingPayments.map((pay: any) => (
                  <div key={pay.id} className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 shadow-md space-y-2.5 text-xs">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <div className="font-bold text-white text-sm">{pay.tenant?.name || 'Unknown'}</div>
                      <span className="font-mono font-bold text-yellow-400 text-sm">MVR {parseFloat(pay.amount).toFixed(2)}</span>
                    </div>

                    <div className="space-y-1 font-mono text-[11px]">
                      <div className="text-zinc-300"><span className="text-zinc-500 font-sans">Ref #:</span> {pay.reference_number}</div>
                      <div className="text-zinc-500 text-[10px]"><span className="font-sans">Submitted:</span> {new Date(pay.created_at).toLocaleString()}</div>
                      {pay.remarks && <div className="text-zinc-400 text-[10px] italic"><span className="font-sans font-normal text-zinc-500">Remarks:</span> {pay.remarks}</div>}
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                      <button
                        onClick={() => setShowSlipPreview(pay.receipt_slip_path)}
                        className="text-blue-400 hover:text-blue-300 underline font-semibold text-xs flex items-center gap-1"
                      >
                        View Slip Image
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedPayment(pay);
                            setApproveTier(pay.tenant?.subscription_tier || '499');
                            const defaultExpiry = new Date();
                            defaultExpiry.setDate(defaultExpiry.getDate() + 30);
                            setApproveExpiry(defaultExpiry.toISOString().split('T')[0]);
                            setShowApprovalModal(true);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-3 rounded-lg text-xs"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPayment(pay);
                            setShowRejectionModal(true);
                          }}
                          className="bg-red-950/40 hover:bg-red-900 border border-red-500/30 text-red-300 font-bold py-1.5 px-3 rounded-lg text-xs"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="glass-panel p-4 sm:p-6 border border-zinc-800 bg-black/20 rounded-2xl shadow-xl">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <ClipboardList className="text-zinc-500" size={20} />
            Payment History Log ({historicalPayments.length})
          </h3>
          
          {historicalPayments.length === 0 ? (
            <div className="text-center text-zinc-600 italic py-10">
              No historical payment entries found.
            </div>
          ) : (
            <div>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
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
                    {historicalPayments.map((pay: any) => (
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

              {/* Mobile Stacked Card View */}
              <div className="block md:hidden space-y-3">
                {historicalPayments.map((pay: any) => (
                  <div key={pay.id} className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 shadow-md space-y-2 text-xs">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <span className="font-semibold text-white">{pay.tenant?.name || 'Unknown'}</span>
                      <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                        pay.status === 'approved' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {pay.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="text-zinc-200 font-bold">MVR {parseFloat(pay.amount).toFixed(2)}</span>
                      <span className="text-zinc-500 text-[10px]">{new Date(pay.created_at).toLocaleDateString()}</span>
                    </div>

                    <div className="text-[10px] font-mono text-zinc-400">Ref #: {pay.reference_number}</div>

                    <div className="pt-1 flex items-center justify-between gap-2 border-t border-zinc-800/60">
                      <button
                        onClick={() => setShowSlipPreview(pay.receipt_slip_path)}
                        className="text-blue-400 hover:text-blue-300 underline font-semibold text-xs"
                      >
                        View Receipt
                      </button>
                      {pay.remarks && <span className="text-zinc-500 text-[10px] italic truncate max-w-[150px]">{pay.remarks}</span>}
                    </div>
                  </div>
                ))}
              </div>
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
              {/* Terminal Operation Mode */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-bold text-white block">Terminal Operation Mode</label>
                  <span className="text-xs text-blue-500 font-mono font-bold bg-blue-500/10 px-2 py-0.5 rounded uppercase">
                    {systemSettings.find(s => s.key === 'terminal_operation_mode')?.value || 'auto'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  Force all clients to operate in a specific terminal mode regardless of concurrent activity.
                </p>
                <select
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  value={systemSettings.find(s => s.key === 'terminal_operation_mode')?.value || 'auto'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!systemSettings.find(s => s.key === 'terminal_operation_mode')) {
                        setSystemSettings(prev => [...prev, { id: Date.now(), key: 'terminal_operation_mode', value: val, type: 'string' }]);
                    } else {
                        setSystemSettings(prev => prev.map(s => s.key === 'terminal_operation_mode' ? { ...s, value: val } : s));
                    }
                  }}
                >
                  <option value="auto">Auto (Dynamically elected based on activity)</option>
                  <option value="single">Single Terminal (Bypass Shared Caching)</option>
                  <option value="multi">Multi-Terminal (Force Shared Caching)</option>
                </select>
              </div>

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
                    setSystemSettings(prev => {
                      const exists = prev.some(s => s.key === 'session_log_poll_interval');
                      if (exists) {
                        return prev.map(s => s.key === 'session_log_poll_interval' ? { ...s, value: val } : s);
                      } else {
                        return [...prev, { key: 'session_log_poll_interval', value: val }];
                      }
                    });
                  }}
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                  <span>5s</span>
                  <span>120s</span>
                </div>
              </div>

              {/* Debug API Payloads */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-bold text-white block">Debug API Payloads</label>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    (systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === '1' || systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === true) 
                      ? 'text-emerald-400 bg-emerald-500/10' 
                      : 'text-zinc-400 bg-zinc-800'
                  }`}>
                    {(systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === '1' || systemSettings.find(s => s.key === 'debug_log_mib_html')?.value === true) ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                  When enabled, the companion browser extension will output the raw JSON API payloads received from BML and MIB into the superadmin logs chunk-by-chunk for debugging purposes.
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

  const renderJsonHighlighted = (data: any) => {
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return <div className="text-zinc-500 italic text-xs py-2">No metadata available</div>;
    }
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const tokens = jsonStr.split(/("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"\s*:|"(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g);

    return (
      <pre className="text-xs font-mono bg-zinc-950/90 p-4 rounded-xl border border-zinc-800/80 overflow-x-auto max-w-full scrollbar-thin leading-relaxed shadow-inner">
        {tokens.map((token, i) => {
          if (!token) return null;
          if (/^".*":$/.test(token)) {
            return <span key={i} className="text-cyan-400 font-semibold">{token}</span>;
          } else if (/^"/.test(token)) {
            return <span key={i} className="text-emerald-300">{token}</span>;
          } else if (/^(true|false)$/.test(token)) {
            return <span key={i} className="text-amber-400 font-bold">{token}</span>;
          } else if (token === 'null') {
            return <span key={i} className="text-rose-400 font-bold">{token}</span>;
          } else if (/^-?\d+(?:\.\d+)?$/.test(token)) {
            return <span key={i} className="text-purple-400 font-medium">{token}</span>;
          }
          return <span key={i} className="text-zinc-400">{token}</span>;
        })}
      </pre>
    );
  };

  const renderSessionLogsTab = () => {
    const telemetry = sessionTelemetry || {};
    const groupedFlows = telemetry.grouped_flows || [];
    const hourlySpectrum = telemetry.hourly_spectrum || [];
    const terminalThroughput = telemetry.terminal_throughput || [];

    // Max hourly count for spectrum normalization
    const maxSpectrumCount = Math.max(1, ...hourlySpectrum.map((h: any) => h.count || 0));

    return (
      <div className="space-y-6 text-left animate-fade-in">
        {/* Header Controls Bar */}
        <div className="glass-panel p-5 border border-zinc-800 bg-black/20 rounded-2xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 flex items-center justify-center">
              <Activity size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">Session Activity & Telemetry Center</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Live terminal heartbeat, request throughput, error ratios, and 3-step request flow traces.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* View Mode Toggle Button Group */}
            <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl flex items-center gap-1">
              <button
                onClick={() => setSessionLogViewMode('grouped')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  sessionLogViewMode === 'grouped'
                    ? 'bg-yellow-500 text-black shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Layers size={13} /> Grouped Flows
              </button>
              <button
                onClick={() => setSessionLogViewMode('raw')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  sessionLogViewMode === 'raw'
                    ? 'bg-yellow-500 text-black shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ClipboardList size={13} /> Raw Stream
              </button>
            </div>

            {/* Refresh Button & Countdown */}
            <button
              onClick={() => {
                fetchSessionLogs(true);
                const intervalStr = systemSettings.find(s => s.key === 'session_log_poll_interval')?.value || '15';
                const iv = parseInt(intervalStr, 10);
                setLogRefreshInterval(iv);
                setLogRefreshCountdown(iv);
              }}
              disabled={logsLoading}
              className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 py-2 px-3 text-xs flex items-center gap-1.5 font-bold rounded-xl transition-all shadow-[0_0_12px_rgba(16,185,129,0.15)] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={13} className={logsLoading ? 'animate-spin' : ''} /> Refresh Telemetry
            </button>
            {logRefreshCountdown !== null && (
              <div className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-xl border border-zinc-800/80" title={`Auto-refreshes every ${logRefreshInterval}s (in ${logRefreshCountdown}s)`}>
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0"></div>
                <span className="text-xs text-zinc-400 font-mono font-bold">{String(logRefreshCountdown).padStart(2, '0')}s</span>
              </div>
            )}
          </div>
        </div>

        {/* Top Graphical Telemetry Cards (4 Stat Widgets) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Active Terminals Gauge */}
          <div className="bg-zinc-900/80 border border-zinc-800/80 p-5 rounded-2xl shadow-xl flex items-center justify-between relative overflow-hidden group hover:border-emerald-500/30 transition-all">
            <div className="space-y-1 z-10">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">Active Terminals</span>
              <div className="text-2xl font-extrabold font-mono text-white flex items-baseline gap-1.5">
                <span>{telemetry.active_terminals ?? activeTerminalsCount}</span>
                <span className="text-xs text-zinc-500 font-normal">/ {telemetry.total_terminals ?? activeTerminalsCount} total</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium pt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Heartbeat Active</span>
              </div>
            </div>
            {/* Donut Radial Ring */}
            <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path className="text-zinc-800" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path
                  className="text-emerald-400 transition-all duration-1000"
                  strokeDasharray={`${Math.round(((telemetry.active_terminals || 1) / Math.max(1, telemetry.total_terminals || 1)) * 100)}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-[10px] font-bold font-mono text-white">
                {Math.round(((telemetry.active_terminals || 1) / Math.max(1, telemetry.total_terminals || 1)) * 100)}%
              </span>
            </div>
          </div>

          {/* Card 2: Requests Per Hour (RPH) & Sparkline */}
          <div className="bg-zinc-900/80 border border-zinc-800/80 p-5 rounded-2xl shadow-xl flex flex-col justify-between relative overflow-hidden group hover:border-yellow-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Requests / Hour</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Live RPH</span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-extrabold font-mono text-white">{telemetry.rph_current ?? 0} <span className="text-xs text-zinc-400 font-normal">req/hr</span></div>
              <div className="text-[11px] text-zinc-400 font-mono mt-0.5">24h Total: <strong className="text-zinc-200">{telemetry.total_logs_24h ?? 0}</strong></div>
            </div>
            {/* Sparkline Graph */}
            <div className="h-8 w-full">
              <svg className="w-full h-full" viewBox="0 0 100 25" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="rphGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#eab308" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#eab308" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {hourlySpectrum.length > 1 && (
                  <>
                    <polygon
                      fill="url(#rphGrad)"
                      points={`0,25 ${hourlySpectrum.map((h: any, i: number) => `${(i / (hourlySpectrum.length - 1)) * 100},${25 - ((h.count || 0) / maxSpectrumCount) * 20}`).join(' ')} 100,25`}
                    />
                    <polyline
                      fill="none"
                      stroke="#eab308"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={hourlySpectrum.map((h: any, i: number) => `${(i / (hourlySpectrum.length - 1)) * 100},${25 - ((h.count || 0) / maxSpectrumCount) * 20}`).join(' ')}
                    />
                  </>
                )}
              </svg>
            </div>
          </div>

          {/* Card 3: Error Ratio (24h) */}
          <div className="bg-zinc-900/80 border border-zinc-800/80 p-5 rounded-2xl shadow-xl flex items-center justify-between relative overflow-hidden group hover:border-red-500/30 transition-all">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">Error Ratio (24h)</span>
              <div className="text-2xl font-extrabold font-mono text-white flex items-baseline gap-1">
                <span>{telemetry.error_ratio_24h ?? 0.0}%</span>
              </div>
              <div className="pt-1">
                {(telemetry.error_ratio_24h ?? 0) <= 2 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 size={11} /> Healthy (&lt; 2%)
                  </span>
                ) : (telemetry.error_ratio_24h ?? 0) <= 5 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <AlertTriangle size={11} /> Moderate (2-5%)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                    <AlertTriangle size={11} /> High Error Rate (&gt; 5%)
                  </span>
                )}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
              <Activity size={22} />
            </div>
          </div>

          {/* Card 4: Daily & Monthly Success Rates */}
          <div className="bg-zinc-900/80 border border-zinc-800/80 p-5 rounded-2xl shadow-xl flex items-center justify-between relative overflow-hidden group hover:border-cyan-500/30 transition-all">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">Success Rate</span>
              <div className="text-2xl font-extrabold font-mono text-emerald-400">
                {telemetry.success_rate_daily ?? 100}% <span className="text-xs font-sans text-zinc-500 font-normal">Daily</span>
              </div>
              <div className="text-[11px] font-mono text-cyan-400 pt-0.5">
                {telemetry.success_rate_monthly ?? 100}% <span className="text-zinc-500">Monthly</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 size={22} />
            </div>
          </div>
        </div>

        {/* 7-Day Weekly Trends (Daily Success Rate & Error Rate Line Graphs) */}
        {(() => {
          const weeklyTrends = telemetry.weekly_trends || [];
          if (weeklyTrends.length === 0) return null;

          const maxSuccess = 100;
          const minSuccess = Math.max(0, Math.min(...weeklyTrends.map((w: any) => w.success_rate)) - 5);

          const maxError = Math.max(5, Math.max(...weeklyTrends.map((w: any) => w.error_rate)) + 2);
          const minError = 0;

          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Card 1: 7-Day Daily Success Rate Trend Line Graph */}
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between hover:border-emerald-500/30 transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
                  <div>
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <TrendingUp size={16} className="text-emerald-400" />
                      <span>7-Day Daily Success Rate Trend</span>
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Daily API success percentage breakdown over the last 7 days.</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                    Current: {weeklyTrends[weeklyTrends.length - 1]?.success_rate ?? 100}%
                  </span>
                </div>

                {/* SVG Line Graph */}
                <div className="h-36 w-full relative pt-2 pb-6">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 300 80" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Area fill */}
                    <polygon
                      fill="url(#successGrad)"
                      points={`0,80 ${weeklyTrends.map((w: any, idx: number) => {
                        const x = (idx / (weeklyTrends.length - 1)) * 300;
                        const y = 80 - ((w.success_rate - minSuccess) / (maxSuccess - minSuccess)) * 70;
                        return `${x},${y}`;
                      }).join(' ')} 300,80`}
                    />

                    {/* Line path */}
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={weeklyTrends.map((w: any, idx: number) => {
                        const x = (idx / (weeklyTrends.length - 1)) * 300;
                        const y = 80 - ((w.success_rate - minSuccess) / (maxSuccess - minSuccess)) * 70;
                        return `${x},${y}`;
                      }).join(' ')}
                    />

                    {/* Data dots */}
                    {weeklyTrends.map((w: any, idx: number) => {
                      const x = (idx / (weeklyTrends.length - 1)) * 300;
                      const y = 80 - ((w.success_rate - minSuccess) / (maxSuccess - minSuccess)) * 70;
                      return (
                        <g key={idx} className="group cursor-pointer">
                          <circle cx={x} cy={y} r="4" className="fill-emerald-400 stroke-zinc-950 stroke-2 group-hover:r-6 transition-all" />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Day labels below chart */}
                  <div className="flex justify-between items-center pt-2 text-[10px] font-mono text-zinc-400">
                    {weeklyTrends.map((w: any, idx: number) => (
                      <div key={idx} className="text-center">
                        <span className="block font-bold text-zinc-300">{w.day}</span>
                        <span className="text-[9px] text-emerald-400 font-bold">{w.success_rate}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 2: 7-Day Daily Error Rate Trend Line Graph */}
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between hover:border-red-500/30 transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
                  <div>
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <TrendingUp size={16} className="text-rose-500 rotate-180" />
                      <span>7-Day Daily Error Rate Trend</span>
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Daily API failure & error percentage breakdown over the last 7 days.</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg">
                    Current: {weeklyTrends[weeklyTrends.length - 1]?.error_rate ?? 0}%
                  </span>
                </div>

                {/* SVG Line Graph */}
                <div className="h-36 w-full relative pt-2 pb-6">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 300 80" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Area fill */}
                    <polygon
                      fill="url(#errorGrad)"
                      points={`0,80 ${weeklyTrends.map((w: any, idx: number) => {
                        const x = (idx / (weeklyTrends.length - 1)) * 300;
                        const y = 80 - ((w.error_rate - minError) / (maxError - minError)) * 70;
                        return `${x},${y}`;
                      }).join(' ')} 300,80`}
                    />

                    {/* Line path */}
                    <polyline
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={weeklyTrends.map((w: any, idx: number) => {
                        const x = (idx / (weeklyTrends.length - 1)) * 300;
                        const y = 80 - ((w.error_rate - minError) / (maxError - minError)) * 70;
                        return `${x},${y}`;
                      }).join(' ')}
                    />

                    {/* Data dots */}
                    {weeklyTrends.map((w: any, idx: number) => {
                      const x = (idx / (weeklyTrends.length - 1)) * 300;
                      const y = 80 - ((w.error_rate - minError) / (maxError - minError)) * 70;
                      return (
                        <g key={idx} className="group cursor-pointer">
                          <circle cx={x} cy={y} r="4" className="fill-rose-500 stroke-zinc-950 stroke-2 group-hover:r-6 transition-all" />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Day labels below chart */}
                  <div className="flex justify-between items-center pt-2 text-[10px] font-mono text-zinc-400">
                    {weeklyTrends.map((w: any, idx: number) => (
                      <div key={idx} className="text-center">
                        <span className="block font-bold text-zinc-300">{w.day}</span>
                        <span className="text-[9px] text-rose-400 font-bold">{w.error_rate}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 3: 7-Day Average Request Duration Graph */}
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between hover:border-cyan-500/30 transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
                  <div>
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <Clock size={16} className="text-cyan-400" />
                      <span>7-Day Avg Request Duration (Overall)</span>
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Time from fetch request submitted to fulfilled (Fulfilled - Submitted).</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg">
                    Current: {weeklyTrends[weeklyTrends.length - 1]?.avg_request_duration ?? 0}s
                  </span>
                </div>

                {/* SVG Line Graph */}
                <div className="h-36 w-full relative pt-2 pb-6">
                  {(() => {
                    const reqVals = weeklyTrends.map((w: any) => w.avg_request_duration || 0);
                    const maxR = Math.max(5, ...reqVals) + 2;
                    const minR = 0;
                    return (
                      <>
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 300 80" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          <polygon
                            fill="url(#reqGrad)"
                            points={`0,80 ${weeklyTrends.map((w: any, idx: number) => {
                              const x = (idx / (weeklyTrends.length - 1)) * 300;
                              const y = 80 - (((w.avg_request_duration || 0) - minR) / (maxR - minR)) * 70;
                              return `${x},${y}`;
                            }).join(' ')} 300,80`}
                          />

                          <polyline
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={weeklyTrends.map((w: any, idx: number) => {
                              const x = (idx / (weeklyTrends.length - 1)) * 300;
                              const y = 80 - (((w.avg_request_duration || 0) - minR) / (maxR - minR)) * 70;
                              return `${x},${y}`;
                            }).join(' ')}
                          />

                          {weeklyTrends.map((w: any, idx: number) => {
                            const x = (idx / (weeklyTrends.length - 1)) * 300;
                            const y = 80 - (((w.avg_request_duration || 0) - minR) / (maxR - minR)) * 70;
                            return (
                              <g key={idx} className="group cursor-pointer">
                                <circle cx={x} cy={y} r="4" className="fill-cyan-400 stroke-zinc-950 stroke-2 group-hover:r-6 transition-all" />
                              </g>
                            );
                          })}
                        </svg>

                        <div className="flex justify-between items-center pt-2 text-[10px] font-mono text-zinc-400">
                          {weeklyTrends.map((w: any, idx: number) => (
                            <div key={idx} className="text-center">
                              <span className="block font-bold text-zinc-300">{w.day}</span>
                              <span className="text-[9px] text-cyan-400 font-bold">{w.avg_request_duration}s</span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Card 4: 7-Day Average Real API Time Graph */}
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between hover:border-amber-500/30 transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
                  <div>
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <Zap size={16} className="text-amber-400" />
                      <span>7-Day Avg Real API Execution Time</span>
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Execution duration measured inside PWA debug trace (Debug Trace end - start).</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                    Current: {weeklyTrends[weeklyTrends.length - 1]?.avg_real_api_time ?? 0}s
                  </span>
                </div>

                {/* SVG Line Graph */}
                <div className="h-36 w-full relative pt-2 pb-6">
                  {(() => {
                    const apiVals = weeklyTrends.map((w: any) => w.avg_real_api_time || 0);
                    const maxA = Math.max(5, ...apiVals) + 2;
                    const minA = 0;
                    return (
                      <>
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 300 80" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="apiGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          <polygon
                            fill="url(#apiGrad)"
                            points={`0,80 ${weeklyTrends.map((w: any, idx: number) => {
                              const x = (idx / (weeklyTrends.length - 1)) * 300;
                              const y = 80 - (((w.avg_real_api_time || 0) - minA) / (maxA - minA)) * 70;
                              return `${x},${y}`;
                            }).join(' ')} 300,80`}
                          />

                          <polyline
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={weeklyTrends.map((w: any, idx: number) => {
                              const x = (idx / (weeklyTrends.length - 1)) * 300;
                              const y = 80 - (((w.avg_real_api_time || 0) - minA) / (maxA - minA)) * 70;
                              return `${x},${y}`;
                            }).join(' ')}
                          />

                          {weeklyTrends.map((w: any, idx: number) => {
                            const x = (idx / (weeklyTrends.length - 1)) * 300;
                            const y = 80 - (((w.avg_real_api_time || 0) - minA) / (maxA - minA)) * 70;
                            return (
                              <g key={idx} className="group cursor-pointer">
                                <circle cx={x} cy={y} r="4" className="fill-amber-400 stroke-zinc-950 stroke-2 group-hover:r-6 transition-all" />
                              </g>
                            );
                          })}
                        </svg>

                        <div className="flex justify-between items-center pt-2 text-[10px] font-mono text-zinc-400">
                          {weeklyTrends.map((w: any, idx: number) => (
                            <div key={idx} className="text-center">
                              <span className="block font-bold text-zinc-300">{w.day}</span>
                              <span className="text-[9px] text-amber-400 font-bold">{w.avg_real_api_time}s</span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Activity Bar Chart & Terminal Throughput Distribution Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: 24-Hour Activity Bar Chart (2 cols) */}
          <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 mb-4">
              <div>
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Activity size={16} className="text-yellow-500" />
                  <span>24-Hour API Activity Spectrum</span>
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">Hourly breakdown of total API requests over the past 24 hours.</p>
              </div>
              <span className="text-xs font-mono text-zinc-400 font-bold bg-zinc-800 px-2.5 py-1 rounded-lg">
                Peak: {maxSpectrumCount} reqs/hr
              </span>
            </div>

            {/* Hourly SVG Bar Spectrum */}
            <div className="h-36 w-full flex items-end justify-between gap-1 pt-2">
              {hourlySpectrum.map((h: any, idx: number) => {
                const heightPercent = maxSpectrumCount > 0 ? Math.max(8, (h.count / maxSpectrumCount) * 100) : 8;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-8 bg-zinc-950 border border-zinc-700 text-white font-mono text-[10px] px-2 py-0.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                      {h.hour}: <strong>{h.count} reqs</strong>
                    </div>
                    {/* Bar graphic */}
                    <div className="w-full bg-zinc-800/50 rounded-t overflow-hidden flex items-end h-full">
                      <div
                        className="w-full bg-gradient-to-t from-yellow-500/40 via-yellow-500 to-emerald-400 rounded-t transition-all duration-500 group-hover:brightness-125"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    {/* Hour label */}
                    <span className="text-[9px] font-mono text-zinc-500 group-hover:text-zinc-300">
                      {idx % 4 === 0 ? h.hour : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Per-Terminal Request Distribution */}
          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
            <div className="pb-3 border-b border-zinc-800/80 mb-4">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <Terminal size={16} className="text-emerald-400" />
                <span>Top Terminals (24h Throughput)</span>
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5">Request volume per terminal.</p>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto">
              {terminalThroughput.length === 0 ? (
                <p className="text-xs text-zinc-500 italic py-6 text-center">No terminal throughput recorded yet.</p>
              ) : (
                terminalThroughput.map((t: any, idx: number) => {
                  const maxCount = Math.max(1, terminalThroughput[0]?.count || 1);
                  const pct = Math.min(100, Math.round((t.count / maxCount) * 100));
                  return (
                    <div key={idx} className="space-y-1 text-xs">
                      <div className="flex justify-between items-center text-zinc-300 font-medium">
                        <span className="truncate max-w-[140px]">{t.name}</span>
                        <span className="font-mono text-emerald-400 font-bold">{t.count} reqs</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* View Section: Grouped 3-Step Request Flow Cards vs Raw Event Log Stream */}
        {sessionLogViewMode === 'grouped' ? (
          /* SECTION 1: Grouped 3-Step Request Flow Cards (Last 10 Requests) */
          <div className="glass-panel p-6 border border-zinc-800 bg-black/30 rounded-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers size={18} className="text-yellow-500" />
                  <span>Recent Request Flow Cards (3-Step Sessions)</span>
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">Aggregated 3-step request sessions: (1) Submitted → (2) PWA Debug Log → (3) Fulfilled / Failed.</p>
              </div>
              <span className="text-xs font-mono font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 rounded-xl">
                Showing {groupedFlows.length} Grouped Sessions
              </span>
            </div>

            {logsLoading ? (
              <div className="text-center py-12 text-zinc-500 font-medium animate-pulse">Loading grouped request flows...</div>
            ) : groupedFlows.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 italic">No grouped session request flows available yet.</div>
            ) : (
              <div className="space-y-4">
                {groupedFlows.map((flow: any) => {
                  const isExpanded = expandedFlowId === flow.session_id;
                  const activeStepTab = activeFlowStepTabMap[flow.session_id] || 'submitted';
                  const isFailed = flow.status === 'failed';
                  const isNotFound = flow.status === 'not_found';

                  let statusBadge = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
                  let statusText = "SUCCESS ✅";
                  if (isFailed) {
                    statusBadge = "bg-red-500/15 text-red-400 border-red-500/30";
                    statusText = "FAILED ❌";
                  } else if (isNotFound) {
                    statusBadge = "bg-amber-500/15 text-amber-400 border-amber-500/30";
                    statusText = "NOT FOUND ⚠️";
                  } else if (flow.status === 'pending') {
                    statusBadge = "bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse";
                    statusText = "IN PROGRESS ⏳";
                  }

                  return (
                    <div
                      key={flow.session_id}
                      className={`bg-zinc-900/90 border rounded-2xl transition-all overflow-hidden ${
                        isExpanded ? 'border-yellow-500/40 shadow-2xl bg-zinc-900' : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {/* Flow Card Summary Header */}
                      <div
                        className="p-4 cursor-pointer flex flex-wrap items-center justify-between gap-3 hover:bg-white/5 transition-colors"
                        onClick={() => setExpandedFlowId(isExpanded ? null : flow.session_id)}
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className={`px-3 py-1 rounded-xl text-xs font-extrabold border ${statusBadge}`}>
                            {statusText}
                          </span>
                          <div>
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              <span>{flow.terminal_name}</span>
                              <span className="text-zinc-500 text-xs font-mono">({flow.tenant_name})</span>
                            </div>
                            <div className="text-xs text-zinc-400 font-mono mt-0.5">
                              {flow.bank_name} <span className="text-zinc-500">{flow.account_number_masked}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="text-right font-mono text-xs">
                            <span className="text-zinc-400 block">{new Date(flow.created_at).toLocaleString()}</span>
                            <div className="flex items-center justify-end gap-2 text-[11px] font-bold mt-0.5">
                              <span className="text-cyan-400">Req Time: {flow.duration}</span>
                              {flow.real_api_time && (
                                <span className="text-amber-400">| Real API: {flow.real_api_time}</span>
                              )}
                            </div>
                          </div>

                          <button
                            className="btn btn-outline text-xs px-3.5 py-1.5 flex items-center gap-1 font-bold rounded-xl border-zinc-700 text-zinc-300 hover:text-white"
                          >
                            <span>{isExpanded ? 'Collapse' : 'Inspect 3 Steps'}</span>
                            <ChevronDown size={14} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* Summary Banner */}
                      <div className="px-4 py-2 bg-black/40 border-t border-zinc-800/60 text-xs font-medium text-zinc-300 flex items-center gap-2">
                        <span className="text-zinc-500 font-mono font-bold">SUMMARY:</span>
                        <span className="truncate">{flow.summary}</span>
                      </div>

                      {/* Collapsible 3-Step Interactive Inspector Timeline */}
                      {isExpanded && (
                        <div className="p-4 border-t border-zinc-800 bg-zinc-950/60 space-y-4 animate-fade-in">
                          {/* 3-Step Timeline Visual Header */}
                          <div className="grid grid-cols-3 gap-2">
                            {/* Step 1 Button */}
                            <button
                              onClick={() => setActiveFlowStepTabMap(prev => ({ ...prev, [flow.session_id]: 'submitted' }))}
                              className={`p-3 rounded-xl border text-left transition-all ${
                                activeStepTab === 'submitted'
                                  ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 shadow-md'
                                  : flow.steps.submitted
                                  ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                                  : 'bg-zinc-900/40 border-zinc-900 text-zinc-600 cursor-not-allowed'
                              }`}
                            >
                              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Step 1: Submitted</div>
                              <div className="text-xs font-bold text-white mt-1 truncate">
                                {flow.steps.submitted ? flow.steps.submitted.event_type.replace(/_/g, ' ') : 'No Event'}
                              </div>
                            </button>

                            {/* Step 2 Button */}
                            <button
                              onClick={() => setActiveFlowStepTabMap(prev => ({ ...prev, [flow.session_id]: 'debug_logs' }))}
                              className={`p-3 rounded-xl border text-left transition-all ${
                                activeStepTab === 'debug_logs'
                                  ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300 shadow-md'
                                  : flow.steps.debug_logs
                                  ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                                  : 'bg-zinc-900/40 border-zinc-900 text-zinc-600 cursor-not-allowed'
                              }`}
                            >
                              <div className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">Step 2: PWA Debug Trace</div>
                              <div className="text-xs font-bold text-white mt-1 truncate">
                                {flow.steps.debug_logs ? 'PWA Session Trace' : 'No Debug Logs'}
                              </div>
                            </button>

                            {/* Step 3 Button */}
                            <button
                              onClick={() => setActiveFlowStepTabMap(prev => ({ ...prev, [flow.session_id]: 'result' }))}
                              className={`p-3 rounded-xl border text-left transition-all ${
                                activeStepTab === 'result'
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-md'
                                  : flow.steps.result
                                  ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                                  : 'bg-zinc-900/40 border-zinc-900 text-zinc-600 cursor-not-allowed'
                              }`}
                            >
                              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Step 3: Result</div>
                              <div className="text-xs font-bold text-white mt-1 truncate">
                                {flow.steps.result ? flow.steps.result.event_type.replace(/_/g, ' ') : 'No Result'}
                              </div>
                            </button>
                          </div>

                          {/* Selected Step Detail Panel */}
                          {(() => {
                            const currentStepObj = flow.steps[activeStepTab];
                            if (!currentStepObj) {
                              return <div className="text-xs text-zinc-500 italic p-4 text-center">No log record recorded for this step.</div>;
                            }

                            const logId = currentStepObj.id;
                            const currentDetail = logDetailsMap[logId] || currentStepObj.event_detail;
                            const isLoadingDetail = loadingDetailId === logId;

                            if (!logDetailsMap[logId] && currentStepObj.has_detail && !isLoadingDetail) {
                              // Trigger detail fetch
                              handleToggleDetail(logId);
                            }

                            return (
                              <div className="space-y-3 bg-black/60 p-4 rounded-xl border border-zinc-800">
                                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold font-mono text-white">Log #{logId}</span>
                                    <span className="text-xs text-zinc-400 font-mono">({new Date(currentStepObj.created_at).toLocaleString()})</span>
                                  </div>
                                  <span className="text-xs font-semibold text-zinc-300">{currentStepObj.summary}</span>
                                </div>

                                {isLoadingDetail ? (
                                  <div className="text-xs text-zinc-400 font-mono py-4 animate-pulse text-center">Loading step log details...</div>
                                ) : currentDetail && currentDetail.pwa_logs && currentDetail.pwa_logs.length > 0 ? (
                                  <div className="space-y-3">
                                    {Object.keys(currentDetail).filter(k => k !== 'pwa_logs').length > 0 && (
                                      <div>
                                        <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Payload & Parameters</div>
                                        {renderJsonHighlighted(Object.fromEntries(Object.entries(currentDetail).filter(([k]) => k !== 'pwa_logs')))}
                                      </div>
                                    )}
                                    <div>
                                      <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Terminal Execution Console Log</div>
                                      <div className="bg-[#0D0D0D] rounded-xl p-3 border border-zinc-800/80 font-mono text-[11px] text-[#4AF626] overflow-y-auto max-h-72 scrollbar-thin shadow-inner">
                                        {Array.isArray(currentDetail.pwa_logs)
                                          ? currentDetail.pwa_logs.map((line: string, i: number) => (
                                              <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">{line}</div>
                                            ))
                                          : <div className="whitespace-pre-wrap break-all leading-relaxed">{JSON.stringify(currentDetail.pwa_logs, null, 2)}</div>}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Event Details</div>
                                    {renderJsonHighlighted(currentDetail || { summary: currentStepObj.summary })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* SECTION 2: Raw Activity Log Stream (Full Historical List View) */
          <div className="glass-panel p-6 border border-zinc-800 bg-black/20 rounded-2xl text-left space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <ClipboardList size={18} className="text-yellow-500" />
                <span>Raw Activity Log Stream</span>
              </h4>

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
                  <option value="session_reused">Session Reused (Cached)</option>
                  <option value="session_created">Session Created</option>
                  <option value="session_renewed">Session Renewed</option>
                  <option value="fetch_request_submitted">Request Submitted</option>
                  <option value="fetch_request_fulfilled">Request Fulfilled</option>
                  <option value="fetch_request_failed">Request Failed</option>
                  <option value="fetch_request_retried">Request Retried</option>
                  <option value="pwa_debug_logs">PWA Debug Logs</option>
                </select>
              </div>
            </div>

            {logsLoading ? (
              <div className="text-center py-12 text-zinc-500 font-medium animate-pulse">Loading raw activity logs...</div>
            ) : sessionLogs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 italic">No session logs match your criteria.</div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
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
                        const hasDetail = Boolean(log.has_detail || log.event_detail);
                        const currentDetail = logDetailsMap[log.id] || log.event_detail;
                        const isLoadingDetail = loadingDetailId === log.id;

                        return (
                          <Fragment key={log.id}>
                            <tr
                              className={`transition-colors border-b border-zinc-900/50 ${hasDetail ? 'cursor-pointer hover:bg-zinc-800/25' : 'hover:bg-zinc-900/20'} ${isExpanded ? 'bg-zinc-850/40 border-b-0' : ''}`}
                              onClick={() => hasDetail && handleToggleDetail(log.id)}
                            >
                              <td className="py-3 pr-4 font-mono text-zinc-400">{dateStr}</td>
                              <td className="py-3 pr-4 font-medium text-white">
                                {log.terminal_name || "System"}
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
                                  {hasDetail && (
                                    <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                                      {isLoadingDetail ? 'Loading...' : isExpanded ? 'Hide Details' : 'View Details'}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-zinc-950/20 border-b border-zinc-900">
                                <td colSpan={5} className="p-4">
                                  {isLoadingDetail ? (
                                    <div className="text-xs text-zinc-400 font-mono py-4 animate-pulse text-center">Loading log details...</div>
                                  ) : currentDetail && currentDetail.pwa_logs && currentDetail.pwa_logs.length > 0 ? (
                                    <div className="flex flex-col gap-4">
                                      {Object.keys(currentDetail).filter(k => k !== 'pwa_logs').length > 0 && (
                                        <div>
                                          <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1.5 px-1">Event Details</div>
                                          {renderJsonHighlighted(Object.fromEntries(Object.entries(currentDetail).filter(([k]) => k !== 'pwa_logs')))}
                                        </div>
                                      )}
                                      <div>
                                        <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1.5 px-1">Terminal Session Logs</div>
                                        <div className="bg-[#0D0D0D] rounded-lg p-3.5 border border-zinc-800/80 font-mono text-[11px] text-[#4AF626] overflow-y-auto scrollbar-thin max-h-96 shadow-inner">
                                          {Array.isArray(currentDetail.pwa_logs)
                                            ? currentDetail.pwa_logs.map((line: string, i: number) => (
                                                <div key={i} className="whitespace-pre leading-relaxed">{line}</div>
                                              ))
                                            : <div className="whitespace-pre leading-relaxed">{JSON.stringify(currentDetail.pwa_logs, null, 2)}</div>}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1.5 px-1">Event Details</div>
                                      {renderJsonHighlighted(currentDetail || {})}
                                    </div>
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

                {/* Mobile Stacked Card View */}
                <div className="block md:hidden space-y-3">
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
                    const hasDetail = Boolean(log.has_detail || log.event_detail);
                    const isLoadingDetail = loadingDetailId === log.id;

                    return (
                      <div key={log.id} className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 shadow-md space-y-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                          <span className="font-mono text-[10px] text-zinc-400">{dateStr}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}`}>
                            {log.event_type === 'search_not_found' ? 'SEARCH NOT FOUND!' : log.event_type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                        <div className="text-zinc-300 bg-black/40 p-2 rounded-lg border border-zinc-800/50 text-[11px] leading-relaxed">
                          {log.event_summary}
                        </div>
                        {hasDetail && (
                          <button
                            onClick={() => handleToggleDetail(log.id)}
                            className="w-full text-center py-1.5 px-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold"
                          >
                            {isLoadingDetail ? 'Loading Details...' : isExpanded ? 'Hide Details' : 'View Log Details'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Interactive Multi-Option Pagination Controls */}
                <div className="flex flex-wrap items-center justify-between border-t border-zinc-800 pt-4 mt-2 gap-3 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="btn btn-outline text-xs px-3 py-1.5 font-bold rounded-lg disabled:opacity-40 cursor-pointer"
                      disabled={logsPage === 1}
                      onClick={() => setLogsPage(prev => Math.max(prev - 1, 1))}
                    >
                      &larr; Previous
                    </button>

                    {/* Direct Page Select Dropdown */}
                    <div className="flex items-center gap-1.5 font-mono text-zinc-400">
                      <span>Page</span>
                      <select
                        value={logsPage}
                        onChange={(e) => setLogsPage(Number(e.target.value))}
                        className="bg-zinc-900 border border-zinc-800 text-yellow-400 font-bold font-mono rounded-lg px-2.5 py-1 text-xs outline-none focus:border-yellow-500/50 cursor-pointer"
                      >
                        {Array.from({ length: logsTotalPages }, (_, i) => i + 1).map(p => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <span>of <strong className="text-zinc-200">{logsTotalPages}</strong></span>
                    </div>

                    <button
                      className="btn btn-outline text-xs px-3 py-1.5 font-bold rounded-lg disabled:opacity-40 cursor-pointer"
                      disabled={logsPage === logsTotalPages}
                      onClick={() => setLogsPage(prev => Math.min(prev + 1, logsTotalPages))}
                    >
                      Next &rarr;
                    </button>
                  </div>

                  {/* Direct Jump Input */}
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-zinc-500 text-[11px]">Jump to page:</span>
                    <input
                      type="number"
                      min={1}
                      max={logsTotalPages}
                      value={logsPage}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= logsTotalPages) {
                          setLogsPage(val);
                        }
                      }}
                      className="w-16 bg-zinc-900 border border-zinc-800 text-yellow-400 font-mono font-bold text-center rounded-lg px-2 py-1 text-xs focus:border-yellow-500/50 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderDebugLogLine = (line: string, i: number) => {
    if (!line) return null;
    const isError = line.includes('error') || line.includes('ERROR') || line.includes('Failed') || line.includes('FAILED');

    const jsonStartIdx = line.search(/[{\[]/);
    if (jsonStartIdx !== -1) {
      const prefix = line.substring(0, jsonStartIdx).trim();
      const potentialJson = line.substring(jsonStartIdx).trim();
      try {
        const parsed = JSON.parse(potentialJson);
        return (
          <div key={i} className="my-2 bg-zinc-950/90 p-3 rounded-lg border border-zinc-800/80">
            {prefix && <div className={`text-xs font-mono mb-1.5 font-bold ${isError ? 'text-red-400' : 'text-zinc-400'}`}>{prefix}</div>}
            {renderJsonHighlighted(parsed)}
          </div>
        );
      } catch (e) {
        // Fallback to standard line
      }
    }

    return (
      <div key={i} className={`whitespace-pre-wrap break-all ${isError ? 'text-red-400 font-semibold' : 'text-emerald-400'}`}>
        {line}
      </div>
    );
  };

  const renderTerminalDebugLogsTab = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Terminal Debug Logs</h2>
            <p className="text-xs text-zinc-500 mt-1">View PWA/extension debug logs uploaded by active terminals.</p>
          </div>
          <button
            onClick={fetchTerminalDebugLogs}
            disabled={terminalDebugLogsLoading}
            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 py-1.5 px-3.5 text-xs flex items-center gap-1.5 font-semibold rounded-lg transition-all shadow-[0_0_12px_rgba(16,185,129,0.15)] disabled:opacity-50"
            title="Refresh debug logs"
          >
            <RefreshCw size={12} className={terminalDebugLogsLoading ? 'animate-spin' : ''} />
            Refresh Debug Logs
          </button>
        </div>

        {terminalDebugError && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>{terminalDebugError}</span>
            <button onClick={() => { setTerminalDebugError(null); fetchTerminalDebugLogs(); }} className="ml-auto text-red-300 hover:text-red-200 underline">Retry</button>
          </div>
        )}

        {selectedDebugTerminal && selectedDebugTerminalLogs ? (
          <div className="space-y-4">
            <button onClick={() => { setSelectedDebugTerminal(null); setSelectedDebugTerminalLogs(null); }} className="text-xs text-yellow-500 hover:text-yellow-400 mb-2 flex items-center gap-1">
              <ArrowLeft size={12} /> Back to terminal list
            </button>
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Terminal size={16} />
                {selectedDebugTerminalLogs.terminal_name}
                <span className="text-[10px] text-zinc-500 font-mono">({selectedDebugTerminalLogs.hardware_id})</span>
              </h3>
              <p className="text-xs text-zinc-500 mt-1">{selectedDebugTerminalLogs.tenant_name}</p>
            </div>

            {selectedDebugTerminalLogs.runs && selectedDebugTerminalLogs.runs.length > 0 ? (
              <>
                {selectedDebugTerminalLogs.runs.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {selectedDebugTerminalLogs.runs.map((run: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedDebugRunIdx(idx)}
                        className={`text-xs px-3 py-1 rounded-md font-mono transition-all ${idx === selectedDebugRunIdx ? 'bg-yellow-500 text-black font-bold' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                      >
                        Run #{idx + 1}
                        <span className="block text-[9px] text-zinc-500">{run.timestamp?.replace('T', ' ')?.substring(0, 19) || 'unknown'}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="bg-black border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-xs text-zinc-400 ml-2 font-mono">
                      {selectedDebugTerminalLogs.runs[selectedDebugRunIdx]?.timestamp?.replace('T', ' ')?.substring(0, 19) || 'Unknown timestamp'}
                    </span>
                  </div>
                  <div className="p-4 font-mono text-xs text-green-400 h-96 overflow-y-auto flex flex-col gap-1 scrollbar-thin">
                    {(selectedDebugTerminalLogs.runs[selectedDebugRunIdx]?.logs || []).map((line: string, i: number) => (
                      renderDebugLogLine(line, i)
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-500 italic">No log runs available for this terminal.</p>
            )}
          </div>
        ) : terminalDebugLogsLoading ? (
          <div className="text-center py-12 text-zinc-500 font-medium animate-pulse">Loading terminal debug logs...</div>
        ) : terminalDebugLogs.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 italic">No terminals have uploaded debug logs yet.</div>
        ) : (
          <div className="space-y-4">
            {/* Desktop Table View (Large screens) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-semibold">
                    <th className="pb-3 pr-4">Terminal</th>
                    <th className="pb-3 pr-4">Tenant</th>
                    <th className="pb-3 pr-4">Hardware ID</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Runs</th>
                    <th className="pb-3 pr-4">Last Run</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {terminalDebugLogs.map((t: any) => (
                    <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                      <td className="py-3 pr-4 font-medium text-white">{t.terminal_name}</td>
                      <td className="py-3 pr-4 text-zinc-400">{t.tenant_name}</td>
                      <td className="py-3 pr-4 text-zinc-500 font-mono text-[10px]">{t.hardware_id}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${t.status === 'active' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'}`}>{t.status}</span>
                      </td>
                      <td className="py-3 pr-4 text-zinc-300 font-mono">{t.log_runs}</td>
                      <td className="py-3 pr-4 text-zinc-500 text-[10px] font-mono">{t.last_run_at?.replace('T', ' ')?.substring(0, 19) || '—'}</td>
                      <td className="py-3">
                        <button onClick={() => fetchTerminalDebugLogDetail(t.id)} className="text-yellow-500 hover:text-yellow-400 text-xs font-bold">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Card View (Zero Horizontal Scroll on Small Screens) */}
            <div className="block md:hidden space-y-3">
              {terminalDebugLogs.map((t: any) => (
                <div key={t.id} className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 shadow-md space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                    <div className="font-bold text-white text-sm flex items-center gap-1.5">
                      <Terminal size={14} className="text-yellow-500 shrink-0" />
                      <span>{t.terminal_name}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${t.status === 'active' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'}`}>
                      {t.status}
                    </span>
                  </div>

                  <div className="space-y-1 font-mono text-[11px]">
                    <div className="text-zinc-300"><span className="text-zinc-500 font-sans">Tenant:</span> {t.tenant_name}</div>
                    <div className="text-zinc-400 text-[10px] break-all"><span className="text-zinc-500 font-sans">HW ID:</span> {t.hardware_id}</div>
                    <div className="flex justify-between text-zinc-400 text-[10px] pt-1">
                      <span>Runs: <strong className="text-white">{t.log_runs}</strong></span>
                      <span>Last: <strong className="text-zinc-300">{t.last_run_at?.replace('T', ' ')?.substring(0, 16) || '—'}</strong></span>
                    </div>
                  </div>

                  <button
                    onClick={() => fetchTerminalDebugLogDetail(t.id)}
                    className="w-full text-center py-2 px-3 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-lg text-xs font-bold hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Terminal size={13} /> View Terminal Debug Logs
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOverviewTab = () => {
    const activeCompanies = companies.filter((c: any) => c.status !== 'archived');
    const pendingCompanies = activeCompanies.filter((c: any) => c.status === 'pending');
    const expiredCompanies = activeCompanies.filter((c: any) => c.license_expires_at && new Date(c.license_expires_at).getTime() < Date.now());
    const expiringSoonCompanies = activeCompanies.filter((c: any) => {
      if (!c.license_expires_at) return false;
      const t = new Date(c.license_expires_at).getTime();
      return t >= Date.now() && t <= Date.now() + 7 * 86400000;
    });

    const filteredOverview = activeCompanies.filter((c: any) => {
      const adminUser = c.users?.find((u: any) => u.role === 'company_admin') || c.users?.[0];
      const matchesSearch = !overviewSearch || 
        c.name?.toLowerCase().includes(overviewSearch.toLowerCase()) ||
        adminUser?.email?.toLowerCase().includes(overviewSearch.toLowerCase()) ||
        (adminUser?.phone_number && adminUser.phone_number.includes(overviewSearch));
      const matchesStatus = overviewStatusFilter === 'all' || c.status === overviewStatusFilter;
      return matchesSearch && matchesStatus;
    });

    // Priority sorting:
    // 1. Pending approval companies AT THE VERY TOP
    // 2. Shortest plan expiry date first (expired & nearest expiring dates at top)
    const sortedOverview = [...filteredOverview].sort((a: any, b: any) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;

      const dateA = a.license_expires_at ? new Date(a.license_expires_at).getTime() : Infinity;
      const dateB = b.license_expires_at ? new Date(b.license_expires_at).getTime() : Infinity;
      return dateA - dateB;
    });

    return (
      <div className="space-y-6 animate-fade-in pb-12">
        {/* Top Telemetry KPI Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center gap-4 bg-white/5 backdrop-blur-xl">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <Building2 size={22} />
            </div>
            <div>
              <div className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Registered Companies</div>
              <div className="text-2xl font-bold font-mono text-white mt-0.5">{activeCompanies.length}</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Total registered tenants</div>
            </div>
          </div>

          <div className={`glass-panel p-4 rounded-2xl border flex items-center gap-4 backdrop-blur-xl transition-all ${
            pendingCompanies.length > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/10'
          }`}>
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 relative">
              <Clock size={22} />
              {pendingCompanies.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full animate-ping"></span>
              )}
            </div>
            <div>
              <div className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Pending Approvals</div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-0.5">{pendingCompanies.length}</div>
              <div className="text-[10px] text-amber-300 font-semibold mt-0.5">Prioritized at top of list</div>
            </div>
          </div>

          <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center gap-4 bg-white/5 backdrop-blur-xl">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle size={22} />
            </div>
            <div>
              <div className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Expired Plans</div>
              <div className="text-2xl font-bold font-mono text-red-400 mt-0.5">{expiredCompanies.length}</div>
              <div className="text-[10px] text-red-300 mt-0.5">Past license expiration</div>
            </div>
          </div>

          <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center gap-4 bg-white/5 backdrop-blur-xl">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 shrink-0">
              <Clock size={22} />
            </div>
            <div>
              <div className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Expiring &lt; 7 Days</div>
              <div className="text-2xl font-bold font-mono text-yellow-400 mt-0.5">{expiringSoonCompanies.length}</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Due for license renewal</div>
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white/5">
          <div className="relative flex-1 max-w-md w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search companies by name, email, or phone..."
              value={overviewSearch}
              onChange={(e) => setOverviewSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500/50"
            />
            {overviewSearch && (
              <button onClick={() => setOverviewSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={overviewStatusFilter}
              onChange={(e) => setOverviewStatusFilter(e.target.value)}
              className="bg-black/40 border border-white/10 text-xs text-white px-3 py-2 rounded-xl focus:outline-none focus:border-yellow-500/50 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Approval Only</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
            </select>
          </div>
        </div>

        {/* Overview Companies Container */}
        <div className="glass-panel p-3 sm:p-5 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {/* Desktop Table View (Large screens) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400 uppercase tracking-wider font-semibold text-[10px]">
                  <th className="py-3 px-4">Company & Admin Details</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <span>Verifications Used</span>
                      <Tooltip text="A Verification is counted when a cashier verifies a bank transfer or claims a deposit sale on a terminal." />
                    </div>
                  </th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4">Subscription Plan</th>
                  <th className="py-3 px-4">Plan Expiry Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-zinc-300">
                {sortedOverview.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-500 italic">
                      No registered companies found.
                    </td>
                  </tr>
                ) : (
                  sortedOverview.map((company: any) => {
                    const adminUser = company.users?.find((u: any) => u.role === 'company_admin') || company.users?.[0];
                    const isPending = company.status === 'pending';
                    const hasExpiry = !!company.license_expires_at;
                    const expiryTime = hasExpiry ? new Date(company.license_expires_at).getTime() : Infinity;
                    const daysRemaining = hasExpiry ? Math.ceil((expiryTime - Date.now()) / (1000 * 3600 * 24)) : null;
                    const isExpired = daysRemaining !== null && daysRemaining < 0;
                    const isExpiringSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7;

                    return (
                      <tr 
                        key={company.id} 
                        className={`transition-colors ${
                          isPending ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-white/5'
                        }`}
                      >
                        {/* Company Details */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            {company.name}
                            <span className="text-[10px] text-zinc-500 font-mono font-normal">#{company.id}</span>
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono">
                            <span>{adminUser?.email || 'No admin email'}</span>
                            {adminUser?.phone_number && (
                              <>
                                <span className="text-zinc-600">•</span>
                                <span>{adminUser.phone_number}</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold animate-pulse">
                              <Clock size={13} />
                              PENDING APPROVAL 🔔
                            </span>
                          ) : company.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                              <CheckCircle2 size={13} />
                              Active
                            </span>
                          ) : company.status === 'suspended' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-semibold">
                              Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-800 text-zinc-400 border border-zinc-700 text-xs font-semibold">
                              {company.status}
                            </span>
                          )}
                        </td>

                        {/* Verifications Used */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                          <div className="flex items-center gap-1.5 text-zinc-200 font-bold" title="A Verification is counted when a cashier verifies a bank transfer or claims a deposit sale on a terminal.">
                            <CheckCircle2 size={13} className="text-emerald-400" />
                            <span>{company.verifications_count ?? company.verifications_used ?? 0}</span>
                            {company.custom_verifications_limit ? (
                              <span className="text-zinc-500 text-[10px]">/ {company.custom_verifications_limit}</span>
                            ) : (
                              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-sans font-normal">Unlimited</span>
                            )}
                          </div>
                        </td>

                        {/* Last Activity */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                          {company.last_activity_at ? (
                            <div className="flex flex-col">
                              <span className="text-zinc-200 font-medium">
                                {new Date(company.last_activity_at).toLocaleDateString()}
                              </span>
                              <span className="text-[10px] text-zinc-400">
                                {new Date(company.last_activity_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-zinc-500 italic">No activity yet</span>
                          )}
                        </td>

                        {/* Subscription Plan */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs font-medium uppercase font-mono">
                            {company.subscription_tier || 'free'}
                          </span>
                        </td>

                        {/* Plan Expiry Date & Countdown */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                          {isPending ? (
                            <span className="text-amber-400 font-semibold italic">Awaiting Approval</span>
                          ) : isExpired ? (
                            <span className="inline-flex items-center gap-1 text-red-400 font-bold bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">
                              <AlertTriangle size={12} />
                              Expired {Math.abs(daysRemaining!)}d ago ({new Date(company.license_expires_at).toLocaleDateString()})
                            </span>
                          ) : isExpiringSoon ? (
                            <span className="inline-flex items-center gap-1 text-yellow-400 font-bold bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded">
                              <Clock size={12} />
                              Expires in {daysRemaining}d ({new Date(company.license_expires_at).toLocaleDateString()})
                            </span>
                          ) : hasExpiry ? (
                            <span className="text-zinc-300">
                              {new Date(company.license_expires_at).toLocaleDateString()} (in {daysRemaining}d)
                            </span>
                          ) : (
                            <span className="text-zinc-500 italic">No Expiry Set</span>
                          )}
                        </td>

                        {/* Edit Settings Action */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSingleCompanyFilterId(company.id);
                              setActiveTab('companies');
                            }}
                            className="btn btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10 font-bold ml-auto"
                          >
                            <Edit size={13} />
                            Edit Settings
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Card View (Zero Horizontal Scroll on Small Screens) */}
          <div className="block md:hidden space-y-3">
            {sortedOverview.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 italic text-xs">
                No registered companies found.
              </div>
            ) : (
              sortedOverview.map((company: any) => {
                const adminUser = company.users?.find((u: any) => u.role === 'company_admin') || company.users?.[0];
                const isPending = company.status === 'pending';
                const hasExpiry = !!company.license_expires_at;
                const expiryTime = hasExpiry ? new Date(company.license_expires_at).getTime() : Infinity;
                const daysRemaining = hasExpiry ? Math.ceil((expiryTime - Date.now()) / (1000 * 3600 * 24)) : null;
                const isExpired = daysRemaining !== null && daysRemaining < 0;
                const isExpiringSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7;

                return (
                  <div 
                    key={company.id} 
                    className={`p-3.5 rounded-xl border transition-all text-xs space-y-3 ${
                      isPending ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-900/90 border-zinc-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2">
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-2">
                          <span>{company.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono font-normal">#{company.id}</span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                          <div>{adminUser?.email || 'No admin email'}</div>
                          {adminUser?.phone_number && <div className="text-zinc-500 text-[10px]">{adminUser.phone_number}</div>}
                        </div>
                      </div>
                      <div>
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold animate-pulse">
                            <Clock size={11} /> PENDING
                          </span>
                        ) : company.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">
                            <CheckCircle2 size={11} /> Active
                          </span>
                        ) : company.status === 'suspended' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] font-semibold">
                            Suspended
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px] font-semibold">
                            {company.status}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-black/40 p-2 rounded-lg border border-zinc-800/40">
                        <span className="text-zinc-500 text-[10px] block uppercase font-bold">Verifications</span>
                        <span className="font-mono text-zinc-200 font-bold text-xs flex items-center gap-1 mt-0.5">
                          <CheckCircle2 size={12} className="text-emerald-400" />
                          {company.verifications_count ?? company.verifications_used ?? 0}
                          {company.custom_verifications_limit ? `/ ${company.custom_verifications_limit}` : ''}
                        </span>
                      </div>

                      <div className="bg-black/40 p-2 rounded-lg border border-zinc-800/40">
                        <span className="text-zinc-500 text-[10px] block uppercase font-bold">Plan</span>
                        <span className="font-semibold text-zinc-200 text-xs block mt-0.5 font-mono uppercase">
                          {company.subscription_tier || 'free'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] bg-black/40 p-2 rounded-lg border border-zinc-800/50">
                      <span className="text-zinc-400 font-medium">Plan Expiry:</span>
                      {isPending ? (
                        <span className="text-amber-400 font-semibold italic text-[11px]">Awaiting Approval</span>
                      ) : isExpired ? (
                        <span className="inline-flex items-center gap-1 text-red-400 font-bold bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded text-[10px]">
                          <AlertTriangle size={11} /> Expired {Math.abs(daysRemaining!)}d ago
                        </span>
                      ) : isExpiringSoon ? (
                        <span className="inline-flex items-center gap-1 text-yellow-400 font-bold bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded text-[10px]">
                          <Clock size={11} /> Expires in {daysRemaining}d
                        </span>
                      ) : hasExpiry ? (
                        <span className="text-zinc-300 font-mono text-[11px]">
                          {new Date(company.license_expires_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-zinc-500 italic text-[11px]">No Expiry Set</span>
                      )}
                    </div>

                    <div className="pt-1 text-right">
                      <button
                        onClick={() => {
                          setSingleCompanyFilterId(company.id);
                          setActiveTab('companies');
                        }}
                        className="w-full text-center py-2 px-3 bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 rounded-lg text-xs font-bold hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Edit size={13} /> Manage Company & Settings
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
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
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <img src="/logo_en.png" alt="Viri Logo" className="h-9 md:h-12 object-contain" />
              <span className="text-[var(--text-secondary)] text-sm md:text-lg font-normal border-l border-zinc-700 pl-3">Superadmin Portal</span>
            </h1>
            <p className="text-xs md:text-sm text-[var(--text-secondary)]">Manage tenant subscriptions and approvals</p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <button
              onClick={toggleTheme}
              title={`Current Theme: ${theme.toUpperCase()}. Click to rotate.`}
              className="btn btn-outline py-2 px-3 text-xs md:text-sm flex items-center gap-2 capitalize"
            >
              {theme === 'dark' && <Moon size={15} className="text-indigo-400" />}
              {theme === 'light' && <Sun size={15} className="text-amber-400" />}
              {theme === 'corporate' && <Briefcase size={15} className="text-blue-400" />}
              {theme === 'cute' && <Sparkles size={15} className="text-pink-400" />}
              <span className="hidden sm:inline">{theme}</span>
            </button>
            <button onClick={handleRefresh} className="btn btn-outline py-2 px-3 text-xs md:text-sm flex items-center gap-2">
              <RefreshCw size={15} /> <span className="hidden sm:inline">Refresh</span>
            </button>
            <button onClick={handleLogout} className="btn btn-outline py-2 px-3 text-xs md:text-sm flex items-center gap-2">
              <LogOut size={15} /> <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Responsive Mobile View Selector (Visible on small screens < md) */}
        <div className="md:hidden mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
            Portal View Section
          </label>
          <div className="relative">
            <select
              value={activeTab}
              onChange={(e) => {
                const val = e.target.value as any;
                setActiveTab(val);
                if (val === 'credentials') fetchCredentials();
              }}
              className="w-full bg-zinc-900 border border-zinc-700 text-white font-bold text-sm px-4 py-3 rounded-xl appearance-none focus:outline-none focus:border-yellow-500 shadow-lg pr-10"
            >
              <option value="overview">
                ⚡ Overview & Expiries {companies.filter(c => c.status === 'pending').length > 0 ? `(${companies.filter(c => c.status === 'pending').length} PENDING)` : ''}
              </option>
              <option value="companies">
                🏢 Registered Companies ({companies.filter(c => c.status !== 'archived').length})
              </option>
              <option value="archived">
                📦 Archived Companies ({companies.filter(c => c.status === 'archived').length})
              </option>
              <option value="tiers">
                💳 Subscription Tiers ({subscriptionPlans.length})
              </option>
              <option value="logs">
                📋 Session Activity Log
              </option>
              <option value="terminalDebug">
                📡 Terminal Debug Logs
              </option>
              <option value="settings">
                ⚙️ App Configuration
              </option>
              <option value="payments">
                💰 Payment Receipts {pendingPaymentsCount > 0 ? `(${pendingPaymentsCount} PENDING)` : ''}
              </option>
              <option value="credentials">
                🔑 Credentials Inspector
              </option>
            </select>
            <ChevronDown size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-yellow-500 pointer-events-none" />
          </div>
        </div>

        {/* Navigation Tabs (Responsive: Mobile Dropdown on < md, Clean Flex Wrap Row on Desktop without Scrollbar) */}
        <div className="hidden md:flex flex-wrap border-b border-zinc-800 mb-6 gap-1.5 pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 relative ${
              activeTab === 'overview'
                ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10 rounded-t-xl'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-t-xl'
            }`}
          >
            <Activity size={15} className="shrink-0" />
            <span>Overview & Expiries</span>
            {companies.filter(c => c.status === 'pending').length > 0 && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500 text-black rounded-full leading-none shrink-0 animate-pulse">
                {companies.filter(c => c.status === 'pending').length} PENDING
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('companies')}
            className={`px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'companies'
                ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10 rounded-t-xl'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-t-xl'
            }`}
          >
            <Building2 size={15} className="shrink-0" />
            <span>Registered Companies ({companies.filter(c => c.status !== 'archived').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'archived'
                ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10 rounded-t-xl'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-t-xl'
            }`}
          >
            <Archive size={15} className="shrink-0" />
            <span>Archived ({companies.filter(c => c.status === 'archived').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('tiers')}
            className={`px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'tiers'
                ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10 rounded-t-xl'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-t-xl'
            }`}
          >
            <Layers size={15} className="shrink-0" />
            <span>Tiers ({subscriptionPlans.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'logs'
                ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10 rounded-t-xl'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-t-xl'
            }`}
          >
            <ClipboardList size={15} className="shrink-0" />
            <span>Session Logs</span>
          </button>
          <button
            onClick={() => setActiveTab('terminalDebug')}
            className={`px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'terminalDebug'
                ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10 rounded-t-xl'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-t-xl'
            }`}
          >
            <Activity size={15} className="shrink-0" />
            <span>Debug Logs</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'settings'
                ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10 rounded-t-xl'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-t-xl'
            }`}
          >
            <Settings size={15} className="shrink-0" />
            <span>App Config</span>
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 relative ${
              activeTab === 'payments'
                ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10 rounded-t-xl'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-t-xl'
            }`}
          >
            <CreditCard size={15} className="shrink-0" />
            <span>Payments</span>
            {pendingPaymentsCount > 0 && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-600 text-white rounded-full leading-none shrink-0 animate-pulse">
                {pendingPaymentsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('credentials'); fetchCredentials(); }}
            className={`px-3.5 py-2 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'credentials'
                ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10 rounded-t-xl'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-t-xl'
            }`}
          >
            <Key size={15} className="shrink-0" />
            <span>Credentials</span>
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
          {activeTab === 'overview' && renderOverviewTab()}

          {activeTab === 'companies' && (() => {
            const displayedCompanies = singleCompanyFilterId 
              ? companies.filter(c => c.id === singleCompanyFilterId)
              : companies.filter(c => c.status !== 'archived');

            return (
              <>
                {singleCompanyFilterId && (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-center justify-between text-xs text-amber-300 mb-2">
                    <span className="flex items-center gap-2 font-medium">
                      <Info size={16} />
                      Showing single company settings for <strong>#{singleCompanyFilterId} ({companies.find(c => c.id === singleCompanyFilterId)?.name})</strong>
                    </span>
                    <button
                      onClick={() => setSingleCompanyFilterId(null)}
                      className="btn btn-outline text-xs px-3 py-1.5 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 font-bold"
                    >
                      Show All Companies
                    </button>
                  </div>
                )}

                {displayedCompanies.length === 0 ? (
                  <div className="glass-panel p-8 text-center text-zinc-500 italic bg-black/20 rounded-2xl border border-zinc-850">
                    No active registered companies found.
                  </div>
                ) : (
                  <>
                    {displayedCompanies.map(company => renderCompanyCard(company))}
                    
                    {!singleCompanyFilterId && (
                      <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/10 mt-4">
                        <button 
                          onClick={() => setCompaniesPage(prev => Math.max(prev - 1, 1))}
                          disabled={companiesPage === 1}
                          className="btn btn-outline text-xs px-4 py-1.5"
                        >
                          Previous
                        </button>
                        <span className="text-sm text-zinc-400">Page {companiesPage} of {companiesTotalPages}</span>
                        <button 
                          onClick={() => setCompaniesPage(prev => Math.min(prev + 1, companiesTotalPages))}
                          disabled={companiesPage === companiesTotalPages}
                          className="btn btn-outline text-xs px-4 py-1.5"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            );
          })()}

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

          {activeTab === 'terminalDebug' && renderTerminalDebugLogsTab()}

          {activeTab === 'settings' && renderSystemSettingsTab()}

          {activeTab === 'payments' && renderPaymentsTab()}

          {activeTab === 'debug' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Stored Credentials Debug</h2>
                <button onClick={fetchDebugInfo} className="btn btn-outline text-sm" disabled={debugLoading}>
                  <RefreshCw size={14} className={`mr-1 ${debugLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              {debugData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="glass-panel p-5 border border-zinc-800 rounded-xl">
                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                      <Server size={16} className="text-emerald-400" />
                      MIB Device Keys ({debugData.total_mib_keys})
                    </h3>
                    {debugData.mib_keys.length === 0 ? (
                      <p className="text-zinc-500 text-sm italic">No MIB keys stored.</p>
                    ) : (
                      <div className="space-y-3">
                        {debugData.mib_keys.map((key: any) => (
                          <div key={key.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-xs font-mono">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <div><span className="text-zinc-500">Account:</span> <span className="text-zinc-300">{key.account_name || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">Terminal:</span> <span className="text-zinc-300">{key.terminal_name || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">MIB Username:</span> <span className="text-zinc-300">{key.mib_username || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">App ID:</span> <span className="text-zinc-300">{key.app_id || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">Key1:</span> <span className="text-zinc-300">{key.key1_prefix || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">Key2:</span> <span className="text-zinc-300">{key.key2_prefix || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">Obtained:</span> <span className="text-zinc-300">{key.obtained_at || 'N/A'}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="glass-panel p-5 border border-zinc-800 rounded-xl">
                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                      <Database size={16} className="text-blue-400" />
                      BML OAuth Tokens ({debugData.total_bml_tokens})
                    </h3>
                    {debugData.bml_tokens.length === 0 ? (
                      <p className="text-zinc-500 text-sm italic">No BML tokens stored.</p>
                    ) : (
                      <div className="space-y-3">
                        {debugData.bml_tokens.map((token: any) => (
                          <div key={token.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-xs font-mono">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <div><span className="text-zinc-500">Account:</span> <span className="text-zinc-300">{token.account_name || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">Terminal:</span> <span className="text-zinc-300">{token.terminal_name || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">BML Username:</span> <span className="text-zinc-300">{token.bml_username || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">Device ID:</span> <span className="text-zinc-300">{token.device_id || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">Token Type:</span> <span className="text-zinc-300">{token.token_type || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">Last Grant:</span> <span className="text-zinc-300">{token.last_grant || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">Has Access Token:</span> <span className={token.has_access_token ? 'text-emerald-400' : 'text-red-400'}>{token.has_access_token ? 'Yes' : 'No'}</span></div>
                              <div><span className="text-zinc-500">Has Refresh Token:</span> <span className={token.has_refresh_token ? 'text-emerald-400' : 'text-red-400'}>{token.has_refresh_token ? 'Yes' : 'No'}</span></div>
                              <div><span className="text-zinc-500">Expires:</span> <span className="text-zinc-300">{token.expires_at || 'N/A'}</span></div>
                              <div><span className="text-zinc-500">Obtained:</span> <span className="text-zinc-300">{token.obtained_at || 'N/A'}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'credentials' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Key size={22} className="text-yellow-400" />
                    Credential Inspector
                  </h2>
                  <p className="text-sm text-zinc-400 mt-1">
                    View all stored bank credentials across the platform and test their validity against bank APIs.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openInjectModal('bml')} className="btn btn-outline text-sm border-amber-700/40 text-amber-400 hover:bg-amber-900/30">
                    <Plus size={14} className="mr-1" />
                    Inject Credentials
                  </button>
                  <button onClick={fetchCredentials} className="btn btn-outline text-sm" disabled={credsLoading}>
                    <RefreshCw size={14} className={`mr-1 ${credsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* BML Credential Groups */}
              <div className="glass-panel p-5 border border-zinc-800 rounded-xl">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Database size={16} className="text-blue-400" />
                  BML OAuth Credentials ({credsData?.total_bml ?? 0})
                </h3>
                {!credsData ? (
                  <p className="text-zinc-500 text-sm italic">Click Refresh to load credentials.</p>
                ) : credsData.bml_groups.length === 0 ? (
                  <p className="text-zinc-500 text-sm italic">No BML credential groups stored.</p>
                ) : (
                  <div className="space-y-4">
                    {credsData.bml_groups.map((group: any) => {
                      const testKey = `bml-${group.id}`;
                      const testResult = credsTestResults[testKey];
                      return (
                        <div key={group.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Tenant:</span>
                              <span className="text-zinc-300 ml-1">{group.tenant_name || 'N/A'}</span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Terminal:</span>
                              <span className="text-zinc-300 ml-1">{group.terminal_name || 'N/A'}</span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">BML Username:</span>
                              <span className="text-zinc-300 ml-1">{group.bml_username || 'N/A'}</span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Profile:</span>
                              <span className="text-zinc-300 ml-1">{group.profile_type}</span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Device ID:</span>
                              <span className="text-zinc-300 ml-1">{group.device_id || 'N/A'}</span>
                            </div>
                            <div className="text-xs font-mono col-span-1 md:col-span-3">
                              <span className="text-zinc-500">Token:</span>
                              <span className={group.has_access_token ? 'text-emerald-400' : 'text-red-400'}>
                                {group.has_access_token ? 'Yes' : 'No'}
                              </span>
                              <span className="text-zinc-500 mx-1">/</span>
                              <span className="text-zinc-500">Refresh:</span>
                              <span className={group.has_refresh_token ? 'text-emerald-400' : 'text-red-400'}>
                                {group.has_refresh_token ? 'Yes' : 'No'}
                              </span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Expires:</span>
                              <span className={group.expired ? 'text-red-400' : 'text-emerald-400'}>
                                {group.expires_at ? new Date(group.expires_at).toLocaleString() : 'N/A'}
                              </span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Obtained:</span>
                              <span className="text-zinc-300">{group.obtained_at ? new Date(group.obtained_at).toLocaleString() : 'N/A'}</span>
                            </div>
                          </div>

                          {/* Linked accounts */}
                          {group.linked_accounts?.length > 0 && (
                            <div className="mb-3 text-xs">
                              <span className="text-zinc-500">Linked Accounts:</span>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {group.linked_accounts.map((acc: any) => (
                                  <span key={acc.id} className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-300">
                                    {acc.bank_name} {acc.account_number} ({acc.account_name})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Token values */}
                          <div className="mb-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <button onClick={() => toggleReveal(`bml-${group.id}-at`)} className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded font-mono transition-colors">
                                {revealedCreds[`bml-${group.id}-at`] ? 'Hide' : 'Show'} Access Token
                              </button>
                              {group.has_access_token && revealedCreds[`bml-${group.id}-at`] && (
                                <button onClick={() => navigator.clipboard.writeText(group.access_token)} className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono transition-colors">
                                  Copy
                                </button>
                              )}
                            </div>
                            {revealedCreds[`bml-${group.id}-at`] && (
                              <div className="bg-black/40 border border-zinc-800 rounded p-2">
                                <pre className="text-[10px] text-zinc-300 font-mono whitespace-pre-wrap break-all leading-relaxed">{group.access_token || <span className="text-zinc-600 italic">No access token stored</span>}</pre>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button onClick={() => toggleReveal(`bml-${group.id}-rt`)} className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded font-mono transition-colors">
                                {revealedCreds[`bml-${group.id}-rt`] ? 'Hide' : 'Show'} Refresh Token
                              </button>
                              {group.has_refresh_token && revealedCreds[`bml-${group.id}-rt`] && (
                                <button onClick={() => navigator.clipboard.writeText(group.refresh_token)} className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono transition-colors">
                                  Copy
                                </button>
                              )}
                            </div>
                            {revealedCreds[`bml-${group.id}-rt`] && (
                              <div className="bg-black/40 border border-zinc-800 rounded p-2">
                                <pre className="text-[10px] text-zinc-300 font-mono whitespace-pre-wrap break-all leading-relaxed">{group.refresh_token || <span className="text-zinc-600 italic">No refresh token stored</span>}</pre>
                              </div>
                            )}
                          </div>

                          {/* Test / Renew buttons + result */}
                          <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => testCredential('bml', group.id)}
                                disabled={credsTestingId === testKey}
                                className="btn btn-outline text-xs border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/30"
                              >
                                <Shield size={12} className="mr-1" />
                                {credsTestingId === testKey ? 'Testing...' : 'Test BML Token'}
                              </button>
                              <button
                                onClick={() => renewBmlToken(group.id)}
                                disabled={credsTestingId === `bml-renew-${group.id}`}
                                className="btn btn-outline text-xs border-blue-700/40 text-blue-400 hover:bg-blue-900/30"
                              >
                                <RefreshCw size={12} className={`mr-1 ${credsTestingId === `bml-renew-${group.id}` ? 'animate-spin' : ''}`} />
                                {credsTestingId === `bml-renew-${group.id}` ? 'Renewing...' : 'Renew Token'}
                              </button>
                              <button
                                onClick={() => openCloneModal(group)}
                                className="btn btn-outline text-xs border-purple-700/40 text-purple-400 hover:bg-purple-900/30"
                              >
                                <Copy size={12} className="mr-1" />
                                Clone to Account
                              </button>
                            </div>
                            {testResult && !testResult.loading && (
                              <div className="space-y-1 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className={testResult.valid ? 'text-emerald-400' : 'text-red-400'}>
                                    {testResult.valid ? 'Valid' : 'Invalid'}
                                  </span>
                                  {testResult.token_expired && (
                                    <span className="text-red-400 font-semibold">(Expired)</span>
                                  )}
                                  {testResult.error && (
                                    <span className="text-red-400">{testResult.error}</span>
                                  )}
                                  {testResult.results?.mobile_dashboard?.response?.status_code && (
                                    <span className="text-zinc-500">
                                      Dashboard: {testResult.results.mobile_dashboard.response.status_code}
                                    </span>
                                  )}
                                  {testResult.results?.sample_history?.response?.status_code && (
                                    <span className="text-zinc-500">
                                      History: {testResult.results.sample_history.response.status_code}
                                    </span>
                                  )}
                                </div>
                                {/* View Raw Communication toggle */}
                                <button
                                  onClick={() => toggleCredComm(testKey)}
                                  className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded font-mono transition-colors"
                                >
                                  {openCredComm[testKey] ? 'Hide' : 'View'} Raw Communication
                                </button>
                                {openCredComm[testKey] && testResult.results && (
                                  <div className="space-y-3">
                                    {Object.entries(testResult.results).map(([callName, callData]: [string, any]) => (
                                      <div key={callName} className="bg-black/40 border border-zinc-800 rounded p-3 space-y-2">
                                        <h4 className="text-[11px] font-bold text-yellow-500 uppercase tracking-wider">{callName.replace(/_/g, ' ')}</h4>
                                        {callData.request && (
                                          <div>
                                            <div className="text-[10px] text-zinc-500 mb-1">Request</div>
                                            <div className="bg-black/60 rounded p-2 font-mono text-[10px] text-zinc-300 space-y-0.5">
                                              <div><span className="text-blue-400">{callData.request.method}</span> {callData.request.url}</div>
                                              {callData.request.headers && Object.entries(callData.request.headers).map(([hk, hv]: [string, any]) => (
                                                <div key={hk} className="text-zinc-500"><span className="text-zinc-400">{hk}:</span> {hv}</div>
                                              ))}
                                              {callData.request.body && (
                                                <div className="mt-1 pt-1 border-t border-zinc-800 whitespace-pre-wrap break-all">{callData.request.body}</div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {callData.response && (
                                          <div>
                                            <div className="text-[10px] text-zinc-500 mb-1">Response</div>
                                            <div className="bg-black/60 rounded p-2 font-mono text-[10px]">
                                              <div className="text-zinc-400">Status: <span className={callData.response.success ? 'text-emerald-400' : 'text-red-400'}>{callData.response.status_code || 'Error'}</span></div>
                                              {callData.response.error && (
                                                <div className="text-red-400 mt-1">Error: {callData.response.error}</div>
                                              )}
                                              {callData.response.body && (
                                                <div className="mt-1 max-h-60 overflow-y-auto">
                                                  <pre className="text-green-400/80 whitespace-pre-wrap break-all leading-relaxed">
                                                    {callData.response.body_truncated ? callData.response.body.substring(0, 5000) + '\n... (truncated)' : callData.response.body}
                                                  </pre>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Renew token result */}
                            {(() => {
                              const renewKey = `bml-renew-${group.id}`;
                              const renewResult = credsTestResults[renewKey];
                              if (!renewResult || renewResult.loading) return null;
                              return (
                                <div className="space-y-1 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className={renewResult.renewed ? 'text-emerald-400' : 'text-red-400'}>
                                      {renewResult.renewed ? 'Token Renewed' : 'Renew Failed'}
                                    </span>
                                    {renewResult.error && <span className="text-red-400">{renewResult.error}</span>}
                                  </div>
                                  {/* Renew Raw Communication toggle */}
                                  <button
                                    onClick={() => toggleCredComm(renewKey)}
                                    className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded font-mono transition-colors"
                                  >
                                    {openCredComm[renewKey] ? 'Hide' : 'View'} Renew Communication
                                  </button>
                                  {openCredComm[renewKey] && renewResult.debug && (
                                    <div className="bg-black/40 border border-zinc-800 rounded p-3 space-y-2">
                                      <h4 className="text-[11px] font-bold text-yellow-500 uppercase tracking-wider">Token Renewal</h4>
                                      {renewResult.debug.request && (
                                        <div>
                                          <div className="text-[10px] text-zinc-500 mb-1">Request</div>
                                          <div className="bg-black/60 rounded p-2 font-mono text-[10px] text-zinc-300 space-y-0.5">
                                            <div><span className="text-blue-400">{renewResult.debug.request.method}</span> {renewResult.debug.request.url}</div>
                                            {renewResult.debug.request.headers && Object.entries(renewResult.debug.request.headers).map(([hk, hv]: [string, any]) => (
                                              <div key={hk} className="text-zinc-500"><span className="text-zinc-400">{hk}:</span> {String(hv)}</div>
                                            ))}
                                            {renewResult.debug.request.body && (
                                              <div className="mt-1 pt-1 border-t border-zinc-800 whitespace-pre-wrap break-all text-zinc-400">{renewResult.debug.request.body}</div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      {renewResult.debug.response && (
                                        <div>
                                          <div className="text-[10px] text-zinc-500 mb-1">Response</div>
                                          <div className="bg-black/60 rounded p-2 font-mono text-[10px]">
                                            <div className="text-zinc-400">Status: <span className={renewResult.renewed ? 'text-emerald-400' : 'text-red-400'}>{renewResult.debug.response.status_code || 'Error'}</span></div>
                                            {renewResult.debug.response.error && (
                                              <div className="text-red-400 mt-1">Error: {renewResult.debug.response.error}</div>
                                            )}
                                            {renewResult.debug.response.body && (
                                              <div className="mt-1 max-h-60 overflow-y-auto">
                                                <pre className="text-green-400/80 whitespace-pre-wrap break-all leading-relaxed">
                                                  {renewResult.debug.response.body_truncated ? renewResult.debug.response.body.substring(0, 5000) + '\n... (truncated)' : renewResult.debug.response.body}
                                                </pre>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* MIB Credential Groups */}
              <div className="glass-panel p-5 border border-zinc-800 rounded-xl">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Server size={16} className="text-emerald-400" />
                  MIB Device Key Credentials ({credsData?.total_mib ?? 0})
                </h3>
                {!credsData ? (
                  <p className="text-zinc-500 text-sm italic">Click Refresh to load credentials.</p>
                ) : credsData.mib_groups.length === 0 ? (
                  <p className="text-zinc-500 text-sm italic">No MIB credential groups stored.</p>
                ) : (
                  <div className="space-y-4">
                    {credsData.mib_groups.map((group: any) => {
                      const testKey = `mib-${group.id}`;
                      const testResult = credsTestResults[testKey];
                      return (
                        <div key={group.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Tenant:</span>
                              <span className="text-zinc-300 ml-1">{group.tenant_name || 'N/A'}</span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Terminal:</span>
                              <span className="text-zinc-300 ml-1">{group.terminal_name || 'N/A'}</span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">MIB Username:</span>
                              <span className="text-zinc-300 ml-1">{group.mib_username || 'N/A'}</span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">App ID:</span>
                              <span className="text-zinc-300 ml-1">{group.app_id || 'N/A'}</span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Key1:</span>
                              <span className={group.has_key1 ? 'text-emerald-400' : 'text-red-400'}>
                                {group.has_key1 ? 'Present' : 'Missing'}
                              </span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Key2:</span>
                              <span className={group.has_key2 ? 'text-emerald-400' : 'text-red-400'}>
                                {group.has_key2 ? 'Present' : 'Missing'}
                              </span>
                            </div>
                            <div className="text-xs font-mono">
                              <span className="text-zinc-500">Obtained:</span>
                              <span className="text-zinc-300">{group.obtained_at ? new Date(group.obtained_at).toLocaleString() : 'N/A'}</span>
                            </div>
                          </div>

                          {/* Profiles & linked accounts */}
                          {group.profiles?.map((profile: any) => (
                            <div key={profile.profile_id} className="mb-2 text-xs bg-black/20 rounded-lg p-2">
                              <span className="text-zinc-500">Profile:</span>
                              <span className="text-zinc-300 ml-1">{profile.profile_name || profile.profile_id}</span>
                              <span className="text-zinc-500 mx-2">Type:</span>
                              <span className="text-zinc-300">{profile.profile_type}</span>
                              {profile.linked_accounts?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {profile.linked_accounts.map((acc: any) => (
                                    <span key={acc.id} className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-300">
                                      {acc.account_number} ({acc.account_name})
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Key values */}
                          <div className="mb-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <button onClick={() => toggleReveal(`mib-${group.id}-k1`)} className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded font-mono transition-colors">
                                {revealedCreds[`mib-${group.id}-k1`] ? 'Hide' : 'Show'} Key1
                              </button>
                              {group.has_key1 && revealedCreds[`mib-${group.id}-k1`] && (
                                <button onClick={() => navigator.clipboard.writeText(group.key1)} className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono transition-colors">
                                  Copy
                                </button>
                              )}
                            </div>
                            {revealedCreds[`mib-${group.id}-k1`] && (
                              <div className="bg-black/40 border border-zinc-800 rounded p-2">
                                <pre className="text-[10px] text-zinc-300 font-mono whitespace-pre-wrap break-all leading-relaxed">{group.key1 || <span className="text-zinc-600 italic">No key1 stored</span>}</pre>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button onClick={() => toggleReveal(`mib-${group.id}-k2`)} className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded font-mono transition-colors">
                                {revealedCreds[`mib-${group.id}-k2`] ? 'Hide' : 'Show'} Key2
                              </button>
                              {group.has_key2 && revealedCreds[`mib-${group.id}-k2`] && (
                                <button onClick={() => navigator.clipboard.writeText(group.key2)} className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono transition-colors">
                                  Copy
                                </button>
                              )}
                            </div>
                            {revealedCreds[`mib-${group.id}-k2`] && (
                              <div className="bg-black/40 border border-zinc-800 rounded p-2">
                                <pre className="text-[10px] text-zinc-300 font-mono whitespace-pre-wrap break-all leading-relaxed">{group.key2 || <span className="text-zinc-600 italic">No key2 stored</span>}</pre>
                              </div>
                            )}
                          </div>

                          {/* Test / Reset buttons + result */}
                          <div className="space-y-2 mt-3 pt-3 border-t border-zinc-800">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => testCredential('mib', group.id)}
                                disabled={credsTestingId === testKey}
                                className="btn btn-outline text-xs border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/30"
                              >
                                <Shield size={12} className="mr-1" />
                                {credsTestingId === testKey ? 'Testing...' : 'Test MIB Connection'}
                              </button>
                              <button
                                onClick={() => renewMibKeys(group.id)}
                                disabled={credsTestingId === `mib-renew-${group.id}`}
                                className="btn btn-outline text-xs border-orange-700/40 text-orange-400 hover:bg-orange-900/30"
                              >
                                <RefreshCw size={12} className={`mr-1 ${credsTestingId === `mib-renew-${group.id}` ? 'animate-spin' : ''}`} />
                                {credsTestingId === `mib-renew-${group.id}` ? 'Resetting...' : 'Reset MIB Keys'}
                              </button>
                            </div>
                            {testResult && !testResult.loading && (
                              <div className="space-y-1 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-zinc-500">
                                    MIB reachable: {testResult.results?.mib_api_reachability?.response?.success ? 'Yes' : 'No'}
                                  </span>
                                  {testResult.results?.mib_api_reachability?.response?.status_code && (
                                    <span className="text-zinc-500">
                                      Status: {testResult.results.mib_api_reachability.response.status_code}
                                    </span>
                                  )}
                                  {testResult.note && (
                                    <span className="text-zinc-600 italic max-w-md">{testResult.note}</span>
                                  )}
                                </div>
                                {/* MIB Raw Communication toggle */}
                                <button
                                  onClick={() => toggleCredComm(testKey)}
                                  className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded font-mono transition-colors"
                                >
                                  {openCredComm[testKey] ? 'Hide' : 'View'} Raw Communication
                                </button>
                                {openCredComm[testKey] && testResult.results?.mib_api_reachability && (
                                  <div className="bg-black/40 border border-zinc-800 rounded p-3 space-y-2">
                                    <h4 className="text-[11px] font-bold text-yellow-500 uppercase tracking-wider">MIB Reachability</h4>
                                    {testResult.results.mib_api_reachability.request && (
                                      <div>
                                        <div className="text-[10px] text-zinc-500 mb-1">Request</div>
                                        <div className="bg-black/60 rounded p-2 font-mono text-[10px] text-zinc-300 space-y-0.5">
                                          <div><span className="text-blue-400">{testResult.results.mib_api_reachability.request.method}</span> {testResult.results.mib_api_reachability.request.url}</div>
                                          {testResult.results.mib_api_reachability.request.headers && Object.entries(testResult.results.mib_api_reachability.request.headers).map(([hk, hv]: [string, any]) => (
                                            <div key={hk} className="text-zinc-500"><span className="text-zinc-400">{hk}:</span> {hv}</div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {testResult.results.mib_api_reachability.response && (
                                      <div>
                                        <div className="text-[10px] text-zinc-500 mb-1">Response</div>
                                        <div className="bg-black/60 rounded p-2 font-mono text-[10px]">
                                          <div className="text-zinc-400">Status: <span className={testResult.results.mib_api_reachability.response.success ? 'text-emerald-400' : 'text-red-400'}>{testResult.results.mib_api_reachability.response.status_code || 'Error'}</span></div>
                                          {testResult.results.mib_api_reachability.response.error && (
                                            <div className="text-red-400 mt-1">Error: {testResult.results.mib_api_reachability.response.error}</div>
                                          )}
                                          {testResult.results.mib_api_reachability.response.body && (
                                            <div className="mt-2">
                                              {typeof testResult.results.mib_api_reachability.response.body === 'object'
                                                ? renderJsonHighlighted(testResult.results.mib_api_reachability.response.body)
                                                : renderJsonHighlighted(
                                                    (() => {
                                                      try { return JSON.parse(testResult.results.mib_api_reachability.response.body); }
                                                      catch (e) { return { raw_body: testResult.results.mib_api_reachability.response.body }; }
                                                    })()
                                                  )
                                              }
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Reset MIB Keys result */}
                            {(() => {
                              const resetKey = `mib-renew-${group.id}`;
                              const resetResult = credsTestResults[resetKey];
                              if (!resetResult || resetResult.loading) return null;
                              return (
                                <div className="text-xs space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={resetResult.cleared ? 'text-emerald-400' : 'text-red-400'}>
                                      {resetResult.cleared ? 'Keys Cleared' : 'Reset Failed'}
                                    </span>
                                    {resetResult.error && <span className="text-red-400">{resetResult.error}</span>}
                                  </div>
                                  {resetResult.cleared && (
                                    <div className="text-zinc-500">
                                      Key1: {resetResult.had_key1 ? 'Was present' : 'Was empty'} | Key2: {resetResult.had_key2 ? 'Was present' : 'Was empty'} | Profiles cleared: {resetResult.profile_count}
                                    </div>
                                  )}
                                  {resetResult.note && (
                                    <div className="text-zinc-600 italic">{resetResult.note}</div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
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
                      onClick={async () => {
                        const currentRunLogs = (modalLogs.length > 0 && typeof modalLogs[0] === 'object')
                          ? (modalLogs[selectedRunIdx]?.logs || [])
                          : modalLogs;
                        navigator.clipboard.writeText(currentRunLogs.join('\n'));
                        await customAlert('Logs copied to clipboard!');
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

      {/* Custom Modals */}
      {pinModalState.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-4 animate-scale-in">
            <div className="flex items-center gap-3 text-blue-400 mb-2">
              <Shield size={24} />
              <h3 className="text-lg font-bold text-white">Security Verification</h3>
            </div>
            <p className="text-sm text-zinc-300">{pinModalState.message}</p>
            <input 
              ref={pinInputRef}
              type="password"
              autoFocus
              className="input-field text-center tracking-[1em] font-mono text-xl py-3"
              maxLength={4}
              onKeyDown={(e) => {
                if (e.key === 'Enter') pinModalState.resolve(e.currentTarget.value);
                if (e.key === 'Escape') pinModalState.resolve(null);
              }}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button className="btn btn-outline border-zinc-700 text-zinc-400" onClick={() => pinModalState.resolve(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => pinModalState.resolve(pinInputRef.current?.value || null)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {confirmModalState.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md flex flex-col gap-4 animate-scale-in">
            <h3 className="text-lg font-bold text-white">Confirm Action</h3>
            <p className="text-sm text-zinc-300">{confirmModalState.message}</p>
            <div className="flex justify-end gap-3 mt-4">
              <button className="btn btn-outline border-zinc-700 text-zinc-400" onClick={() => confirmModalState.resolve(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => confirmModalState.resolve(true)}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {alertModalState.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-4 animate-scale-in">
            <h3 className="text-lg font-bold text-white">Alert</h3>
            <p className="text-sm text-zinc-300">{alertModalState.message}</p>
            <div className="flex justify-end mt-4">
              <button className="btn btn-primary" onClick={() => alertModalState.resolve()}>OK</button>
            </div>
          </div>
        </div>
      )}

      {cloneModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md flex flex-col gap-4 animate-scale-in relative">
            <button onClick={closeCloneModal} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
            <h3 className="text-lg font-bold text-white">Clone BML Credentials</h3>

            {cloneModal.result ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 size={18} />
                  <span className="font-semibold">Credentials Cloned Successfully</span>
                </div>
                <div className="bg-black/40 border border-zinc-800 rounded p-3 text-sm space-y-1">
                  <p><span className="text-zinc-400">Group:</span> <span className="text-white">#{cloneModal.result.group_id}</span></p>
                  <p><span className="text-zinc-400">Account:</span> <span className="text-white">{cloneModal.result.account.account_name} ({cloneModal.result.account.account_number})</span></p>
                </div>
                <button className="btn btn-primary w-full" onClick={() => { closeCloneModal(); location.reload(); }}>
                  Reload to refresh credentials list
                </button>
              </div>
            ) : (
              <>
                <div className="text-sm text-zinc-300">
                  Clone credentials from <span className="text-white font-semibold">Group #{cloneModal.sourceGroup?.id}</span> to an unlinked BML account.
                </div>

                {cloneModal.loadingAccounts ? (
                  <p className="text-sm text-zinc-500 italic">Loading unlinked accounts...</p>
                ) : cloneModal.error ? (
                  <p className="text-sm text-red-400">{cloneModal.error}</p>
                ) : cloneModal.unlinkedAccounts.length === 0 ? (
                  <p className="text-sm text-yellow-400">No unlinked BML accounts available for this tenant.</p>
                ) : (
                  <select
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                    value={cloneModal.selectedAccountId ?? ''}
                    onChange={e => setCloneModal(prev => ({ ...prev, selectedAccountId: Number(e.target.value) }))}
                  >
                    <option value="" disabled>Select a target account...</option>
                    {cloneModal.unlinkedAccounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.account_name} ({acc.account_number})</option>
                    ))}
                  </select>
                )}

                {cloneModal.error && !cloneModal.loadingAccounts && (
                  <p className="text-sm text-red-400">{cloneModal.error}</p>
                )}

                <div className="flex justify-end gap-3 mt-2">
                  <button className="btn btn-outline border-zinc-700 text-zinc-400" onClick={closeCloneModal}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    disabled={!cloneModal.selectedAccountId || cloneModal.loading || cloneModal.unlinkedAccounts.length === 0}
                    onClick={executeClone}
                  >
                    {cloneModal.loading ? 'Cloning...' : 'Clone'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {injectModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg flex flex-col gap-4 animate-scale-in relative max-h-[90vh] overflow-y-auto">
            <button onClick={closeInjectModal} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
            <h3 className="text-lg font-bold text-white">Inject Credentials</h3>

            {injectModal.result ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 size={18} />
                  <span className="font-semibold">Credentials Injected Successfully</span>
                </div>
                <div className="bg-black/40 border border-zinc-800 rounded p-3 text-sm space-y-1">
                  <p><span className="text-zinc-400">Type:</span> <span className="text-white">{injectModal.type.toUpperCase()}</span></p>
                  <p><span className="text-zinc-400">Group:</span> <span className="text-white">#{injectModal.result.group_id}</span></p>
                  {injectModal.result.profile_id && <p><span className="text-zinc-400">Profile:</span> <span className="text-white">#{injectModal.result.profile_id}</span></p>}
                  <p><span className="text-zinc-400">Account:</span> <span className="text-white">{injectModal.result.account.account_name} ({injectModal.result.account.account_number})</span></p>
                  {injectModal.result.group_existed_before && <p className="text-yellow-400 text-xs mt-1">Updated existing credential group.</p>}
                  {injectModal.result.expires_warning && <p className="text-amber-400 text-xs mt-1">{injectModal.result.expires_warning}</p>}
                </div>
                <button className="btn btn-primary w-full" onClick={closeInjectModal}>
                  Close &amp; Refresh List
                </button>
              </div>
            ) : (
              <>
                {injectModal.loadingTenants ? (
                  <p className="text-sm text-zinc-500 italic">Loading tenants...</p>
                ) : (
                  <>
                    {/* Tenant selector */}
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Tenant</label>
                      <select
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                        value={injectModal.selectedTenantId ?? ''}
                        onChange={e => {
                          const id = Number(e.target.value);
                          setInjectModal(prev => ({ ...prev, selectedTenantId: id }));
                          loadInjectAccounts(id, injectModal.type);
                        }}
                      >
                        <option value="" disabled>Select a tenant...</option>
                        {injectModal.tenants.map((t: any) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Credential type */}
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Credential Type</label>
                      <div className="flex gap-3">
                        <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${injectModal.type === 'bml' ? 'border-blue-500/50 bg-blue-900/20 text-blue-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>
                          <input type="radio" name="injectType" value="bml" checked={injectModal.type === 'bml'} onChange={() => {
                            setInjectModal(prev => ({ ...prev, type: 'bml', selectedAccountId: null, fields: {}, error: null }));
                            if (injectModal.selectedTenantId) {
                              loadInjectAccounts(injectModal.selectedTenantId, 'bml');
                            }
                          }} className="sr-only" />
                          BML
                        </label>
                        <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${injectModal.type === 'mib' ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>
                          <input type="radio" name="injectType" value="mib" checked={injectModal.type === 'mib'} onChange={() => {
                            setInjectModal(prev => ({ ...prev, type: 'mib', selectedAccountId: null, fields: {}, error: null }));
                            if (injectModal.selectedTenantId) {
                              loadInjectAccounts(injectModal.selectedTenantId, 'mib');
                            }
                          }} className="sr-only" />
                          MIB
                        </label>
                      </div>
                    </div>

                    {/* Bank account selector */}
                    {injectModal.selectedTenantId && (
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Bank Account</label>
                        {injectModal.loadingAccounts ? (
                          <p className="text-sm text-zinc-500 italic">Loading accounts...</p>
                        ) : (
                          <select
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                            value={injectModal.selectedAccountId ?? ''}
                            onChange={e => setInjectModal(prev => ({ ...prev, selectedAccountId: Number(e.target.value) }))}
                          >
                            <option value="" disabled>Select a bank account...</option>
                            {injectModal.accounts.map((acc: any) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.account_name} ({acc.account_number})
                                {(acc.bml_linked_group_id || acc.mib_linked_profile_id) ? ' — ALREADY LINKED' : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    {/* Terminal selector */}
                    {injectModal.selectedTenantId && (
                      <div>
                        <label className="text-xs text-zinc-400 mb-1 block">Terminal (optional)</label>
                        <select
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                          value={injectModal.fields.terminal_id || ''}
                          onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, terminal_id: e.target.value } }))}
                        >
                          <option value="">None (leave unassigned)</option>
                          {(() => {
                            const tenant = injectModal.tenants.find((t: any) => t.id === injectModal.selectedTenantId);
                            return tenant?.terminals?.map((term: any) => (
                              <option key={term.id} value={term.id}>{term.terminal_name}</option>
                            ));
                          })()}
                        </select>
                      </div>
                    )}

                    {/* Form fields */}
                    {injectModal.selectedAccountId && injectModal.selectedTenantId && !injectModal.loadingAccounts && (
                      <div className="space-y-3 border-t border-zinc-800 pt-3">
                        {injectModal.type === 'bml' ? (
                          <>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">BML Username (optional)</label>
                              <input type="text" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" placeholder="johndoe" value={injectModal.fields.bml_username || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, bml_username: e.target.value } }))} />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">Profile Type</label>
                              <div className="flex gap-3">
                                <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm ${(injectModal.fields.profile_type || 'personal') === 'personal' ? 'border-zinc-500 bg-zinc-700 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>
                                  <input type="radio" name="injectProfile" value="personal" checked={(injectModal.fields.profile_type || 'personal') === 'personal'} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, profile_type: e.target.value } }))} className="sr-only" /> Personal
                                </label>
                                <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm ${injectModal.fields.profile_type === 'business' ? 'border-zinc-500 bg-zinc-700 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>
                                  <input type="radio" name="injectProfile" value="business" checked={injectModal.fields.profile_type === 'business'} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, profile_type: e.target.value } }))} className="sr-only" /> Business
                                </label>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">Access Token <span className="text-zinc-600 ml-1">({(injectModal.fields.access_token || '').length} chars)</span></label>
                              <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono h-24 resize-y" placeholder="Paste access_token here..." value={injectModal.fields.access_token || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, access_token: e.target.value } }))} autoComplete="off" spellCheck="false" />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">Refresh Token <span className="text-zinc-600 ml-1">({(injectModal.fields.refresh_token || '').length} chars)</span></label>
                              <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono h-24 resize-y" placeholder="Paste refresh_token here..." value={injectModal.fields.refresh_token || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, refresh_token: e.target.value } }))} autoComplete="off" spellCheck="false" />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">Device ID</label>
                              <input type="text" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" placeholder="e.g. abc123def456" value={injectModal.fields.device_id || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, device_id: e.target.value } }))} />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">Expires In (seconds, optional)</label>
                              <input type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" placeholder="3600" value={injectModal.fields.expires_in || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, expires_in: e.target.value } }))} />
                              <p className="text-[10px] text-zinc-600 mt-0.5">Leave blank for unknown expiry.</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">MIB Username</label>
                              <input type="text" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" placeholder="johndoe" value={injectModal.fields.mib_username || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, mib_username: e.target.value } }))} />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">Key1 <span className="text-zinc-600 ml-1">({(injectModal.fields.key1 || '').length} chars)</span></label>
                              <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono h-24 resize-y" placeholder="Paste key1 here..." value={injectModal.fields.key1 || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, key1: e.target.value } }))} autoComplete="off" spellCheck="false" />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">Key2 <span className="text-zinc-600 ml-1">({(injectModal.fields.key2 || '').length} chars)</span></label>
                              <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono h-24 resize-y" placeholder="Paste key2 here..." value={injectModal.fields.key2 || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, key2: e.target.value } }))} autoComplete="off" spellCheck="false" />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">App ID</label>
                              <input type="text" maxLength={64} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" placeholder="e.g. APP123" value={injectModal.fields.app_id || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, app_id: e.target.value } }))} />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">Profile ID</label>
                              <input type="text" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" placeholder="default_profile" value={injectModal.fields.profile_id || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, profile_id: e.target.value } }))} />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">Profile Type</label>
                              <input type="text" maxLength={4} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" placeholder="0" value={injectModal.fields.profile_type || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, profile_type: e.target.value } }))} />
                            </div>
                            <div>
                              <label className="text-xs text-zinc-400 mb-1 block">Profile Name</label>
                              <input type="text" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" placeholder="Default" value={injectModal.fields.profile_name || ''} onChange={e => setInjectModal(prev => ({ ...prev, fields: { ...prev.fields, profile_name: e.target.value } }))} />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}

                {injectModal.error && (
                  <p className="text-sm text-red-400">{injectModal.error}</p>
                )}

                <div className="flex justify-end gap-3 mt-2">
                  <button className="btn btn-outline border-zinc-700 text-zinc-400" onClick={closeInjectModal}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    disabled={!injectModal.selectedAccountId || !injectModal.selectedTenantId || injectModal.submitting || injectModal.loadingAccounts || injectModal.loadingTenants}
                    onClick={executeInject}
                  >
                    {injectModal.submitting ? 'Injecting...' : 'Inject'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
