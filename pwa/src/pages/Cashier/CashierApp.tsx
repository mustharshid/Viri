import { useState, useEffect } from 'react';
import { Shield, RefreshCw, CheckCircle, Settings, AlertTriangle, Lock, MonitorSmartphone } from 'lucide-react';


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
  
  // Hardware bound Terminal ID
  const [hardwareId, setHardwareId] = useState(() => {
    return localStorage.getItem('viri_hardware_id') || '';
  });
  
  // PIN Lock State
  const [pin, setPin] = useState(localStorage.getItem('viri_terminal_pin') || '');
  const [isLocked, setIsLocked] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');

  // Setup / Pairing State
  const [isSetupMode, setIsSetupMode] = useState(!hardwareId);
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);

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
  
  // Tenant Information from Server
  const [tenantName, setTenantName] = useState<string>('');
  const [subscriptionTier, setSubscriptionTier] = useState<string>('');
  
  // Dynamic Totals (keyed by account id string)
  const [totals, setTotals] = useState<Record<string, number>>({});

  // Persist settings
  useEffect(() => {
    localStorage.setItem('viri_hardware_id', hardwareId);
  }, [hardwareId]);

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
          
          if (data.tenant?.name) {
            setTenantName(data.tenant.name);
          }
          if (data.tenant?.subscription_tier) {
            setSubscriptionTier(data.tenant.subscription_tier);
          }
          
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
        } else {
          // If the backend rejects the hardware_id, force setup mode
          setIsSetupMode(true);
        }
      } catch (err) {
        console.error("Failed to fetch initial terminal data", err);
      } finally {
        setInitLoading(false);
      }
    };
    fetchAccounts();
  }, [hardwareId, backendUrl]);

  const handlePair = async () => {
    if (!pairingCodeInput || pairingCodeInput.length !== 6) {
      setSetupError("Please enter a valid 6-digit code.");
      return;
    }
    setSetupError(null);
    try {
      const res = await fetch(`${backendUrl}/terminal/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairing_code: pairingCodeInput })
      });
      const data = await res.json();
      if (!res.ok) {
        setSetupError(data.error || "Pairing failed.");
        return;
      }
      setHardwareId(data.hardware_id);
      setIsSetupMode(false);
    } catch (err) {
      setSetupError("Network error. Could not connect to backend.");
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

  const companyName = tenantName || "Unregistered Terminal";
  const planName = subscriptionTier === 'free' ? 'Free Trial' : (subscriptionTier === '499' ? 'Standard' : (subscriptionTier === '999' ? 'Pro' : ''));

  if (isSetupMode) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-4">
        <div className="glass-panel p-8 max-w-sm w-full text-center animate-fade-in shadow-2xl">
          <MonitorSmartphone className="mx-auto mb-6 text-[var(--color-success)]" size={56} />
          <h2 className="text-2xl font-bold mb-2">Terminal Setup</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-6">Enter the 6-digit pairing code from your Company Dashboard to link this terminal.</p>
          
          {setupError && (
            <div className="text-red-400 text-sm mb-4 bg-red-900/20 p-3 rounded border border-red-500/30">
              {setupError}
            </div>
          )}

          <input 
            type="text" 
            placeholder="000000" 
            maxLength={6}
            className="input-field text-center text-4xl tracking-widest font-mono py-4 mb-6" 
            value={pairingCodeInput} 
            onChange={e => setPairingCodeInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') handlePair(); }}
          />
          <button 
            onClick={handlePair} 
            className="btn btn-success w-full py-4 text-lg font-bold"
          >
            Link Terminal
          </button>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">
        <div className="glass-panel p-8 max-w-sm w-full text-center animate-fade-in shadow-2xl">
          <Lock className="mx-auto mb-6 text-[var(--color-success)]" size={56} />
          <h2 className="text-2xl font-bold mb-2">Terminal Locked</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-8">Enter your 4-digit PIN to unlock.</p>
          <input 
            type="password" 
            placeholder="••••" 
            maxLength={4}
            className="input-field text-center text-3xl tracking-[1em] font-mono py-4 mb-6" 
            value={enteredPin} 
            onChange={e => setEnteredPin(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (enteredPin === pin) { setIsLocked(false); setEnteredPin(''); }
                else { alert('Incorrect PIN'); setEnteredPin(''); }
              }
            }}
          />
          <button 
            onClick={() => { 
              if (enteredPin === pin) { setIsLocked(false); setEnteredPin(''); } 
              else { alert('Incorrect PIN'); setEnteredPin(''); } 
            }} 
            className="btn btn-success w-full py-4 text-lg font-bold"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

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
          <p className="text-sm text-[var(--text-secondary)]">Powered by Viri {planName && <span className="opacity-70 px-1">• {planName} Plan</span>}</p>
        </div>
        <div className="flex items-center gap-3">
          {pin && (
            <button 
              onClick={() => setIsLocked(true)} 
              className="btn btn-outline p-2 rounded-full hover:bg-[var(--color-warning)] hover:text-black hover:border-transparent transition-colors"
              title="Lock Terminal"
            >
              <Lock size={18} />
            </button>
          )}
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
            <label className="input-label">Terminal Status</label>
            <div className="p-3 bg-black/30 border border-[var(--border-color)] rounded text-sm text-[var(--color-success)] font-mono flex items-center justify-between">
              <span>Connected to {companyName}</span>
              <button 
                onClick={() => {
                  if (confirm("Are you sure you want to unlink this terminal? You will need a new pairing code to use it again.")) {
                    setHardwareId('');
                    setIsSetupMode(true);
                  }
                }}
                className="text-red-400 hover:text-red-300 text-xs px-2 py-1 border border-red-500/50 rounded"
              >
                Unlink
              </button>
            </div>
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

          <div className="input-group mt-3">
            <label className="input-label">Terminal Lock PIN (Optional)</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="e.g. 1234" 
              maxLength={4}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setPin(val);
                localStorage.setItem('viri_terminal_pin', val);
              }}
            />
            <span className="text-[10px] text-[var(--text-secondary)]">
              Set a 4-digit PIN to manually lock this terminal screen.
            </span>
          </div>

          {/* Bank Accounts Manager */}
          <div className="mt-6 pt-6 border-t border-[var(--border-color)]">
            <h4 className="text-sm font-semibold mb-3">Managed Bank Accounts</h4>
            <p className="text-xs text-[var(--text-secondary)] mb-4">Accounts are synced automatically from your company dashboard. You cannot add or remove accounts directly from the terminal.</p>
            
            <div className="space-y-2 mb-4">
              {bankAccounts.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)] italic">No accounts configured. Please add them in the company dashboard.</p>
              ) : (
                bankAccounts.map(acc => (
                  <div key={acc.id} className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-color)] rounded-md text-sm">
                    <div className="font-medium text-[var(--text-primary)]">{acc.bank_name} - {acc.account_name}</div>
                    <div className="text-[var(--text-secondary)] text-xs mt-1">Account Number: {acc.account_number}</div>
                  </div>
                ))
              )}
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
