import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, Trash2, LogOut, Copy, MonitorSmartphone, LayoutDashboard, BarChart3, CreditCard, LifeBuoy, CheckCircle2, Info, Download } from 'lucide-react';

const Tooltip = ({ text }: { text: string }) => (
  <div className="relative inline-flex items-center group ml-2 cursor-help align-middle">
    <Info size={16} className="text-[var(--text-secondary)] hover:text-white transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-zinc-900 border border-zinc-700 text-white text-xs leading-relaxed rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 font-normal">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700"></div>
    </div>
  </div>
);

export default function CompanyDashboard() {
  const [user, setUser] = useState<any>(null);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [now, setNow] = useState(Date.now());
  
  // Forms
  const [newTerminalName, setNewTerminalName] = useState('');
  const [bankName, setBankName] = useState('BML');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [mibProfileType, setMibProfileType] = useState('0');
  
  const navigate = useNavigate();

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

      const termsRes = await fetch('/api/company/terminals', { headers });
      setTerminals(await termsRes.json());

      const banksRes = await fetch('/api/company/bank-accounts', { headers });
      setBankAccounts(await banksRes.json());

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

  const createTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('viri_token');
    await fetch('/api/company/terminals', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTerminalName })
    });
    setNewTerminalName('');
    fetchData();
  };

  const deleteTerminal = async (id: number) => {
    const token = localStorage.getItem('viri_token');
    await fetch(`/api/company/terminals/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }});
    fetchData();
  };

  const createBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('viri_token');
    const res = await fetch('/api/company/bank-accounts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_name: bankName, account_name: accountName, account_number: accountNumber, mib_profile_type: bankName === 'MIB' ? mibProfileType : '0' })
    });
    
    if (!res.ok) {
      const data = await res.json();
      alert(data.message || 'Error adding account');
    } else {
      setAccountName('');
      setAccountNumber('');
      setMibProfileType('0');
      fetchData();
    }
  };

  const deleteBankAccount = async (id: number) => {
    const token = localStorage.getItem('viri_token');
    await fetch(`/api/company/bank-accounts/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }});
    fetchData();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Hardware ID copied to clipboard!');
  };

  if (loading) return <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[var(--border-color)] bg-[var(--bg-surface)] p-6 hidden md:block">
        <div className="mb-8">
          <img src="/logo_en.png" alt="Viri Logo" className="h-32 object-contain" />
        </div>
        <nav className="space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-[var(--color-success)] text-black font-bold' : 'hover:bg-white/5 text-[var(--text-secondary)]'}`}>
            <LayoutDashboard size={20} /> Dashboard
          </button>
          <button onClick={() => setActiveTab('reporting')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'reporting' ? 'bg-[var(--color-success)] text-black font-bold' : 'hover:bg-white/5 text-[var(--text-secondary)]'}`}>
            <BarChart3 size={20} /> Reporting
          </button>
          <button onClick={() => setActiveTab('plans')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'plans' ? 'bg-[var(--color-success)] text-black font-bold' : 'hover:bg-white/5 text-[var(--text-secondary)]'}`}>
            <CreditCard size={20} /> Plans & Upgrades
          </button>
          <button onClick={() => setActiveTab('support')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'support' ? 'bg-[var(--color-success)] text-black font-bold' : 'hover:bg-white/5 text-[var(--text-secondary)]'}`}>
            <LifeBuoy size={20} /> Support
          </button>
        </nav>
      </aside>

      <main className="flex-1 p-6 lg:p-10 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold capitalize">{activeTab === 'dashboard' ? 'Company Dashboard' : activeTab}</h1>
            <p className="text-[var(--text-secondary)]">Welcome, {user?.name} ({user?.tenant?.name})</p>
          </div>
          <button onClick={handleLogout} className="btn btn-outline flex items-center gap-2">
            <LogOut size={16} /> Logout
          </button>
        </header>

        {user?.status === 'pending' || user?.tenant?.status === 'pending' ? (
          <div className="bg-yellow-900/30 border border-yellow-500/50 p-6 rounded-lg text-yellow-200 mb-8 shadow-lg">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><Shield /> Account Pending Approval</h2>
            <p>Your account is currently under review by a superadmin. You can configure your terminals and bank accounts, but they will not be active until approved.</p>
          </div>
        ) : null}

        {/* --- TAB: DASHBOARD --- */}
        {activeTab === 'dashboard' && (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="glass-panel p-6">
              <h2 className="text-xl font-bold mb-4 border-b border-[var(--border-color)] pb-2 flex items-center">
                Subscription Details <Tooltip text="Your current billing tier and monthly verification usage limits." />
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Current Tier:</span>
                  <span className="font-bold uppercase text-[var(--color-success)]">{user?.tenant?.subscription_tier === 'free' ? 'Free Trial' : `MVR ${user?.tenant?.subscription_tier}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Verifications Used:</span>
                  <span className="font-mono">{user?.tenant?.verifications_count} this month</span>
                </div>
              </div>
            </div>

            <div className="glass-panel p-6">
              <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-4">
                <h2 className="text-xl font-bold flex items-center">
                  Terminals <Tooltip text="Create terminals to generate unique Hardware IDs. Paste these IDs into the Viri Cashier app on your devices." />
                </h2>
                <a href="/extention/viri-connect.zip" download className="flex items-center gap-1 text-sm text-[var(--color-success)] hover:underline bg-[var(--color-success)]/10 px-3 py-1 rounded transition-colors hover:bg-[var(--color-success)]/20">
                  <Download size={14} /> Download Extension
                </a>
              </div>
              <form onSubmit={createTerminal} className="flex gap-2 mb-4">
                <input type="text" required placeholder="New Terminal Name (e.g. Counter 1)" className="input-field flex-1" value={newTerminalName} onChange={e => setNewTerminalName(e.target.value)} />
                <button type="submit" className="btn btn-success p-3"><Plus size={20} /></button>
              </form>
              <div className="space-y-3">
                {terminals.map(term => {
                  const isExpired = term.pairing_code_expires_at ? new Date(term.pairing_code_expires_at).getTime() < now : true;
                  const minutesLeft = term.pairing_code_expires_at ? Math.max(0, Math.floor((new Date(term.pairing_code_expires_at).getTime() - now) / 60000)) : 0;
                  const secondsLeft = term.pairing_code_expires_at ? Math.max(0, Math.floor(((new Date(term.pairing_code_expires_at).getTime() - now) % 60000) / 1000)) : 0;

                  return (
                    <div key={term.id} className="bg-[var(--bg-canvas)] p-3 rounded border border-[var(--border-color)] flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <strong className="text-[var(--color-success)] flex items-center gap-2">
                          <MonitorSmartphone size={18} className="text-[var(--text-secondary)]" /> 
                          {term.terminal_name}
                        </strong>
                        <button onClick={() => deleteTerminal(term.id)} className="text-red-400 hover:text-red-300" title="Delete Terminal"><Trash2 size={16}/></button>
                      </div>

                      {term.pairing_code && !isExpired ? (
                        <div className="flex justify-between items-center bg-black/40 p-4 rounded border border-yellow-500/30">
                          <div>
                            <div className="text-xs text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Pairing Code</div>
                            <div className="text-3xl font-mono text-yellow-400 tracking-[0.2em]">{term.pairing_code}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-[var(--text-secondary)] mb-1">Expires In</div>
                            <div className="text-sm font-mono text-yellow-200">
                              {minutesLeft}:{secondsLeft.toString().padStart(2, '0')}
                            </div>
                          </div>
                        </div>
                      ) : (
                        term.pairing_code && isExpired ? (
                          <div className="flex justify-between items-center bg-red-900/20 p-3 rounded border border-red-500/20">
                            <span className="text-red-400 text-sm">Pairing Code Expired</span>
                            <button onClick={() => deleteTerminal(term.id)} className="btn btn-outline text-xs py-1 px-2 border-red-500 text-red-500">Delete & Recreate</button>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center bg-emerald-900/20 p-3 rounded border border-[var(--color-success)] border-opacity-30">
                            <span className="flex items-center gap-2 text-sm text-[var(--color-success)] font-medium">
                              <CheckCircle2 size={16}/> Configured
                            </span>
                            <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                              ID: ...{term.hardware_id.slice(-8)}
                              <button onClick={() => copyToClipboard(term.hardware_id)} className="hover:text-white" title="Copy Hardware ID"><Copy size={14}/></button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
                {terminals.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No terminals created yet.</p>}
              </div>
            </div>

            <div className="glass-panel p-6 md:col-span-2">
              <h2 className="text-xl font-bold mb-4 border-b border-[var(--border-color)] pb-2 flex items-center">
                Bank Accounts <Tooltip text="Add the bank accounts where you receive transfers. These will be automatically checked by the terminals." />
              </h2>
              <form onSubmit={createBankAccount} className="grid md:grid-cols-4 gap-4 mb-6">
                <select className="input-field" value={bankName} onChange={e => setBankName(e.target.value)}>
                  <option value="BML">Bank of Maldives (BML)</option>
                  <option value="MIB">Maldives Islamic Bank (MIB)</option>
                </select>
                <input type="text" required placeholder="Account Name" className="input-field" value={accountName} onChange={e => setAccountName(e.target.value)} />
                <input type="text" required placeholder="Account Number" className="input-field" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
                <button type="submit" className="btn btn-success flex justify-center items-center gap-2"><Plus size={18}/> Add Account</button>
              </form>
              {bankName === 'MIB' && (
                <div className="mb-6 -mt-2 bg-emerald-900/10 border border-emerald-500/20 p-4 rounded-lg">
                  <label className="text-sm text-[var(--text-secondary)] mb-2 block">MIB Profile Type</label>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setMibProfileType('0')} className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all border ${mibProfileType === '0' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-transparent border-[var(--border-color)] text-[var(--text-secondary)] hover:border-emerald-500/50'}`}>
                      Personal
                    </button>
                    <button type="button" onClick={() => setMibProfileType('1')} className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all border ${mibProfileType === '1' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-transparent border-[var(--border-color)] text-[var(--text-secondary)] hover:border-emerald-500/50'}`}>
                      Business
                    </button>
                  </div>
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                {bankAccounts.map(acc => (
                  <div key={acc.id} className="bg-[var(--bg-canvas)] p-4 rounded border border-[var(--border-color)] flex justify-between items-center">
                    <div className="flex gap-4 items-center">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white shadow-lg ${acc.bank_name === 'BML' ? 'bg-red-600' : 'bg-emerald-600'}`}>
                        {acc.bank_name}
                      </div>
                      <div>
                        <div className="font-bold text-lg">{acc.bank_name === 'BML' ? 'Bank of Maldives' : 'Maldives Islamic Bank'}</div>
                        <div className="text-[var(--text-secondary)]">{acc.account_name}</div>
                        <div className="font-mono text-sm">{acc.account_number}</div>
                        {acc.bank_name === 'MIB' && (
                          <div className="text-xs mt-1 text-emerald-400/70">{acc.mib_profile_type === '1' ? '🏢 Business Profile' : '👤 Personal Profile'}</div>
                        )}
                      </div>
                    </div>
                    <button onClick={() => deleteBankAccount(acc.id)} className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded"><Trash2 size={20}/></button>
                  </div>
                ))}
                {bankAccounts.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No bank accounts configured.</p>}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: REPORTING --- */}
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

        {/* --- TAB: PLANS --- */}
        {activeTab === 'plans' && (
          <div className="flex flex-col gap-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Available Subscription Plans</h2>
              <p className="text-[var(--text-secondary)]">Choose the plan that best fits your business needs.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {/* Free Plan */}
              <div className="glass-panel p-8 border-t-4 border-t-zinc-500 flex flex-col">
                <h3 className="text-xl font-bold text-zinc-300">Free Tier</h3>
                <div className="text-3xl font-bold my-4">MVR 0 <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> 20 verifications / month</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> 2 Bank Accounts</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-zinc-500" /> Standard Support</li>
                </ul>
                <button disabled={user?.tenant?.subscription_tier === 'free'} className="btn w-full bg-zinc-800 disabled:opacity-50">
                  {user?.tenant?.subscription_tier === 'free' ? 'Current Plan' : 'Downgrade'}
                </button>
              </div>

              {/* 499 Plan */}
              <div className="glass-panel p-8 border-t-4 border-t-emerald-500 relative flex flex-col scale-105 shadow-2xl shadow-emerald-900/20 z-10">
                <div className="absolute top-0 right-0 bg-emerald-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">POPULAR</div>
                <h3 className="text-xl font-bold text-emerald-400">Standard</h3>
                <div className="text-3xl font-bold my-4">MVR 499 <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> 300 verifications / month</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> 2 Bank Accounts</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> Priority Support</li>
                </ul>
                <button disabled={user?.tenant?.subscription_tier === '499'} className="btn btn-success w-full disabled:opacity-50 disabled:bg-emerald-900">
                  {user?.tenant?.subscription_tier === '499' ? 'Current Plan' : 'Upgrade'}
                </button>
              </div>

              {/* 999 Plan */}
              <div className="glass-panel p-8 border-t-4 border-t-purple-500 flex flex-col">
                <h3 className="text-xl font-bold text-purple-400">Pro</h3>
                <div className="text-3xl font-bold my-4">MVR 999 <span className="text-base font-normal text-[var(--text-secondary)]">/mo</span></div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-purple-500" /> Unlimited verifications</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-purple-500" /> 4 Bank Accounts</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-purple-500" /> 24/7 Dedicated Support</li>
                </ul>
                <button disabled={user?.tenant?.subscription_tier === '999'} className="btn bg-purple-600 hover:bg-purple-500 text-white w-full disabled:opacity-50">
                  {user?.tenant?.subscription_tier === '999' ? 'Current Plan' : 'Upgrade'}
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

      </main>
    </div>
  );
}

