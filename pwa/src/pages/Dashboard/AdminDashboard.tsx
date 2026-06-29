import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Terminal, X, Copy, Lock, Info, MonitorSmartphone } from 'lucide-react';

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

  const [activeTab, setActiveTab] = useState<'companies' | 'logs'>('companies');
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);

  const [filterEventType, setFilterEventType] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchSessionLogs();
    }
  }, [activeTab, logsPage, filterEventType, filterCompanyId]);

  const fetchSessionLogs = async () => {
    setLogsLoading(true);
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

  const updateCompany = async (id: number, status: string, tier: string, lockTimeout?: number, maxTerminals?: number) => {
    const userPin = window.prompt(`To confirm this action, please enter the 4-letter security PIN displayed at the top of the panel (${securityPin}):`);
    if (!userPin || userPin.toUpperCase() !== securityPin) {
      alert("Invalid or empty PIN. Action aborted.");
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
    await fetch(`/api/admin/companies/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    fetchData();
  };

  const updateTerminalPermission = async (terminalId: number, showVbtl: boolean) => {
    const userPin = window.prompt(`To confirm this action, please enter the 4-letter security PIN displayed at the top of the panel (${securityPin}):`);
    if (!userPin || userPin.toUpperCase() !== securityPin) {
      alert("Invalid or empty PIN. Action aborted.");
      return;
    }

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
          <button onClick={handleLogout} className="btn btn-outline flex items-center gap-2">
            <LogOut size={16} /> Logout
          </button>
        </header>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 mb-6">
          <button
            onClick={() => setActiveTab('companies')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'companies'
                ? 'border-yellow-500 text-yellow-500'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Registered Companies
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'logs'
                ? 'border-yellow-500 text-yellow-500'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Session Activity Log
          </button>
        </div>

        {/* Security Confirmation PIN display */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
              <Lock size={20} />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Security Confirmation PIN</h4>
              <p className="text-xs text-zinc-400">Enter this PIN to confirm company status updates or subscription plan changes.</p>
            </div>
          </div>
          <div className="bg-zinc-800 border border-zinc-700 px-4 py-2 rounded-lg">
            <span className="font-mono text-xl font-extrabold text-yellow-400 tracking-widest">{securityPin}</span>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {activeTab === 'companies' ?
            companies.map(company => (
              <div key={company.id} className="glass-panel p-6 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col gap-6 bg-black/20 rounded-2xl">
              {/* Header: Company Name & Status */}
              <div className="flex flex-wrap justify-between items-center gap-4 border-b border-zinc-800/80 pb-4">
                {(() => {
                  const adminUser = company.users?.find((u: any) => u.role === 'company_admin') || company.users?.[0];
                  return (
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
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
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
                      onClick={() => updateCompany(company.id, 'active', company.subscription_tier, company.lock_timeout, company.max_terminals)}
                      className="btn btn-success text-xs py-1.5 px-3 flex items-center gap-1.5 font-semibold"
                    >
                      Activate
                    </button>
                  )}
                  {company.status !== 'suspended' && (
                    <button 
                      onClick={() => updateCompany(company.id, 'suspended', company.subscription_tier, company.lock_timeout, company.max_terminals)}
                      className="btn btn-outline text-xs py-1.5 px-3 border-orange-500/50 text-orange-400 hover:bg-orange-500/10 font-semibold"
                    >
                      Suspend
                    </button>
                  )}
                  {company.status !== 'archived' && (
                    <button 
                      onClick={() => updateCompany(company.id, 'archived', company.subscription_tier, company.lock_timeout, company.max_terminals)}
                      className="btn btn-outline text-xs py-1.5 px-3 border-zinc-700 text-zinc-400 hover:bg-zinc-800 font-semibold"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>

              {/* Grid Section: Key settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Subscription Tier */}
                <div className="input-group">
                  <label className="input-label flex items-center gap-1">
                    Subscription Tier
                    <Tooltip text="Billing plan selection controlling account limits." />
                  </label>
                  <select 
                    className="input-field w-full text-sm font-medium"
                    value={company.subscription_tier}
                    onChange={(e) => updateCompany(company.id, company.status, e.target.value, company.lock_timeout, company.max_terminals)}
                  >
                    <option value="free">Free (1 Cashier Terminal)</option>
                    <option value="499">Starter - MVR 499 (1 Cashier Terminal)</option>
                    <option value="999">Growth - MVR 999 (1 Cashier Terminal, add. CT at 499/-)</option>
                    <option value="1999">Enterprise - MVR 1999 (2 Cashier Terminals, add. CT at 399/-)</option>
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
                    <span>{company.subscription_tier === 'free' ? 20 : (company.subscription_tier === '499' ? 300 : 'Unlimited')}</span>
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
                          updateCompany(company.id, company.status, company.subscription_tier, company.lock_timeout, val);
                        }
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
                          updateCompany(company.id, company.status, company.subscription_tier, val, company.max_terminals);
                        }
                      }}
                    />
                    <span className="text-xs text-zinc-400">seconds</span>
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
            </div>
          )) : (
            <div className="glass-panel p-6 border border-zinc-800 bg-black/20 rounded-2xl">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h3 className="text-xl font-bold text-white tracking-tight">Active Sessions & Logs Audit</h3>
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

              {logsLoading ? (
                <div className="text-center py-12 text-zinc-500 font-medium">Loading session activity logs...</div>
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
                          // Determine event badge color
                          let badgeClass = "bg-zinc-800 text-zinc-400 border border-zinc-700";
                          if (['session_login_success', 'session_claimed', 'fetch_request_fulfilled'].includes(log.event_type)) {
                            badgeClass = "bg-green-950/40 text-green-400 border border-green-500/20";
                          } else if (['session_login_failed', 'fetch_request_failed'].includes(log.event_type)) {
                            badgeClass = "bg-red-950/40 text-red-400 border border-red-500/20";
                          } else if (['session_heartbeat_lost', 'session_released'].includes(log.event_type)) {
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
                                  <span className="text-[10px] text-zinc-500 block">{log.tenant?.name}</span>
                                </td>
                                <td className="py-3 pr-4 font-mono text-zinc-400">
                                  {log.bank_name || "N/A"}
                                  <span className="text-[10px] block">{log.account_number_masked || ""}</span>
                                </td>
                                <td className="py-3 pr-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}`}>
                                    {log.event_type.replace(/_/g, ' ').toUpperCase()}
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
                                    <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-950/80 p-3 rounded-lg border border-zinc-800/80 overflow-x-auto max-w-full scrollbar-thin">
                                      {JSON.stringify(log.event_detail, null, 2)}
                                    </pre>
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

              <h3 className="text-lg font-bold mb-2 flex items-center gap-2 pr-8">
                <Terminal size={18} className="text-blue-400" />
                Debug Logs: {selectedTerminal.terminal_name}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Enter the 6-digit debug code generated by the tenant admin to view this terminal's logs.
              </p>

              {modalError && (
                <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400">
                  {modalError}
                </div>
              )}

              {modalLogs === null ? (
                <form onSubmit={fetchTerminalLogs} className="flex flex-col gap-4 mt-2">
                  <div className="input-group">
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

                  <div className="bg-black/50 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-green-400 h-80 overflow-y-auto flex flex-col gap-1.5 scrollbar-thin">
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

      </div>
    </div>
  );
}
