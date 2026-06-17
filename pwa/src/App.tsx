import { useState, useEffect } from 'react';
import { Shield, RefreshCw, CheckCircle, Settings, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import './index.css';

interface BankAccount {
  id: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  is_default: boolean;
}

function App() {
  const [amount, setAmount] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isDefault, setIsDefault] = useState(true);
  
  // Hardware bound Terminal ID (generated once per browser instance)
  const [hardwareId] = useState(() => {
    let id = localStorage.getItem('viri_hardware_id');
    if (!id) {
      id = 'term_' + Math.random().toString(36).substring(2, 11) + '_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('viri_hardware_id', id);
    }
    return id;
  });

  // Settings
  const [extensionId, setExtensionId] = useState(localStorage.getItem('viri_extension_id') || '');
  const [backendUrl, setBackendUrl] = useState(() => {
    // Default backend URL based on environment
    const defaultUrl = window.location.origin.includes('localhost')
      ? 'http://localhost:8000/api'        // local Laravel dev server
      : `${window.location.origin}/api`;  // production: viri.thinksafe.mv/api
    return localStorage.getItem('viri_backend_url') || defaultUrl;
  });
  const [showSettings, setShowSettings] = useState(false);
  
  // Verification State
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    reference: string;
    amount: string;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // New Bank Account Form State
  const [newBankName, setNewBankName] = useState('BML');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  
  // Dynamic Totals (keyed by account id string)
  const [totals, setTotals] = useState<Record<string, number>>({});

  // Persist settings
  useEffect(() => {
    localStorage.setItem('viri_extension_id', extensionId);
  }, [extensionId]);

  useEffect(() => {
    localStorage.setItem('viri_backend_url', backendUrl);
  }, [backendUrl]);

  // Fetch Bank Accounts on Load
  useEffect(() => {
    const fetchAccounts = async () => {
      if (!hardwareId || !backendUrl) return;
      
      setInitLoading(true);
      try {
        const response = await fetch(`${backendUrl}/verify-terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hardware_id: hardwareId })
        });
        if (response.ok) {
          const data = await response.json();
          const accounts = data.tenant?.bank_accounts || [];
          setBankAccounts(accounts);
          
          if (accounts.length > 0) {
            const defaultAcc = accounts.find((a: BankAccount) => a.is_default) || accounts[0];
            setSelectedAccountId(defaultAcc.id.toString());
            
            // Initialize totals to 0 if not set
            const newTotals: Record<string, number> = {};
            accounts.forEach((acc: BankAccount) => {
              newTotals[acc.id.toString()] = 0;
            });
            setTotals(newTotals);
          }
        }
      } catch (err) {
        console.error("Failed to fetch initial terminal data", err);
      } finally {
        setInitLoading(false);
      }
    };
    fetchAccounts();
  }, [hardwareId, backendUrl]);

  const handleAddAccount = async () => {
    if (!newAccountName || !newAccountNumber) return;
    setIsAddingAccount(true);
    try {
      const response = await fetch(`${backendUrl}/bank-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_id: hardwareId,
          bank_name: newBankName,
          account_name: newAccountName,
          account_number: newAccountNumber
        })
      });
      if (response.ok) {
        const data = await response.json();
        setBankAccounts(prev => [...prev, data.account]);
        setNewAccountName('');
        setNewAccountNumber('');
        if (!selectedAccountId) {
          setSelectedAccountId(data.account.id.toString());
        }
      } else {
        alert("Failed to add account");
      }
    } catch (e) {
      alert("Error adding account");
    } finally {
      setIsAddingAccount(false);
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!confirm("Remove this bank account?")) return;
    try {
      const response = await fetch(`${backendUrl}/bank-accounts/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardware_id: hardwareId })
      });
      if (response.ok) {
        setBankAccounts(prev => prev.filter(a => a.id !== id));
        if (selectedAccountId === id.toString()) {
          setSelectedAccountId('');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerify = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Please enter a valid transfer amount.");
      return;
    }
    if (!extensionId) {
      setError("Extension ID is not configured. Click the gear icon at the top to configure the extension.");
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    // Step 1: License Guard (Query the Laravel backend)
    try {
      const response = await fetch(`${backendUrl}/verify-terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardware_id: hardwareId })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setError(`License check failed: ${errData.error || response.statusText} (${response.status})`);
        setLoading(false);
        return;
      }
    } catch (err: any) {
      setError(`Backend Connection Failed: Could not connect to licensing server at ${backendUrl}. Check your network or settings.`);
      setLoading(false);
      return;
    }

    // Step 2: Send message to the local extension
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      setError("Browser extension API not detected. Make sure you are using Chrome and the extension is loaded.");
      setLoading(false);
      return;
    }

    const selectedAccount = bankAccounts.find(a => a.id.toString() === selectedAccountId);
    const selectedBankName = selectedAccount ? selectedAccount.bank_name : 'BML';

    chrome.runtime.sendMessage(
      extensionId,
      {
        action: 'VERIFY_TRANSFER',
        payload: {
          amount: parseFloat(amount).toFixed(2),
          bank: selectedBankName,
          accountId: selectedAccountId
        }
      },
      (response: any) => {
        setLoading(false);
        if (chrome.runtime.lastError) {
          setError(`Extension connection failed: ${chrome.runtime.lastError.message}. Make sure the Extension ID is correct and active.`);
          return;
        }

        if (response && response.success) {
          setResult(response.data);
          // Increment totals dynamically
          const addedAmount = parseFloat(amount);
          setTotals(prev => ({
            ...prev,
            [selectedAccountId]: (prev[selectedAccountId] || 0) + addedAmount
          }));
          setAmount(''); // clear input on success
        } else {
          setError(response?.error || "Bank transfer not found or verification failed.");
        }
      }
    );
  };

  const companyName = "Retailer Pos";

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      
      {/* Trust Badge */}
      <div className="w-full max-w-xl mb-6 p-3 bg-[var(--bg-surface)] border border-[var(--color-success)] border-opacity-30 rounded-lg flex items-center gap-3">
        <Shield className="text-[var(--color-success)] shrink-0" size={24} />
        <p className="text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">Viri Zero-Knowledge Architecture:</strong> Financial passwords are fully encrypted and stored strictly on this local terminal machine.
        </p>
      </div>

      {/* Header */}
      <div className="w-full max-w-xl flex-between mb-8">
        <div>
          <h1 className="text-2xl tracking-tight">{companyName}</h1>
          <p className="text-sm text-[var(--text-secondary)]">Powered by Viri</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSettings(!showSettings)} 
            className={`btn btn-outline p-2 rounded-full ${showSettings ? 'text-[var(--color-success)] border-[var(--color-success)]' : ''}`}
            title="Configure Extension ID"
          >
            <Settings size={18} />
          </button>
          <span className="badge badge-success">Online</span>
        </div>
      </div>

      {/* Extension Settings Panel */}
      {showSettings && (
        <div className="w-full max-w-xl mb-6 glass-panel border-[var(--color-accent)] animate-fade-in">
          <h3 className="text-md font-semibold mb-2 flex items-center gap-2">
            <Settings size={16} /> Viri Terminal Settings
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Configure licensing server coordinates and your local terminal credentials.
          </p>
          
          <div className="input-group">
            <label className="input-label">Terminal Hardware ID (Unique)</label>
            <input 
              type="text" 
              className="input-field opacity-60" 
              value={hardwareId}
              readOnly
            />
            <span className="text-[10px] text-[var(--text-secondary)]">
              Register this ID in your admin panel to activate this terminal counter.
            </span>
          </div>

          <div className="input-group mt-3">
            <label className="input-label">Viri Bridge Extension ID</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="e.g., oipcnkdpbdfkgjpdmnobk..." 
              value={extensionId}
              onChange={(e) => setExtensionId(e.target.value.trim())}
            />
          </div>

          <div className="input-group mt-3">
            <label className="input-label">Viri Backend API Endpoint</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="e.g., https://soft.thinksafe.mv/viri/api" 
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value.trim())}
            />
          </div>

          {/* Bank Accounts Manager */}
          <div className="mt-6 pt-6 border-t border-[var(--border-color)]">
            <h4 className="text-sm font-semibold mb-3">Managed Bank Accounts</h4>
            
            <div className="space-y-2 mb-4">
              {bankAccounts.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)] italic">No accounts added yet.</p>
              ) : (
                bankAccounts.map(acc => (
                  <div key={acc.id} className="flex-between p-2 bg-[var(--bg-canvas)] border border-[var(--border-color)] rounded-md text-sm">
                    <div>
                      <span className="font-medium text-[var(--text-primary)]">{acc.bank_name}</span> - {acc.account_name} 
                      <span className="text-[var(--text-secondary)] text-xs ml-1">(...{acc.account_number.slice(-4)})</span>
                    </div>
                    <button onClick={() => handleDeleteAccount(acc.id)} className="text-[var(--color-warning)] hover:opacity-70">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-color)] rounded-md">
              <h5 className="text-xs font-semibold mb-2">Add New Account</h5>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select 
                  className="input-field text-sm p-1.5"
                  value={newBankName}
                  onChange={e => setNewBankName(e.target.value)}
                >
                  <option value="BML">BML</option>
                  <option value="MIB">MIB</option>
                </select>
                <input 
                  type="text" 
                  placeholder="Account Name (e.g. Savings)" 
                  className="input-field text-sm p-1.5"
                  value={newAccountName}
                  onChange={e => setNewAccountName(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Account Number" 
                  className="input-field text-sm p-1.5 flex-1"
                  value={newAccountNumber}
                  onChange={e => setNewAccountNumber(e.target.value)}
                />
                <button 
                  onClick={handleAddAccount}
                  disabled={isAddingAccount || !newAccountName || !newAccountNumber}
                  className="btn btn-primary px-3 py-1 text-xs whitespace-nowrap"
                >
                  <Plus size={14} className="mr-1 inline" /> Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-xl grid gap-6">
        
        {/* Main Verification Panel */}
        <div className="glass-panel animate-fade-in">
          <div className="mb-6 flex-between">
            <h2 className="text-xl">Verify Transfer</h2>
            <div className="flex bg-[var(--bg-canvas)] rounded-lg p-1 border border-[var(--border-color)]">
              {/* Removed hardcoded BML/MIB buttons since we now use the dynamic accounts dropdown below */}
              {initLoading && <span className="text-xs text-[var(--text-secondary)] px-2">Loading...</span>}
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3 bg-[var(--color-warning-bg)] border border-[var(--color-warning)] border-opacity-30 rounded-lg flex items-center gap-3 text-sm text-[var(--color-warning)]">
              <AlertTriangle className="shrink-0" size={18} />
              <p>{error}</p>
            </div>
          )}

          {/* Success Result Panel */}
          {result && (
            <div className="mb-6 p-4 bg-[var(--color-success-bg)] border border-[var(--color-success)] border-opacity-30 rounded-lg animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="text-[var(--color-success)]" size={18} />
                <span className="font-semibold text-[var(--color-success)]">Transfer Verified</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)] mt-2">
                <div>Status: <span className="font-mono text-[var(--text-primary)]">{result.status}</span></div>
                <div>Reference: <span className="font-mono text-[var(--text-primary)]">{result.reference}</span></div>
                <div>Amount: <span className="font-mono text-[var(--text-primary)]">{result.amount} MVR</span></div>
                <div>Time: <span className="font-mono text-[var(--text-primary)]">{new Date(result.timestamp).toLocaleTimeString()}</span></div>
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Target Amount (MVR)</label>
            <input 
              type="number" 
              className="input-field text-2xl font-semibold" 
              placeholder="0.00" 
              value={amount}
              disabled={loading}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="input-group mt-4">
            <label className="input-label">Receiving Account</label>
            <select 
              className="input-field appearance-none cursor-pointer"
              value={selectedAccountId}
              disabled={loading || bankAccounts.length === 0}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              {bankAccounts.length === 0 && (
                <option value="">No accounts configured</option>
              )}
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id.toString()}>
                  {acc.bank_name} - {acc.account_name} (...{acc.account_number.slice(-4)})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between mt-4 mb-8">
            <label className="text-sm text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer">
              <span>Set as Default Account</span>
            </label>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={isDefault} 
                disabled={loading}
                onChange={(e) => setIsDefault(e.target.checked)} 
              />
              <span className="slider"></span>
            </label>
          </div>

          <button 
            onClick={handleVerify}
            disabled={loading}
            className={`btn btn-success w-full py-3 text-lg justify-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <>
                <RefreshCw size={20} className="animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle size={20} />
                Verify Transfer
              </>
            )}
          </button>
        </div>

        {/* Analytics Node */}
        <div className="glass-panel animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex-between mb-4">
            <h3 className="text-lg text-[var(--text-secondary)]">Daily Totals</h3>
            <button className="btn btn-outline px-2 py-1 text-xs">
              <RefreshCw size={14} /> Sync
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {bankAccounts.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No active accounts.</p>
            ) : (
              bankAccounts.map((acc) => (
                <div key={acc.id} className="bg-[var(--bg-canvas)] p-4 rounded-lg border border-[var(--border-color)]">
                  <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                    {acc.account_name} (...{acc.account_number.slice(-4)})
                  </p>
                  <p className="text-2xl font-bold text-[var(--color-success)]">
                    {(totals[acc.id.toString()] || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-normal text-[var(--text-secondary)]">MVR</span>
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
