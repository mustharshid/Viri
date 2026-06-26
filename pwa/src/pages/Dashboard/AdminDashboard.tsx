import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, LogOut, Terminal, X, Copy, Lock } from 'lucide-react';

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

  useEffect(() => {
    fetchData();
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
    const currentCompany = companies.find(c => c.id === id);
    const isStatusChanged = currentCompany && currentCompany.status !== status;
    const isTierChanged = currentCompany && currentCompany.subscription_tier !== tier;

    if (isStatusChanged || isTierChanged) {
      const userPin = window.prompt(`To confirm this action, please enter the 4-letter security PIN displayed at the top of the panel (${securityPin}):`);
      if (!userPin || userPin.toUpperCase() !== securityPin) {
        alert("Invalid or empty PIN. Action aborted.");
        fetchData();
        return;
      }
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

        <div className="glass-panel p-6 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-[var(--text-secondary)]">
                <th className="py-3 px-4">Company Name</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Subscription Tier</th>
                <th className="py-3 px-4">Verifications (Used)</th>
                <th className="py-3 px-4">Terminals</th>
                <th className="py-3 px-4">Lock Timeout</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(company => (
                <tr key={company.id} className="border-b border-[var(--border-color)] last:border-0 hover:bg-white/5">
                  <td className="py-4 px-4 font-bold">{company.name}</td>
                  <td className="py-4 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${company.status === 'active' ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
                      {company.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <select 
                      className="input-field py-1 px-2 h-auto text-sm"
                      value={company.subscription_tier}
                      onChange={(e) => updateCompany(company.id, company.status, e.target.value, company.lock_timeout, company.max_terminals)}
                    >
                      <option value="free">Free (1 Cashier Terminal)</option>
                      <option value="499">Starter - MVR 499 (1 Cashier Terminal)</option>
                      <option value="999">Growth - MVR 999 (1 Cashier Terminal, add. CT at 499/-)</option>
                      <option value="1999">Enterprise - MVR 1999 (2 Cashier Terminals, add. CT at 399/-)</option>
                    </select>
                  </td>
                  <td className="py-4 px-4 font-mono text-sm">
                    {company.verifications_count} / {company.subscription_tier === 'free' ? 20 : (company.subscription_tier === '499' ? 300 : 'Unlimited')}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 mb-1.5 border-b border-zinc-800 pb-1.5">
                        <span className="text-xs text-[var(--text-secondary)] font-mono">Limit:</span>
                        <input 
                          type="number"
                          min="1"
                          className="input-field py-0.5 px-1.5 h-auto text-xs w-14 font-mono text-center"
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
                        <span className="text-xs text-zinc-400 font-mono">({company.terminals?.length ?? 0} used)</span>
                      </div>
                      <div className="flex flex-col gap-1.5 max-w-[200px]">
                        {company.terminals && company.terminals.length > 0 ? (
                          company.terminals.map((term: any) => (
                            <div key={term.id} className="flex items-center justify-between gap-2 py-1 border-b border-zinc-800 last:border-0">
                              <span className="font-medium text-xs text-zinc-300 truncate" title={term.terminal_name}>
                                {term.terminal_name}
                              </span>
                              <button 
                                onClick={() => openDebugLogModal(term)} 
                                className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded hover:bg-blue-500/10 transition-all flex items-center gap-1 font-mono"
                              >
                                <Terminal size={10} /> Logs
                              </button>
                            </div>
                          ))
                        ) : (
                          <span className="text-zinc-500 italic text-xs">None</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 flex items-center gap-1.5">
                    <input 
                      type="number"
                      min="5"
                      max="300"
                      className="input-field py-1 px-2 h-auto text-sm w-16 font-mono"
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
                    <span className="text-xs text-[var(--text-secondary)]">s</span>
                  </td>
                  <td className="py-4 px-4">
                    {company.status === 'pending' ? (
                      <button 
                        onClick={() => updateCompany(company.id, 'active', company.subscription_tier, company.lock_timeout, company.max_terminals)}
                        className="btn btn-success text-xs py-1 px-3 flex items-center gap-1"
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                    ) : (
                      <button 
                        onClick={() => updateCompany(company.id, 'pending', company.subscription_tier, company.lock_timeout, company.max_terminals)}
                        className="btn btn-outline text-xs py-1 px-3 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                      >
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {companies.length === 0 && <div className="text-center py-8 text-[var(--text-secondary)]">No companies registered yet.</div>}
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
