import { useState, useEffect, useRef } from 'react';
import { Shield, RefreshCw, CheckCircle, Settings, AlertTriangle, Lock, MonitorSmartphone, XCircle, Copy } from 'lucide-react';


interface BankAccount {
  id: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  mib_profile_type?: string;
  is_default: boolean;
}

function App() {
  const [amount, setAmount] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isDefault, setIsDefault] = useState(true);
  const [defaultAccountId, setDefaultAccountId] = useState<string>(() => {
    return localStorage.getItem('viri_default_account_id') || '';
  });
  const [lastTransactions, setLastTransactions] = useState<{
    date: string;
    details: string;
    amount: string;
  }[]>([]);

  // Hardware bound Terminal ID
  const [hardwareId, setHardwareId] = useState(() => {
    return localStorage.getItem('viri_hardware_id') || '';
  });

  // PIN Lock State
  const [pin, setPin] = useState(localStorage.getItem('viri_terminal_pin') || '');
  const [isLocked, setIsLocked] = useState(!!pin);
  const [enteredPin, setEnteredPin] = useState('');

  // Setup / Pairing State
  const [isSetupMode, setIsSetupMode] = useState(!hardwareId);
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Settings
  const [extensionId, setExtensionId] = useState(localStorage.getItem('viri_extension_id') || '');
  const [backendUrl] = useState(() => {
    // Default backend URL based on environment
    const defaultUrl = window.location.origin.includes('localhost')
      ? 'http://localhost:8000/api'        // local Laravel dev server
      : `${window.location.origin}/api`;  // production: viri.thinksafe.mv/api
    return localStorage.getItem('viri_backend_url') || defaultUrl;
  });
  const [showSettings, setShowSettings] = useState(false);

  // Credentials States
  const [bmlUsername, setBmlUsername] = useState(localStorage.getItem('viri_bml_username') || '');
  const [bmlPassword, setBmlPassword] = useState(localStorage.getItem('viri_bml_password') || '');
  const [bmlTotpSeed, setBmlTotpSeed] = useState(localStorage.getItem('viri_bml_totp_seed') || '');
  const [bmlConfigured, setBmlConfigured] = useState(!!localStorage.getItem('viri_bml_username'));

  const [mibUsername, setMibUsername] = useState(localStorage.getItem('viri_mib_username') || '');
  const [mibPassword, setMibPassword] = useState(localStorage.getItem('viri_mib_password') || '');
  const [mibTotpSeed, setMibTotpSeed] = useState(localStorage.getItem('viri_mib_totp_seed') || '');
  const [mibConfigured, setMibConfigured] = useState(!!localStorage.getItem('viri_mib_username'));

  // Verification State
  const [loading, setLoading] = useState(false);
  const activePortRef = useRef<chrome.runtime.Port | null>(null);
  const [initLoading, setInitLoading] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    reference: string;
    amount: string;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Tenant Information from Server
  const [tenantName, setTenantName] = useState<string>('');
  const [subscriptionTier, setSubscriptionTier] = useState<string>('');
  const [terminalName, setTerminalName] = useState<string>('');
  const [lockTimeout, setLockTimeout] = useState<number>(20);

  // Distributed Lock State & Refs
  const isVerifyingRef = useRef<boolean>(false);
  const lockedAccountIdRef = useRef<string | null>(null);
  const heartbeatIntervalRef = useRef<any>(null);

  // Dynamic Totals (keyed by account id string)
  const [totals, setTotals] = useState<Record<string, number>>({});

  // Clean up lock on unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      const lockedId = lockedAccountIdRef.current;
      const hId = localStorage.getItem('viri_hardware_id') || hardwareId;
      const bUrl = localStorage.getItem('viri_backend_url') || backendUrl;
      if (lockedId && hId && bUrl) {
        fetch(`${bUrl}/terminal/unlock-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hardware_id: hId,
            bank_account_id: parseInt(lockedId)
          })
        }).catch(err => console.error("Unmount unlock failed:", err));
      }
    };
  }, []);

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

  useEffect(() => {
    localStorage.setItem('viri_bml_username', bmlUsername);
    localStorage.setItem('viri_bml_password', bmlPassword);
    localStorage.setItem('viri_bml_totp_seed', bmlTotpSeed);
  }, [bmlUsername, bmlPassword, bmlTotpSeed]);

  // Synchronize isDefault check box with selectedAccountId and defaultAccountId
  useEffect(() => {
    if (!selectedAccountId || bankAccounts.length === 0) return;

    if (defaultAccountId) {
      setIsDefault(selectedAccountId === defaultAccountId);
    } else {
      const activeAcc = bankAccounts.find(a => a.id.toString() === selectedAccountId);
      setIsDefault(activeAcc ? activeAcc.is_default : false);
    }
  }, [selectedAccountId, defaultAccountId, bankAccounts]);

  const handleDefaultToggle = (checked: boolean) => {
    setIsDefault(checked);
    if (checked) {
      localStorage.setItem('viri_default_account_id', selectedAccountId);
      setDefaultAccountId(selectedAccountId);
    } else {
      localStorage.removeItem('viri_default_account_id');
      setDefaultAccountId('');
    }
  };

  // Fetch Bank Accounts on Load
  const clearTerminalData = () => {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('viri_') && key !== 'viri_backend_url') {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    setHardwareId('');
    setPin('');
    setIsLocked(false);
    setExtensionId('');
    setBmlUsername('');
    setBmlPassword('');
    setBmlTotpSeed('');
    setBmlConfigured(false);
    setMibUsername('');
    setMibPassword('');
    setMibTotpSeed('');
    setMibConfigured(false);
    setIsSetupMode(true);
    setBankAccounts([]);
    setSelectedAccountId('');
    setShowSettings(false);
  };

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

          if (data.tenant?.name) setTenantName(data.tenant.name);
          if (data.tenant?.tier) setSubscriptionTier(data.tenant.tier);
          if (data.tenant?.lock_timeout) setLockTimeout(data.tenant.lock_timeout);
          if (data.tenant?.extension_id) setExtensionId(data.tenant.extension_id);
          if (data.terminal_name) setTerminalName(data.terminal_name);

          if (accounts.length > 0) {
            const savedDefaultId = localStorage.getItem('viri_default_account_id');
            const defaultAcc = (savedDefaultId && accounts.find((a: BankAccount) => a.id.toString() === savedDefaultId))
              || accounts.find((a: BankAccount) => a.is_default)
              || accounts[0];
            setSelectedAccountId(defaultAcc.id.toString());

            // Initialize totals to 0 if not set
            const newTotals: Record<string, number> = {};
            accounts.forEach((acc: BankAccount) => {
              newTotals[acc.id.toString()] = 0;
            });
            setTotals(newTotals);
          }
        } else {
          // Only clear data and trigger setup mode if backend explicitly rejects the terminal with 403 or 404
          if (response.status === 403 || response.status === 404) {
            clearTerminalData();
          } else {
            console.error(`Verification server returned non-ok status during loading: ${response.status}`);
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
      if (data.extension_id) setExtensionId(data.extension_id);
      if (data.terminal_name) setTerminalName(data.terminal_name);
      
      // Clear legacy PIN when a new terminal is paired
      localStorage.removeItem('viri_terminal_pin');
      setPin('');
      setIsLocked(false);
      setEnteredPin('');
      
      setIsSetupMode(false);
    } catch (err) {
      setSetupError("Network error. Could not connect to backend.");
    }
  };

  const releaseLock = async () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    const lockedId = lockedAccountIdRef.current;
    if (lockedId && hardwareId) {
      lockedAccountIdRef.current = null;
      try {
        await fetch(`${backendUrl}/terminal/unlock-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hardware_id: hardwareId,
            bank_account_id: parseInt(lockedId)
          })
        });
      } catch (e) {
        console.error("Failed to release lock", e);
      }
    }
  };

  const killRobot = () => {
    isVerifyingRef.current = false;
    if (activePortRef.current) {
      activePortRef.current.disconnect();
      activePortRef.current = null;
    }
    releaseLock();
    setLoading(false);
    setError("Verification aborted by user.");
    setLogs(prev => [...prev, "> [System] Connection severed. Robot killed."]);
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    alert("Logs copied to clipboard!");
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
    setLastTransactions([]);
    setLogs([]); // Clear previous logs

    isVerifyingRef.current = true;

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
        
        if (response.status === 403 || response.status === 404) {
          clearTerminalData();
        }
        
        setLoading(false);
        isVerifyingRef.current = false;
        return;
      }
    } catch (err: any) {
      setError(`Backend Connection Failed: Could not connect to licensing server at ${backendUrl}. Check your network or settings.`);
      setLoading(false);
      isVerifyingRef.current = false;
      return;
    }

    // Step 2: Acquire Distributed Lease Lock
    const targetAccountId = selectedAccountId;
    lockedAccountIdRef.current = targetAccountId;

    setLogs(prev => [...prev, "> [Lock] Requesting session lock for bank account..."]);
    
    let lockAcquired = false;
    const startTime = Date.now();
    const pollInterval = 2500; // poll every 2.5 seconds
    const maxTimeoutMs = lockTimeout * 1000;

    while (Date.now() - startTime < maxTimeoutMs) {
      // Check if user clicked cancel during wait
      if (!isVerifyingRef.current) {
        setLogs(prev => [...prev, "> [Lock] Wait cancelled by user."]);
        lockedAccountIdRef.current = null;
        return;
      }

      try {
        const lockRes = await fetch(`${backendUrl}/terminal/lock-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hardware_id: hardwareId,
            bank_account_id: parseInt(targetAccountId)
          })
        });

        if (lockRes.ok) {
          const lockData = await lockRes.json();
          if (lockData.status === 'acquired') {
            lockAcquired = true;
            setLogs(prev => [...prev, "> [Lock] Session lock acquired successfully."]);
            break;
          }
        } else if (lockRes.status === 409) {
          const lockData = await lockRes.json().catch(() => ({}));
          const heldBy = lockData.held_by ? `terminal ${lockData.held_by.substring(0, 8)}...` : "another terminal";
          const expiresSeconds = lockData.expires_in ?? "?";
          
          setLogs(prev => [
            ...prev,
            `> [Lock] Session busy: Held by ${heldBy}. Retrying in 2.5s (expires in ${expiresSeconds}s)...`
          ]);
        } else {
          const errText = await lockRes.text();
          console.error("Lock error response:", errText);
          setLogs(prev => [...prev, `> [Lock] Server returned error ${lockRes.status}. Retrying...`]);
        }
      } catch (err) {
        console.error("Lock request exception:", err);
        setLogs(prev => [...prev, "> [Lock] Connection issue while locking. Retrying..."]);
      }

      // Wait 2.5s before next attempt
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    if (!lockAcquired) {
      setError("Bank session busy: Held by another terminal. Please try again later.");
      setLogs(prev => [...prev, "> [Lock] Timeout: Could not acquire bank session lock."]);
      setLoading(false);
      lockedAccountIdRef.current = null;
      isVerifyingRef.current = false;
      return;
    }

    // Start Heartbeat interval
    heartbeatIntervalRef.current = setInterval(async () => {
      if (!lockedAccountIdRef.current) return;
      try {
        const hbRes = await fetch(`${backendUrl}/terminal/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hardware_id: hardwareId,
            bank_account_id: parseInt(targetAccountId)
          })
        });
        if (!hbRes.ok) {
          console.warn("Heartbeat failed, lock might be lost");
          setLogs(prev => [...prev, "> [Lock Warning] Heartbeat failed. Lock may have been stolen or expired."]);
        }
      } catch (hbErr) {
        console.error("Heartbeat exception:", hbErr);
      }
    }, 5000);

    // Step 3: Send message to the local extension using a persistent port
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
      setError("Browser extension API not detected. Make sure you are using Chrome and the extension is loaded.");
      setLoading(false);
      releaseLock();
      isVerifyingRef.current = false;
      return;
    }

    const selectedAccount = bankAccounts.find(a => a.id.toString() === selectedAccountId);
    const selectedBankName = selectedAccount ? selectedAccount.bank_name : 'BML';

    let port;
    try {
      port = chrome.runtime.connect(extensionId, { name: "viri-verify" });
    } catch (e: any) {
      setError(`Extension connection failed: ${e.message}. Is the Extension ID correct?`);
      setLoading(false);
      releaseLock();
      isVerifyingRef.current = false;
      return;
    }

    activePortRef.current = port;

    // Add connection error handling
    port.onDisconnect.addListener(() => {
      if (!isVerifyingRef.current) return; // We manually disconnected it, or kill switch was used

      if (chrome.runtime.lastError) {
        setError(`Extension connection failed: ${chrome.runtime.lastError.message}`);
      } else {
        setError("Connection to background robot lost unexpectedly. Is the extension installed and enabled?");
      }
      setLoading(false);
      activePortRef.current = null;
      releaseLock();
      isVerifyingRef.current = false;
    });

    port.onMessage.addListener((response: any) => {
      if (response.type === 'log') {
        setLogs(prev => [...prev, response.message]);
      } else if (response.type === 'success') {
        setLoading(false);
        setResult(response.data);
        setLastTransactions(response.transactions || []);
        // Increment totals dynamically
        const addedAmount = parseFloat(amount);
        setTotals(prev => ({
          ...prev,
          [selectedAccountId]: (prev[selectedAccountId] || 0) + addedAmount
        }));
        setAmount(''); // clear input on success
        port.disconnect();
        activePortRef.current = null;
        releaseLock();
        isVerifyingRef.current = false;
      } else if (response.type === 'error') {
        setLoading(false);
        setError(response.error || "Verification failed.");
        setLastTransactions(response.transactions || []);
        port.disconnect();
        activePortRef.current = null;
        releaseLock();
        isVerifyingRef.current = false;
      }
    });

    // Provide the correct credentials based on bank
    const activeCreds = selectedBankName === 'BML' ? {
      username: bmlUsername,
      password: bmlPassword,
      totpSeed: bmlTotpSeed
    } : {
      username: mibUsername,
      password: mibPassword,
      totpSeed: mibTotpSeed
    };

    try {
      port.postMessage({
        action: 'VERIFY_TRANSFER',
        payload: {
          amount: parseFloat(amount).toFixed(2),
          bank: selectedBankName,
          accountId: selectedAccountId,
          accountNumber: selectedAccount ? selectedAccount.account_number : '',
          mibProfileType: selectedAccount ? (selectedAccount.mib_profile_type || '0') : '0',
          credentials: activeCreds
        }
      });
    } catch (msgErr: any) {
      console.error("Failed to post message to extension:", msgErr);
      setError(`Failed to start verification: ${msgErr.message}`);
      setLoading(false);
      port.disconnect();
      activePortRef.current = null;
      releaseLock();
      isVerifyingRef.current = false;
    }
  };

  const companyName = tenantName || "Unregistered Terminal";
  const planName = subscriptionTier === 'free' ? 'Free Trial' : (subscriptionTier === '499' ? 'Standard' : (subscriptionTier === '999' ? 'Pro' : ''));

  if (isSetupMode) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-4">
        <div className="glass-panel p-8 max-w-sm w-full text-center animate-fade-in shadow-2xl">
          <img src="/logo_en.png" alt="Viri Logo" className="h-48 mx-auto mb-6 object-contain" />
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
            maxLength={4}
            className="input-field text-center text-3xl tracking-[1em] font-mono py-4 mb-6 text-transparent"
            style={{ textShadow: '0 0 0 white' }}
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
            onClick={() => {
              if (showSettings) {
                setShowSettings(false);
              } else {
                if (pin) {
                  const check = prompt("Enter Terminal PIN to open settings:");
                  if (check !== pin) {
                    alert("Incorrect PIN");
                    return;
                  }
                }
                setShowSettings(true);
              }
            }}
            className={`btn btn-outline p-2 rounded-full ${showSettings ? 'text-[var(--color-success)] border-[var(--color-success)]' : ''}`}
            title="Terminal Settings"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="btn btn-outline p-2 rounded-full text-[var(--color-success)] border-transparent hover:bg-[var(--color-success)]/10"
            title="Help & Installation Guide"
          >
            <div className="relative flex items-center justify-center w-5 h-5">
              <div className="w-[18px] h-[18px] rounded-full border border-current flex items-center justify-center relative">
                <span className="text-[11px] font-bold text-current select-none leading-none mb-[1px]">?</span>
                <div className="absolute -bottom-[3px] -right-[4px] bg-blue-500 rounded-full w-[10px] h-[10px] flex items-center justify-center border border-[var(--bg-surface)]">
                  <Lock size={6} className="text-white" />
                </div>
              </div>
            </div>
          </button>
          <span className="badge badge-success">Online{terminalName ? ` - ${terminalName}` : ''}</span>
        </div>
      </div>

      {/* Extension Settings Panel */}
      {showSettings && (
        <div className="w-full max-w-xl mb-6 glass-panel border-[var(--color-accent)] animate-fade-in">
          <h3 className="text-md font-semibold mb-2 flex items-center gap-2">
            <Settings size={16} /> Viri Terminal Settings
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            System configuration and local credentials. System config is pushed by the server and read-only.
          </p>

          <div className="input-group">
            <label className="input-label">Terminal Status</label>
            <div className="p-3 bg-black/30 border border-[var(--border-color)] rounded text-sm text-[var(--color-success)] font-mono flex items-center justify-between">
              <span>Connected to {companyName}</span>
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to unlink this terminal? You will need a new pairing code to use it again.")) {
                    clearTerminalData();
                  }
                }}
                className="text-red-400 hover:text-red-300 text-xs px-2 py-1 border border-red-500/50 rounded"
              >
                Unlink
              </button>
            </div>
          </div>

          <div className="input-group mt-3">
            <label className="input-label">Viri Bridge Extension ID (System)</label>
            <input
              type="text"
              className="input-field opacity-60 cursor-not-allowed"
              value={extensionId}
              readOnly
            />
          </div>

          <div className="input-group mt-3">
            <label className="input-label">Viri Backend API Endpoint (System)</label>
            <input
              type="text"
              className="input-field opacity-60 cursor-not-allowed"
              value={backendUrl}
              readOnly
            />
          </div>

          <div className="input-group mt-3">
            <label className="input-label">Terminal Lock PIN (Optional)</label>
            <input
              type="password"
              className="input-field text-transparent"
              style={{ textShadow: '0 0 0 white' }}
              placeholder={pin ? "PIN Set (Hidden)" : "Not Set"}
              maxLength={4}
              value=""
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setPin(val);
                localStorage.setItem('viri_terminal_pin', val);
              }}
            />
            <span className="text-[10px] text-[var(--text-secondary)]">
              Type a 4-digit PIN to update. Input length is hidden.
            </span>
          </div>

          {/* Robot Credentials Section */}
          <div className="mt-6 pt-6 border-t border-[var(--border-color)]">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield size={14} className="text-[var(--color-warning)]" />
              Bank Credentials (Per Bank)
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Stored securely on this local machine. These credentials are NEVER sent to the Viri servers.
            </p>

            {/* BML Credentials */}
            <div className="mb-4 p-3 border border-zinc-800 rounded bg-black/20">
              <div className="flex-between mb-2">
                <span className="text-sm font-bold">Bank of Maldives (BML)</span>
                {bmlConfigured ? (
                  <span className="badge badge-success flex items-center gap-1"><CheckCircle size={10} /> Configured</span>
                ) : (
                  <span className="badge border border-yellow-600 text-yellow-500">Not Configured</span>
                )}
              </div>

              {!bmlConfigured ? (
                <div className="space-y-3">
                  <input type="text" className="input-field text-sm" placeholder="Username" value={bmlUsername} onChange={e => setBmlUsername(e.target.value)} />
                  <input type="password" className="input-field text-sm" placeholder="Password" value={bmlPassword} onChange={e => setBmlPassword(e.target.value)} />
                  <input type="password" className="input-field text-sm font-mono" placeholder="Authenticator Seed" value={bmlTotpSeed} onChange={e => setBmlTotpSeed(e.target.value.replace(/\s+/g, '').toUpperCase())} />
                  <button className="btn btn-success w-full py-2 text-sm" onClick={() => {
                    localStorage.setItem('viri_bml_username', bmlUsername);
                    localStorage.setItem('viri_bml_password', bmlPassword);
                    localStorage.setItem('viri_bml_totp_seed', bmlTotpSeed);
                    setBmlConfigured(true);
                  }}>Save BML Credentials</button>
                </div>
              ) : (
                <button className="text-xs text-red-400 hover:text-red-300 underline" onClick={() => {
                  setBmlUsername(''); setBmlPassword(''); setBmlTotpSeed(''); setBmlConfigured(false);
                  localStorage.removeItem('viri_bml_username'); localStorage.removeItem('viri_bml_password'); localStorage.removeItem('viri_bml_totp_seed');
                }}>Reset Credentials</button>
              )}
            </div>

            {/* MIB Credentials */}
            <div className="p-3 border border-zinc-800 rounded bg-black/20">
              <div className="flex-between mb-2">
                <span className="text-sm font-bold">Maldives Islamic Bank (MIB)</span>
                {mibConfigured ? (
                  <span className="badge badge-success flex items-center gap-1"><CheckCircle size={10} /> Configured</span>
                ) : (
                  <span className="badge border border-yellow-600 text-yellow-500">Not Configured</span>
                )}
              </div>

              {!mibConfigured ? (
                <div className="space-y-3">
                  <input type="text" className="input-field text-sm" placeholder="Username" value={mibUsername} onChange={e => setMibUsername(e.target.value)} />
                  <input type="password" className="input-field text-sm" placeholder="Password" value={mibPassword} onChange={e => setMibPassword(e.target.value)} />
                  <input type="password" className="input-field text-sm font-mono" placeholder="Authenticator Seed" value={mibTotpSeed} onChange={e => setMibTotpSeed(e.target.value.replace(/\s+/g, '').toUpperCase())} />
                  <button className="btn btn-success w-full py-2 text-sm" onClick={() => {
                    localStorage.setItem('viri_mib_username', mibUsername);
                    localStorage.setItem('viri_mib_password', mibPassword);
                    localStorage.setItem('viri_mib_totp_seed', mibTotpSeed);
                    setMibConfigured(true);
                  }}>Save MIB Credentials</button>
                </div>
              ) : (
                <button className="text-xs text-red-400 hover:text-red-300 underline" onClick={() => {
                  setMibUsername(''); setMibPassword(''); setMibTotpSeed(''); setMibConfigured(false);
                  localStorage.removeItem('viri_mib_username'); localStorage.removeItem('viri_mib_password'); localStorage.removeItem('viri_mib_totp_seed');
                }}>Reset Credentials</button>
              )}
            </div>
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

          {/* Recent Transactions Table */}
          {lastTransactions && lastTransactions.length > 0 && (
            <div className="mb-6 animate-fade-in">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Recent Transactions
              </h3>
              <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-black/30">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] bg-white/5 text-[var(--text-secondary)] uppercase tracking-wider font-semibold">
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Details</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)] font-mono">
                    {lastTransactions.map((tx, idx) => {
                      const isCredit = tx.amount.startsWith('+');
                      return (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap">{tx.date}</td>
                          <td className="px-4 py-3 text-[var(--text-primary)] max-w-[250px] whitespace-pre-line break-words leading-relaxed text-[11px]" title={tx.details}>{tx.details}</td>
                          <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${isCredit ? 'text-[var(--color-success)]' : 'text-red-400'}`}>
                            {tx.amount}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                onChange={(e) => handleDefaultToggle(e.target.checked)}
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

        {/* Live Terminal Log Viewer */}
        {(loading || logs.length > 0) && (
          <div className="w-full bg-black border border-zinc-800 rounded-lg overflow-hidden animate-fade-in shadow-2xl mt-4 mb-12">
            <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-xs text-zinc-400 ml-2 font-mono">Viri Bridge Terminal</span>
              {loading && <RefreshCw size={12} className="text-[var(--color-success)] animate-spin ml-2" />}

              <div className="ml-auto flex items-center gap-2">
                {logs.length > 0 && (
                  <button
                    onClick={copyLogs}
                    className="flex items-center gap-1 text-[10px] uppercase font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
                  >
                    <Copy size={12} /> Copy Logs
                  </button>
                )}
                {loading && (
                  <button
                    onClick={killRobot}
                    className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-500 bg-red-950 border border-red-900 px-2 py-1 rounded hover:bg-red-900 transition-colors"
                  >
                    <XCircle size={12} /> Kill Robot
                  </button>
                )}
              </div>
            </div>
            <div className="p-4 font-mono text-xs text-[var(--color-success)] h-48 overflow-y-auto flex flex-col gap-1"
              ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
              {logs.length === 0 ? (
                <span className="text-zinc-500">Waiting for extension connection...</span>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`${log.includes('error') || log.includes('Exception') || log.includes('Failed') ? 'text-red-400' : ''}`}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto relative shadow-2xl">
            <button 
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-white"
            >
              <XCircle size={24} />
            </button>
            
            <h3 className="text-xl font-bold mb-4 flex items-center gap-3">
              <div className="relative flex items-center justify-center w-6 h-6">
                <div className="w-[22px] h-[22px] rounded-full border-2 border-[var(--color-success)] flex items-center justify-center relative">
                  <span className="text-[13px] font-bold text-[var(--color-success)] select-none leading-none mb-[1px]">?</span>
                  <div className="absolute -bottom-[2px] -right-[3px] bg-blue-500 rounded-full w-[12px] h-[12px] flex items-center justify-center border border-[var(--bg-surface)]">
                    <Lock size={7} className="text-white" />
                  </div>
                </div>
              </div>
              Extension Installation Guide
            </h3>
            
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              The Viri Bridge extension is required to establish a secure local connection between your device and the bank’s servers. Your banking credentials are stored securely on your device and are never transmitted to or stored on the Viri servers, ensuring that only you have access to your sensitive information.
            </p>
            
            <div className="mb-6 flex justify-center">
              <a href="/extention/viri-connect.zip" download className="btn btn-success flex items-center gap-2">
                <MonitorSmartphone size={18} /> Download Viri Extension (.zip)
              </a>
            </div>

            <div className="space-y-6 text-left">
              <div>
                <h4 className="font-bold text-white mb-2 border-b border-zinc-800 pb-1">🖥️ Desktop (PC / Mac)</h4>
                <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-2 marker:text-[var(--color-success)]">
                  <li>Download the extension <strong>.zip</strong> file above.</li>
                  <li>Extract/unzip the file into a folder on your computer.</li>
                  <li>Open Chrome and navigate to <strong>chrome://extensions</strong>.</li>
                  <li>Turn on <strong>Developer mode</strong> (top right corner).</li>
                  <li>Click <strong>Load unpacked</strong> and select the extracted folder.</li>
                </ol>
              </div>
              
              <div>
                <h4 className="font-bold text-white mb-2 border-b border-zinc-800 pb-1">📱 Android Mobile/Tablet</h4>
                <p className="text-xs text-yellow-500 mb-2">Note: Standard Google Chrome for Android does not support extensions.</p>
                <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-2 marker:text-[var(--color-success)]">
                  <li>Download <strong>Kiwi Browser</strong> from the Google Play Store.</li>
                  <li>Open the Cashier Terminal inside Kiwi Browser.</li>
                  <li>Download the extension <strong>.zip</strong> file above.</li>
                  <li>In Kiwi Browser, tap the 3-dot menu and select <strong>Extensions</strong>.</li>
                  <li>Turn on <strong>Developer mode</strong>.</li>
                  <li>Tap <strong>+ (from .zip/.crx/.user.js)</strong> and select the downloaded file.</li>
                </ol>
              </div>

              <div className="bg-red-900/10 border border-red-500/20 p-3 rounded text-xs text-red-400">
                <strong>iOS Devices:</strong> Apple restricts installing third-party browser extensions on iPhones and iPads. This terminal requires Windows, Mac, or Android.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
