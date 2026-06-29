import { useState, useEffect, useRef } from 'react';
import { Shield, RefreshCw, Settings, AlertTriangle, Lock, MonitorSmartphone, XCircle, Copy, Loader2, Search, History, BookOpen, BarChart3, Info, HelpCircle, ChevronRight } from 'lucide-react';

const Tooltip = ({ text }: { text: string }) => (
  <div className="relative inline-flex items-center group ml-1.5 cursor-help align-middle">
    <Info size={13} className="text-zinc-500 hover:text-zinc-300 transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-zinc-900 border border-zinc-700 text-white text-[11px] leading-relaxed rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 font-normal normal-case">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700"></div>
    </div>
  </div>
);


const sha256 = async (message: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const computeCredsHash = async (bank: string, username: string): Promise<string> => {
  if (!username) return '';
  return sha256(`${bank}_${username.trim().toLowerCase()}`);
};

interface BankAccount {
  id: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  mib_profile_type?: string;
  is_default: boolean;
  label?: string;
  currency?: string;
  login_failures?: number;
  login_credentials_hash?: string;
}

interface LedgerTransaction {
  date: string;
  details: string;
  amount: string;
  runningBalance?: string;
}

interface LedgerData {
  balance: string;
  lastUpdated: string;
  transactions: LedgerTransaction[];
  error?: string;
}

function App() {
  const [amount, setAmount] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [permissions, setPermissions] = useState<any>({
    verification_enabled: true,
    ledger_enabled: true,
    ledger_show_balance: true,
    ledger_show_debit: true,
    reports_enabled: false,
    show_vbtl: false
  });
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isDefault, setIsDefault] = useState(true);
  const [defaultAccountId, setDefaultAccountId] = useState<string>(() => {
    return localStorage.getItem('viri_default_account_id') || '';
  });
  const [lastTransactions, setLastTransactions] = useState<{
    date: string;
    details: string;
    amount: string;
    runningBalance?: string;
  }[]>([]);
  const [lastPopulatedTime, setLastPopulatedTime] = useState<string>('');
  const [syncTimeElapsed, setSyncTimeElapsed] = useState<number | null>(null);
  const syncStartTimeRef = useRef<number | null>(null);


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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('viri_sidebar_collapsed') === 'true';
  });
  const [ledgerPage, setLedgerPage] = useState(1);

  // Credentials States
  const [accountsCreds, setAccountsCreds] = useState<Record<string, { username?: string; password?: string; totpSeed?: string }>>(() => {
    const saved = localStorage.getItem('viri_accounts_creds');
    return saved ? JSON.parse(saved) : {};
  });

  // Forms States for Inline Config
  const [tempUsername, setTempUsername] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [tempTotpSeed, setTempTotpSeed] = useState('');
  const [expandedCredsAccountId, setExpandedCredsAccountId] = useState<string | null>(null);

  const syncCredentialsToServer = async (newCredsList: any) => {
    const hId = localStorage.getItem('viri_hardware_id') || hardwareId;
    const bUrl = localStorage.getItem('viri_backend_url') || backendUrl;
    if (!hId || !bUrl) return;

    try {
      await fetch(`${bUrl}/terminal/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_id: hId,
          credentials: {
            accounts: newCredsList
          }
        })
      });
    } catch (e) {
      console.error("Error syncing credentials to server:", e);
    }
  };

  const saveAccountCredentials = async (accId: string, uName: string, pWord: string, seed: string) => {
    const updated = {
      ...accountsCreds,
      [accId]: {
        username: uName,
        password: pWord,
        totpSeed: seed
      }
    };
    setAccountsCreds(updated);
    localStorage.setItem('viri_accounts_creds', JSON.stringify(updated));
    await syncCredentialsToServer(updated);
  };

  const clearAccountCredentials = async (accId: string) => {
    const updated = { ...accountsCreds };
    delete updated[accId];
    setAccountsCreds(updated);
    localStorage.setItem('viri_accounts_creds', JSON.stringify(updated));
    await syncCredentialsToServer(updated);
  };

  // Verification State
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'search' | 'history' | 'ledger' | null>(null);

  useEffect(() => {
    if (!loading) {
      setLoadingMode(null);
      syncStartTimeRef.current = null;
    }
  }, [loading]);

  const [activeTab, setActiveTab] = useState<'verify' | 'ledger' | 'reports' | 'help'>('verify');
  const [ledgerCache, setLedgerCache] = useState<Record<string, LedgerData>>(() => {
    const saved = localStorage.getItem('viri_ledger_cache');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('viri_ledger_cache', JSON.stringify(ledgerCache));
  }, [ledgerCache]);

  // Migrate old credentials format to new per-account format
  useEffect(() => {
    const oldBmlUser = localStorage.getItem('viri_bml_username');
    const oldBmlPass = localStorage.getItem('viri_bml_password');
    const oldBmlSeed = localStorage.getItem('viri_bml_totp_seed');

    const oldMibUser = localStorage.getItem('viri_mib_username');
    const oldMibPass = localStorage.getItem('viri_mib_password');
    const oldMibSeed = localStorage.getItem('viri_mib_totp_seed');

    if ((oldBmlUser || oldMibUser) && Object.keys(accountsCreds).length === 0 && bankAccounts.length > 0) {
      const migrated: Record<string, any> = {};
      bankAccounts.forEach(acc => {
        if (acc.bank_name === 'BML' && oldBmlUser) {
          migrated[acc.id.toString()] = {
            username: oldBmlUser,
            password: oldBmlPass || '',
            totpSeed: oldBmlSeed || ''
          };
        } else if (acc.bank_name === 'MIB' && oldMibUser) {
          migrated[acc.id.toString()] = {
            username: oldMibUser,
            password: oldMibPass || '',
            totpSeed: oldMibSeed || ''
          };
        }
      });
      if (Object.keys(migrated).length > 0) {
        setAccountsCreds(migrated);
        localStorage.setItem('viri_accounts_creds', JSON.stringify(migrated));
        syncCredentialsToServer(migrated);
        
        // Clean up old storage keys to avoid re-run
        localStorage.removeItem('viri_bml_username');
        localStorage.removeItem('viri_bml_password');
        localStorage.removeItem('viri_bml_totp_seed');
        localStorage.removeItem('viri_mib_username');
        localStorage.removeItem('viri_mib_password');
        localStorage.removeItem('viri_mib_totp_seed');
      }
    }
  }, [bankAccounts]);

  const syncCredentialsMapping = async (accountsList: BankAccount[]) => {
    if (!hardwareId || !backendUrl || accountsList.length === 0) return;

    const mapping: Record<number, string> = {};
    for (const acc of accountsList) {
      const uName = accountsCreds[acc.id.toString()]?.username;
      if (uName) {
        const hash = await sha256(`${acc.bank_name}_${uName.trim().toLowerCase()}`);
        mapping[acc.id] = hash;
      }
    }

    if (Object.keys(mapping).length === 0) return;

    try {
      await fetch(`${backendUrl}/terminal/bank-accounts/map-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardware_id: hardwareId, mapping })
      });
    } catch (err) {
      console.error('Failed to sync credentials mapping:', err);
    }
  };

  useEffect(() => {
    if (bankAccounts.length > 0) {
      syncCredentialsMapping(bankAccounts);
    }
  }, [bankAccounts, accountsCreds]);


  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState<string>('');

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
  const logsRef = useRef<string[]>([]);
  const addLog = (msg: string) => {
    logsRef.current.push(msg);
    setLogs([...logsRef.current]);
  };

  // Tenant Information from Server
  const [tenantName, setTenantName] = useState<string>('');
  const [subscriptionTier, setSubscriptionTier] = useState<string>('');
  const [terminalName, setTerminalName] = useState<string>('');
  const [lockTimeout, setLockTimeout] = useState<number>(20);

  // Distributed Lock State & Refs
  const isVerifyingRef = useRef<boolean>(false);
  const lockedAccountIdRef = useRef<string | null>(null);
  const heartbeatIntervalRef = useRef<any>(null);

  // Progress State & Countdown Timer
  interface ProgressState {
    stage: 'idle' | 'init' | 'auth' | 'lock' | 'fetch' | 'match' | 'success' | 'error';
    text: string;
    percent: number;
    isIndeterminate: boolean;
  }

  const [progress, rawSetProgress] = useState<ProgressState>({
    stage: 'idle',
    text: '',
    percent: 0,
    isIndeterminate: false
  });

  const getStepIndexForStage = (stage: string, percent: number): number => {
    if (stage === 'init') return 1;
    if (stage === 'lock' || stage === 'auth') return 2;
    if (stage === 'fetch') return 3;
    if (stage === 'match') return 4;
    if (stage === 'success') return 5;
    if (stage === 'error') {
      if (percent >= 95) return 4;
      if (percent >= 75) return 3;
      if (percent >= 45) return 2;
      return 1;
    }
    return 0;
  };

  const setProgress = (nextVal: ProgressState | ((prev: ProgressState) => ProgressState)) => {
    rawSetProgress(prev => {
      const next = typeof nextVal === 'function' ? nextVal(prev) : nextVal;
      
      // Allow reset to idle or initial connection state (Step 1)
      if (next.stage === 'idle' || (next.stage === 'init' && next.percent <= 10)) {
        return next;
      }
      
      const currentIdx = getStepIndexForStage(prev.stage, prev.percent);
      const nextIdx = getStepIndexForStage(next.stage, next.percent);
      
      // Prevent backward progress in terms of stage step index
      if (nextIdx < currentIdx) {
        return {
          ...prev,
          text: next.text || prev.text
        };
      }
      
      // Prevent backward progress in terms of percentage (even if stage index is equal or greater)
      if (next.percent < prev.percent) {
        return {
          ...next,
          percent: prev.percent
        };
      }
      
      return next;
    });
  };
  
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    let timer: any = null;
    if (loading && timeLeft !== null && timeLeft > 3) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev === null) return null;
          if (prev <= 3) return 3;
          return prev - 1;
        });
      }, 1000);
    } else if (!loading) {
      setTimeLeft(null);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [loading, timeLeft]);



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
    localStorage.setItem('viri_accounts_creds', JSON.stringify(accountsCreds));
  }, [accountsCreds]);

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
    setAccountsCreds({});
    setIsSetupMode(true);
    setBankAccounts([]);
    setSelectedAccountId('');
    setShowSettings(false);
  };

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
        if (data.permissions) {
          setPermissions({
            verification_enabled: data.permissions.verification_enabled ?? true,
            ledger_enabled: data.permissions.ledger_enabled ?? true,
            ledger_show_balance: data.permissions.ledger_show_balance ?? true,
            ledger_show_debit: data.permissions.ledger_show_debit ?? true,
            reports_enabled: data.permissions.reports_enabled ?? false,
            show_vbtl: data.permissions.show_vbtl ?? false
          });
        }
        if (data.credits_exhausted !== undefined) {
          setCreditsExhausted(data.credits_exhausted);
        }

        if (data.credentials && data.credentials.accounts) {
          setAccountsCreds(data.credentials.accounts);
          localStorage.setItem('viri_accounts_creds', JSON.stringify(data.credentials.accounts));
        }

        if (accounts.length > 0) {
          const savedDefaultId = localStorage.getItem('viri_default_account_id');
          const defaultAcc = (savedDefaultId && accounts.find((a: BankAccount) => a.id.toString() === savedDefaultId))
            || accounts.find((a: BankAccount) => a.is_default)
            || accounts[0];
          
          setSelectedAccountId(prev => {
            if (prev && accounts.some((a: BankAccount) => a.id.toString() === prev)) {
              return prev;
            }
            return defaultAcc.id.toString();
          });
          
          setSelectedLedgerAccountId(prev => {
            if (prev && accounts.some((a: BankAccount) => a.id.toString() === prev)) {
              return prev;
            }
            return defaultAcc.id.toString();
          });
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

  useEffect(() => {
    fetchAccounts();
  }, [hardwareId, backendUrl]);

  useEffect(() => {
    if (!permissions.ledger_enabled && activeTab === 'ledger') {
      setActiveTab('verify');
    }
    if (!permissions.reports_enabled && activeTab === 'reports') {
      setActiveTab('verify');
    }
  }, [permissions, activeTab]);

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

      // Restore credentials if they exist in the response
      if (data.credentials && data.credentials.accounts) {
        setAccountsCreds(data.credentials.accounts);
        localStorage.setItem('viri_accounts_creds', JSON.stringify(data.credentials.accounts));
      }
      
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

  const parseLogForProgress = (logLine: string): { stage: 'idle' | 'init' | 'auth' | 'lock' | 'fetch' | 'match' | 'success' | 'error'; text: string; percent: number; isIndeterminate: boolean } | null => {
    const lower = logLine.toLowerCase();
    
    // Slow response / internet connection unstable triggers (psychological messaging overrides)
    if (lower.includes('slow') || lower.includes('still processing') || lower.includes('processing your request') || lower.includes('taking longer')) {
      return {
        stage: 'fetch',
        text: 'Bank is processing your request (this may take a few extra seconds)...',
        percent: 80,
        isIndeterminate: true
      };
    }
    if (lower.includes('unstable') || lower.includes('connection is unstable') || lower.includes('failed to fetch') || lower.includes('retrying securely')) {
      return {
        stage: 'init',
        text: 'Connection is unstable. Retrying securely...',
        percent: 30,
        isIndeterminate: true
      };
    }

    // Step 0 & 1: Initialization / Connection
    if (lower.includes('clearing previous') || lower.includes('session cookies') || lower.includes('session initialized') || lower.includes('step 0') || lower.includes('step 1') || lower.includes('initializing session')) {
      return {
        stage: 'init',
        text: 'Preparing secure session...',
        percent: 25,
        isIndeterminate: true
      };
    }

    // Step 2 & 3: Authentication (Login)
    if (lower.includes('submitting primary') || lower.includes('salted auth') || lower.includes('getauthtype') || lower.includes('step 2') || lower.includes('step 3') || lower.includes('authenticating')) {
      return {
        stage: 'auth',
        text: 'Authenticating credentials...',
        percent: 45,
        isIndeterminate: false
      };
    }

    // Step 4: Authentication (OTP Verification)
    if (lower.includes('otp') || lower.includes('totp') || lower.includes('passcode') || lower.includes('2fa') || lower.includes('code') || lower.includes('step 4')) {
      return {
        stage: 'auth',
        text: 'Verifying one-time passcode...',
        percent: 60,
        isIndeterminate: false
      };
    }

    // Step 5 & 6: Data Retrieval (Fetching transactions)
    if (lower.includes('retrieving') || lower.includes('accounts') || lower.includes('ledger') || lower.includes('history') || lower.includes('step 5') || lower.includes('step 6') || lower.includes('latest transactions') || lower.includes('fetching latest')) {
      return {
        stage: 'fetch',
        text: 'Fetching latest transactions...',
        percent: 75,
        isIndeterminate: true
      };
    }

    // Step 7: Downloading activity
    if (lower.includes('downloading') || lower.includes('scraping') || lower.includes('step 7')) {
      return {
        stage: 'fetch',
        text: 'Downloading account activity...',
        percent: 85,
        isIndeterminate: true
      };
    }

    // Step 8+: Matching / Verification
    if (lower.includes('matching') || lower.includes('verifying transaction') || lower.includes('scanning') || lower.includes('step 8') || lower.includes('transfer verified')) {
      return {
        stage: 'match',
        text: 'Scanning for matching transfer...',
        percent: 95,
        isIndeterminate: true
      };
    }

    return null;
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
    addLog("> [System] Connection severed. Robot killed.");
    uploadLogsToServer();
  };

  const uploadLogsToServer = async () => {
    try {
      await fetch(`${backendUrl}/terminal/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_id: hardwareId,
          logs: logsRef.current
        })
      });
    } catch (err) {
      console.error("Failed to upload debug logs:", err);
    }
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    alert("Logs copied to clipboard!");
  };

  const [sessionStatus, setSessionStatus] = useState<'idle' | 'claiming' | 'holder' | 'delegating'>('idle');
  const [sessionHolderAccountId, setSessionHolderAccountId] = useState<string | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (sessionStatus === 'holder' && hardwareId && backendUrl && sessionHolderAccountId) {
      interval = setInterval(async () => {
        try {
          await fetch(`${backendUrl}/terminal/session/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hardware_id: hardwareId,
              bank_account_id: parseInt(sessionHolderAccountId)
            })
          });

          // Wake up the extension to ping the bank and keep the bank's own idle timer alive
          if (typeof chrome !== 'undefined' && chrome.runtime && extensionId) {
            chrome.runtime.sendMessage(extensionId, { action: 'PING_BANK' }).catch(() => {});
          }
        } catch (e) {
          console.error("PWA Heartbeat failed:", e);
        }
      }, 20000);
    }
    return () => clearInterval(interval);
  }, [sessionStatus, hardwareId, backendUrl, sessionHolderAccountId, extensionId]);

  const resolveSessionStrategy = async (accountId: string) => {
    try {
      const response = await fetch(`${backendUrl}/terminal/session/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_id: hardwareId,
          bank_account_id: parseInt(accountId)
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.is_self && data.is_live) {
          return 'FETCH_ONLY';
        } else if (data.is_live) {
          return 'DELEGATE';
        }
      }
    } catch (e) {
      console.error("Failed to check session status:", e);
    }
    return 'CLAIM_AND_LOGIN';
  };

  const executeDelegation = async (accountId: string, requestType: 'search' | 'ledger' | 'history', targetAmount?: string) => {
    try {
      setProgress({
        stage: 'init',
        text: 'Another terminal has active session. Routing request...',
        percent: 30,
        isIndeterminate: true
      });
      
      const reqRes = await fetch(`${backendUrl}/terminal/session/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_id: hardwareId,
          bank_account_id: parseInt(accountId),
          request_type: requestType,
          target_amount: targetAmount ? parseFloat(targetAmount) : null
        })
      });

      if (!reqRes.ok) {
        throw new Error("Failed to queue request on backend.");
      }

      const { request_id } = await reqRes.json();
      addLog(`> [Session] Request queued (ID: ${request_id}). Waiting for active session holder...`);
      
      const maxPollAttempts = 15;
      for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
        if (!isVerifyingRef.current) {
          addLog("> [Session] Delegation cancelled by user.");
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        const pollRes = await fetch(`${backendUrl}/terminal/session/result/${request_id}?hardware_id=${hardwareId}`);
        if (pollRes.ok) {
          const pollData = await pollRes.json();
          if (pollData.status === 'fulfilled') {
            const response = pollData.result_json;
            setProgress({ 
              stage: 'success', 
              text: requestType === 'ledger' ? '✅ Ledger Synced!' : '✅ Transfer Verified!', 
              percent: 100, 
              isIndeterminate: false 
            });
            setTimeout(() => {
              setLoading(false);
              setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
              setResult(response.data || null);
              setLastTransactions(response.transactions || []);
              setLastPopulatedTime(new Date().toLocaleTimeString());

              if (response.balance) {
                setLedgerCache(prev => ({
                  ...prev,
                  [accountId]: {
                    balance: response.balance,
                    lastUpdated: new Date().toLocaleTimeString(),
                    transactions: response.transactions || []
                  }
                }));
              }
              if (requestType === 'search' && response.data) {
                setAmount('');
              }
              releaseLock();
              isVerifyingRef.current = false;
            }, 1500);
            return;
          } else if (pollData.status === 'failed') {
            throw new Error(pollData.error_message || "Holder failed to fetch data.");
          }
        }
      }
      throw new Error("Request timed out. Active session holder did not respond.");
    } catch (err: any) {
      setError(`Delegated Fetch Failed: ${err.message}`);
      setLoading(false);
      isVerifyingRef.current = false;
      setProgress({ stage: 'error', text: 'Fetch failed', percent: 100, isIndeterminate: false });
    }
  };

  const handleVerify = async (mode: 'search' | 'history' = 'search') => {
    const selectedAccount = bankAccounts.find(a => a.id.toString() === selectedAccountId);
    const selectedBankName = selectedAccount ? selectedAccount.bank_name : 'BML';

    const isLocked = selectedAccount && (selectedAccount.login_failures || 0) >= 2;
    if (isLocked) {
      setError("This account is currently locked due to 2 consecutive failed logins. Please unlock it via the Company Admin Panel.");
      return;
    }
    if (mode === 'search' && (!amount || isNaN(Number(amount)) || Number(amount) <= 0)) {
      setError("Please enter a valid transfer amount.");
      return;
    }
    if (!extensionId) {
      setError("Extension ID is not configured. Click the gear icon at the top to configure the extension.");
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setLoadingMode(mode);
    setError(null);
    setResult(null);
    setLastTransactions([]);
    logsRef.current = [];
    setLogs([]); // Clear previous logs

    isVerifyingRef.current = true;
    setProgress({
      stage: 'init',
      text: 'Checking bank session status...',
      percent: 10,
      isIndeterminate: true
    });
    setTimeLeft(25);

    // Resolve persistent session strategy
    const strategy = await resolveSessionStrategy(selectedAccountId);
    addLog(`> [Session] Resolved Strategy: ${strategy}`);

    if (strategy === 'DELEGATE') {
      setSessionStatus('delegating');
      await executeDelegation(selectedAccountId, mode, mode === 'search' ? amount : undefined);
      return;
    }

    let claimSuccess = false;
    if (strategy === 'CLAIM_AND_LOGIN') {
      setSessionStatus('claiming');
      try {
        const claimRes = await fetch(`${backendUrl}/terminal/session/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hardware_id: hardwareId,
            bank_account_id: parseInt(selectedAccountId)
          })
        });
        if (claimRes.ok) {
          const claimData = await claimRes.json();
          if (claimData.status === 'delegating') {
            // Lost race - switch to delegation
            setSessionStatus('delegating');
            await executeDelegation(selectedAccountId, mode, mode === 'search' ? amount : undefined);
            return;
          }
          claimSuccess = true;
        }
      } catch (err) {
        console.error("Failed to claim session:", err);
      }
    } else {
      setSessionStatus('holder');
    }

    // Step 1: License Guard (Query the Laravel backend)
    try {
      const response = await fetch(`${backendUrl}/verify-terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardware_id: hardwareId, action: 'verify' })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setError(`License check failed: ${errData.error || response.statusText} (${response.status})`);
        
        if (response.status === 403 || response.status === 404) {
          clearTerminalData();
        }
        
        setLoading(false);
        isVerifyingRef.current = false;
        setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
        setTimeLeft(null);
        return;
      }
    } catch (err: any) {
      setError(`Backend Connection Failed: Could not connect to licensing server at ${backendUrl}. Check your network or settings.`);
      setLoading(false);
      isVerifyingRef.current = false;
      setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
      setTimeLeft(null);
      return;
    }

    // Step 2: Acquire Distributed Lease Lock
    const targetAccountId = selectedAccountId;
    lockedAccountIdRef.current = targetAccountId;

    setProgress({
      stage: 'lock',
      text: 'Preparing secure session...',
      percent: 20,
      isIndeterminate: true
    });
    addLog("> [Lock] Requesting session lock for bank account...");
    
    let lockAcquired = false;
    const startTime = Date.now();
    const pollInterval = 2500; // poll every 2.5 seconds
    const maxTimeoutMs = lockTimeout * 1000;
    let attempts = 0;

    while (Date.now() - startTime < maxTimeoutMs) {
      // Check if user clicked cancel during wait
      if (!isVerifyingRef.current) {
        addLog("> [Lock] Wait cancelled by user.");
        lockedAccountIdRef.current = null;
        setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
        setTimeLeft(null);
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
            setProgress({
              stage: 'init',
              text: 'Preparing secure session...',
              percent: 25,
              isIndeterminate: true
            });
            addLog("> [Lock] Session lock acquired successfully.");
            break;
          }
        } else if (lockRes.status === 409) {
          const lockData = await lockRes.json().catch(() => ({}));
          const heldBy = lockData.held_by ? `terminal ${lockData.held_by.substring(0, 8)}...` : "another terminal";
          const expiresSeconds = lockData.expires_in ?? "?";
          
          attempts++;
          if (attempts > 2) {
            setProgress({
              stage: 'lock',
              text: 'This account is busy. Retrying in 5 seconds...',
              percent: 15,
              isIndeterminate: true
            });
          } else {
            setProgress({
              stage: 'lock',
              text: 'Another terminal is currently using this account. You are next in line...',
              percent: 15,
              isIndeterminate: true
            });
          }

          addLog(`> [Lock] Session busy: Held by ${heldBy}. Retrying in 2.5s (expires in ${expiresSeconds}s)...`);
        } else {
          const errText = await lockRes.text();
          console.error("Lock error response:", errText);
          addLog(`> [Lock] Server returned error ${lockRes.status}. Retrying...`);
        }
      } catch (err) {
        console.error("Lock request exception:", err);
        addLog("> [Lock] Connection issue while locking. Retrying...");
      }

      // Wait 2.5s before next attempt
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    if (!lockAcquired) {
      setError("Bank session busy: Held by another terminal. Please try again later.");
      addLog("> [Lock] Timeout: Could not acquire bank session lock.");
      setLoading(false);
      lockedAccountIdRef.current = null;
      isVerifyingRef.current = false;
      setProgress({ stage: 'error', text: 'Session busy', percent: 100, isIndeterminate: false });
      setTimeLeft(null);
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
          addLog("> [Lock Warning] Heartbeat failed. Lock may have been stolen or expired.");
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
      setProgress({ stage: 'error', text: 'Extension not found', percent: 100, isIndeterminate: false });
      setTimeLeft(null);
      return;
    }

    let port;
    try {
      port = chrome.runtime.connect(extensionId, { name: "viri-verify" });
    } catch (e: any) {
      setError(`Extension connection failed: ${e.message}. Is the Extension ID correct?`);
      setLoading(false);
      releaseLock();
      isVerifyingRef.current = false;
      setProgress({ stage: 'error', text: 'Connection failed', percent: 100, isIndeterminate: false });
      setTimeLeft(null);
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
      setProgress({ stage: 'error', text: 'Connection lost', percent: 100, isIndeterminate: false });
      setTimeLeft(null);
      setLoading(false);
      activePortRef.current = null;
      releaseLock();
      isVerifyingRef.current = false;
    });

    port.onMessage.addListener((response: any) => {
      if (response.type === 'log') {
        addLog(response.message);
        const parsed = parseLogForProgress(response.message);
        if (parsed) {
          setProgress(parsed);
        }
      } else if (response.type === 'success') {
        setProgress({ 
          stage: 'success', 
          text: mode === 'history' ? '✅ History Fetched!' : '✅ Transfer Verified!', 
          percent: 100, 
          isIndeterminate: false 
        });
        setTimeLeft(null);
        setTimeout(async () => {
          setLoading(false);
          setResult(response.data || null);
          setLastTransactions(response.transactions || []);
          setLastPopulatedTime(new Date().toLocaleTimeString());

          if (response.balance) {
            setLedgerCache(prev => ({
              ...prev,
              [selectedAccountId]: {
                balance: response.balance,
                lastUpdated: new Date().toLocaleTimeString(),
                transactions: response.transactions || []
              }
            }));
          }

          if (mode === 'search' && response.data) {
            setAmount(''); // clear input on success
          }
          // Register session holder to extension
          if (sessionStatus === 'claiming' || claimSuccess) {
            port.postMessage({
              action: 'CLAIM_SESSION',
              payload: {
                accountId: selectedAccountId,
                bankName: selectedBankName,
                backendUrl: backendUrl,
                hardwareId: hardwareId,
                credentials: activeCreds
              }
            });
            setSessionStatus('holder');
          }

          port.disconnect();
          activePortRef.current = null;
          releaseLock();
          isVerifyingRef.current = false;
          uploadLogsToServer();

           // Reset failures on server
           const currentCreds = accountsCreds[selectedAccountId] || {};
           const activeUsername = currentCreds.username || '';
           const hash = await computeCredsHash(selectedBankName, activeUsername);
           try {
             await fetch(`${backendUrl}/terminal/bank-accounts/reset-failures`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ hardware_id: hardwareId, bank_account_id: parseInt(selectedAccountId), credentials_hash: hash })
             });
             fetchAccounts();
           } catch (e) {
             console.error("Failed to reset failures:", e);
           }
        }, 1500); // 1.5s reinforcement checkmark flash
      } else if (response.type === 'error') {
        setProgress({ 
          stage: 'error', 
          text: mode === 'history' ? 'Fetch failed' : 'Verification failed', 
          percent: 100, 
          isIndeterminate: false 
        });
        setTimeLeft(null);
        setLoading(false);
        setError(response.error || (mode === 'history' ? "Failed to fetch history." : "Verification failed."));
        
        // Track consecutive failures
        const isAuthError = progress.stage === 'init' || progress.stage === 'auth' || 
          /login|credential|auth|password|seed|incorrect|invalid/i.test(response.error || '');
        if (isAuthError) {
          const currentCreds = accountsCreds[selectedAccountId] || {};
          const activeUsername = currentCreds.username || '';
          computeCredsHash(selectedBankName, activeUsername).then(async (hash) => {
            try {
              await fetch(`${backendUrl}/terminal/bank-accounts/increment-failures`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hardware_id: hardwareId, bank_account_id: parseInt(selectedAccountId), credentials_hash: hash })
              });
              fetchAccounts();
            } catch (e) {
              console.error("Failed to increment failures:", e);
            }
          });
        }
        setLastTransactions(response.transactions || []);
        setLastPopulatedTime(new Date().toLocaleTimeString());
        port.disconnect();
        activePortRef.current = null;
        releaseLock();
        isVerifyingRef.current = false;
        uploadLogsToServer();
      }
    });

    // Provide the correct credentials based on bank account
    const currentCreds = accountsCreds[selectedAccountId] || {};
    const activeCreds = {
      username: currentCreds.username || '',
      password: currentCreds.password || '',
      totpSeed: currentCreds.totpSeed || ''
    };

    if (!activeCreds.username || !activeCreds.password) {
      setError("Credentials missing for this account. Please re-pair the terminal or check account settings.");
      addLog("> [System] Missing credentials. Aborting verification request.");
      setLoading(false);
      isVerifyingRef.current = false;
      if (port) port.disconnect();
      activePortRef.current = null;
      releaseLock();
      setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
      setTimeLeft(null);
      return;
    }

    try {
      port.postMessage({
        action: 'VERIFY_TRANSFER',
        payload: {
          mode: mode,
          sessionMode: strategy === 'FETCH_ONLY' ? 'fetch_only' : (claimSuccess ? 'claim_and_login' : 'fresh_login'),
          amount: mode === 'search' ? parseFloat(amount).toFixed(2) : '0.00',
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
      setProgress({ stage: 'error', text: 'Send failed', percent: 100, isIndeterminate: false });
      setTimeLeft(null);
    }
  };

  const syncLedger = async (targetAccountId: string) => {
    if (!targetAccountId) return;
    const selectedAccount = bankAccounts.find(a => a.id.toString() === targetAccountId);
    if (!selectedAccount) return;

    const selectedBankName = selectedAccount.bank_name;
    const isLocked = (selectedAccount.login_failures || 0) >= 2;
    if (isLocked) {
      setError("This account is currently locked due to 2 consecutive failed logins. Please unlock it via the Company Admin Panel.");
      return;
    }
    if (!extensionId) {
      setError("Extension ID is not configured.");
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setLoadingMode('ledger');
    setError(null);
    logsRef.current = [];
    setLogs([]);
    setSyncTimeElapsed(0);
    const sTime = performance.now();
    syncStartTimeRef.current = sTime;

    isVerifyingRef.current = true;
    setProgress({
      stage: 'init',
      text: 'Checking bank session status...',
      percent: 10,
      isIndeterminate: true
    });

    addLog("> [Session] Resolving session strategy...");
    const strategy = await resolveSessionStrategy(targetAccountId);
    addLog(`> [Session] Resolved Strategy: ${strategy}`);

    if (strategy === 'DELEGATE') {
      setSessionStatus('delegating');
      await executeDelegation(targetAccountId, 'ledger');
      return;
    }

    let claimSuccess = false;
    if (strategy === 'CLAIM_AND_LOGIN') {
      setSessionStatus('claiming');
      addLog("> [Session] Claiming session on backend...");
      try {
        const claimRes = await fetch(`${backendUrl}/terminal/session/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hardware_id: hardwareId,
            bank_account_id: parseInt(targetAccountId)
          })
        });
        if (claimRes.ok) {
          const claimData = await claimRes.json();
          if (claimData.status === 'delegating') {
            setSessionStatus('delegating');
            await executeDelegation(targetAccountId, 'ledger');
            return;
          }
          claimSuccess = true;
          addLog("> [Session] Session claim succeeded.");
        } else {
          addLog(`> [Session] Session claim returned HTTP ${claimRes.status}, proceeding with fresh login.`);
        }
      } catch (err) {
        console.error("Failed to claim session:", err);
        addLog("> [Session] Session claim failed (network error), proceeding with fresh login.");
      }
    } else {
      setSessionStatus('holder');
      setSessionHolderAccountId(targetAccountId);
    }

    addLog("> [System] Validating terminal license...");
    try {
      const response = await fetch(`${backendUrl}/verify-terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardware_id: hardwareId })
      });
      if (!response.ok) {
        throw new Error("License validation failed.");
      }
      addLog("> [System] License valid.");
    } catch (err: any) {
      setError(`Backend Connection Failed: ${err.message}`);
      addLog(`> [System] License validation FAILED: ${err.message}`);
      setLoading(false);
      isVerifyingRef.current = false;
      setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
      return;
    }

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
      setError("Browser extension API not detected.");
      addLog("> [System] Chrome extension API not found.");
      setLoading(false);
      isVerifyingRef.current = false;
      return;
    }

    addLog("> [System] Connecting to extension...");
    let port;
    try {
      port = chrome.runtime.connect(extensionId, { name: "viri-verify" });
    } catch (e: any) {
      setError(`Extension connection failed: ${e.message}`);
      addLog(`> [System] Extension connection FAILED: ${e.message}`);
      setLoading(false);
      isVerifyingRef.current = false;
      return;
    }

    activePortRef.current = port;
    addLog("> [System] Extension port connected. Preparing credentials...");

    const currentCreds = accountsCreds[targetAccountId] || {};
    const activeCreds = {
      username: currentCreds.username || '',
      password: currentCreds.password || '',
      totpSeed: currentCreds.totpSeed || ''
    };

    if (!activeCreds.username || !activeCreds.password) {
      setError("Credentials missing for this account. Please re-pair the terminal or check account settings.");
      addLog("> [System] Missing credentials. Aborting sync.");
      setLoading(false);
      isVerifyingRef.current = false;
      if (port) port.disconnect();
      activePortRef.current = null;
      return;
    }

    port.onMessage.addListener((response: any) => {
      if (response.type === 'log') {
        addLog(response.message);
        const parsed = parseLogForProgress(response.message);
        if (parsed) setProgress(parsed);
      } else if (response.type === 'success') {
        setProgress({ 
          stage: 'success', 
          text: '✅ Ledger Synced Successfully!', 
          percent: 100, 
          isIndeterminate: false 
        });
        setTimeout(async () => {
          setLoading(false);
          setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
          setLedgerCache(prev => ({
            ...prev,
            [targetAccountId]: {
              balance: response.balance || 'Not found',
              lastUpdated: new Date().toLocaleTimeString(),
              transactions: response.transactions || []
            }
          }));
          try {
            const hash = await computeCredsHash(selectedBankName, activeCreds.username);
            await fetch(`${backendUrl}/terminal/bank-accounts/reset-failures`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hardware_id: hardwareId, bank_account_id: parseInt(targetAccountId), credentials_hash: hash })
            });
            if (sessionStatus === 'claiming' || claimSuccess) {
              port.postMessage({
                action: 'CLAIM_SESSION',
                payload: {
                  accountId: targetAccountId,
                  bankName: selectedBankName,
                  backendUrl: backendUrl,
                  hardwareId: hardwareId,
                  credentials: activeCreds
                }
              });
              setSessionStatus('holder');
              setSessionHolderAccountId(targetAccountId);
            }
          } catch (e) {
            console.error("Failed to reset failures:", e);
          }
        }, 1500);
      } else if (response.type === 'error') {
        setError(response.error || "An unknown error occurred during sync.");
        setProgress({ stage: 'error', text: 'Sync failed', percent: 100, isIndeterminate: false });
        setTimeLeft(null);
        setLedgerCache(prev => ({
          ...prev,
          [targetAccountId]: {
            ...(prev[targetAccountId] || {}),
            error: response.error || "An unknown error occurred during sync."
          }
        }));

        // Track consecutive failures
        const isAuthError = progress.stage === 'init' || progress.stage === 'auth' || 
          /login|credential|auth|password|seed|incorrect|invalid/i.test(response.error || '');
        if (isAuthError) {
          const currentCreds = accountsCreds[targetAccountId] || {};
          const activeUsername = currentCreds.username || '';
          computeCredsHash(selectedBankName, activeUsername).then(async (hash) => {
            try {
              await fetch(`${backendUrl}/terminal/bank-accounts/increment-failures`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hardware_id: hardwareId, bank_account_id: parseInt(targetAccountId), credentials_hash: hash })
              });
              fetchAccounts();
            } catch (e) {
              console.error("Failed to increment failures:", e);
            }
          });
        }
        setTimeout(() => {
          setLoading(false);
          setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
          port.disconnect();
          activePortRef.current = null;
          releaseLock();
          isVerifyingRef.current = false;
          uploadLogsToServer();
        }, 1500);
      }
    });

    addLog("> [System] Sending VERIFY_TRANSFER (ledger mode) to extension...");
    try {
      port.postMessage({
        action: 'VERIFY_TRANSFER',
        payload: {
          mode: 'ledger',
          sessionMode: strategy === 'FETCH_ONLY' ? 'fetch_only' : (claimSuccess ? 'claim_and_login' : 'fresh_login'),
          amount: '0.00',
          bank: selectedBankName,
          accountId: targetAccountId,
          accountNumber: selectedAccount ? selectedAccount.account_number : '',
          mibProfileType: selectedAccount ? (selectedAccount.mib_profile_type || '0') : '0',
          credentials: activeCreds
        }
      });
    } catch (msgErr: any) {
      setError(`Failed to start sync: ${msgErr.message}`);
      addLog(`> [System] Failed to send message to extension: ${msgErr.message}`);
      setLoading(false);
      port.disconnect();
      activePortRef.current = null;
      releaseLock();
      isVerifyingRef.current = false;
    }
  };

  const companyName = tenantName || "Unregistered Terminal";
  const planName = subscriptionTier === 'free' ? 'Free Trial' : (subscriptionTier === '499' ? 'Standard' : (subscriptionTier === '999' ? 'Pro' : ''));

  const selectedAccount = bankAccounts.find(a => a.id.toString() === selectedAccountId);
  const selectedAccountCurrency = selectedAccount ? (selectedAccount.currency || 'MVR') : 'MVR';

  const selectedAccountCreds = selectedAccountId ? (accountsCreds[selectedAccountId] || {}) : {};
  const isCredentialsComplete = !!selectedAccountCreds.username?.trim() && 
                                !!selectedAccountCreds.password?.trim() && 
                                !!selectedAccountCreds.totpSeed?.trim();

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

  const activeStepIndex = (loading || progress.stage === 'success' || progress.stage === 'error') 
    ? (progress.stage === 'init' ? 1 
      : (progress.stage === 'lock' || progress.stage === 'auth' ? 2 
        : (progress.stage === 'fetch' ? 3 
          : (progress.stage === 'match' ? 4 
            : (progress.stage === 'success' ? 5 
              : (progress.percent >= 95 ? 4 
                : (progress.percent >= 75 ? 3 
                  : (progress.percent >= 45 ? 2 : 1))))))))
    : (result ? 5 : 0);

  const Sidebar = () => (
    <aside className={`border-r border-[var(--border-color)] bg-[var(--bg-surface)] flex flex-col items-center justify-between py-6 shrink-0 transition-all duration-300 relative ${
      isSidebarCollapsed ? 'w-16' : 'w-16 md:w-64'
    }`}>
      {/* Collapse / Expand Toggle Button */}
      <button
        onClick={() => {
          const nextState = !isSidebarCollapsed;
          setIsSidebarCollapsed(nextState);
          localStorage.setItem('viri_sidebar_collapsed', String(nextState));
        }}
        className="absolute -right-3 top-7 w-6 h-6 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-zinc-800 text-[var(--text-secondary)] hover:text-white flex items-center justify-center transition-all z-20 shadow-md"
        title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        <ChevronRight size={14} className={`transform transition-transform duration-300 ${isSidebarCollapsed ? '' : 'rotate-180'}`} />
      </button>

      {/* Top section: Brand / Logo - Vertical Premium Layout */}
      <div className={`flex flex-col items-center px-4 mb-8 transition-all ${isSidebarCollapsed ? 'md:items-center' : 'md:items-start w-full'}`}>
        {/* Viri Logo Container */}
        <div className="mb-3">
          <img src="/logo_en.png" alt="Viri Logo" className={`w-auto object-contain mx-auto transition-all ${isSidebarCollapsed ? 'h-10 md:h-12' : 'h-20 md:h-24'}`} />
        </div>
        
        {/* Company Name */}
        <span className={`font-bold text-sm text-white truncate max-w-full tracking-tight transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>
          {companyName}
        </span>
        
        {/* Terminal PWA Subtitle */}
        <span className={`text-[10px] text-emerald-500/80 font-mono font-bold tracking-widest mt-0.5 uppercase transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>
          Terminal PWA
        </span>
      </div>

      {/* Nav items */}
      <nav className={`flex-1 w-full px-2 space-y-1.5 flex flex-col items-center transition-all ${isSidebarCollapsed ? 'md:items-center' : 'md:items-stretch'}`}>
        <button
          onClick={() => { setShowSettings(false); setActiveTab('verify'); }}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold ${
            isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
          } ${
            activeTab === 'verify' && !showSettings
              ? 'bg-[var(--color-success)] text-black font-bold'
              : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
          }`}
          title="Verification"
        >
          <MonitorSmartphone size={16} className="shrink-0" />
          <span className={`transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:inline'}`}>Verification</span>
        </button>

        {permissions.ledger_enabled && (
          <button
            onClick={() => { setShowSettings(false); setActiveTab('ledger'); }}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold ${
              isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
            } ${
              activeTab === 'ledger' && !showSettings
                ? 'bg-[var(--color-success)] text-black font-bold'
                : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
            }`}
            title="Transaction Ledger"
          >
            <BookOpen size={16} className="shrink-0" />
            <span className={`transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:inline'}`}>Transaction Ledger</span>
          </button>
        )}

        {permissions.reports_enabled && (
          <button
            disabled
            className={`w-10 h-10 flex items-center justify-center rounded-lg text-xs font-semibold text-zinc-600 cursor-not-allowed ${
              isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
            }`}
            title="Reports (Coming soon)"
          >
            <BarChart3 size={16} className="shrink-0" />
            <span className={`transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:inline'}`}>Reports (Soon)</span>
          </button>
        )}

        <button
          onClick={() => { setShowSettings(false); setActiveTab('help'); }}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold ${
            isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
          } ${
            activeTab === 'help' && !showSettings
              ? 'bg-[var(--color-success)] text-black font-bold'
              : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
          }`}
          title="Help & Support"
        >
          <HelpCircle size={16} className="shrink-0" />
          <span className={`transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:inline'}`}>Help & Support</span>
        </button>
      </nav>

      {/* Bottom section: Settings & Locking */}
      <div className={`w-full px-2 space-y-2 flex flex-col items-center transition-all ${isSidebarCollapsed ? 'md:items-center' : 'md:items-stretch'}`}>
        {pin && (
          <button
            onClick={() => setIsLocked(true)}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold hover:bg-red-955/20 text-red-400 hover:text-red-300 border border-transparent hover:border-red-900/30 ${
              isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
            }`}
            title="Lock Terminal"
          >
            <Lock size={16} className="shrink-0" />
            <span className={`transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:inline'}`}>Lock Terminal</span>
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
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold border ${
            isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
          } ${
            showSettings
              ? 'bg-zinc-800 text-[var(--color-success)] border-[var(--color-success)]'
              : 'hover:bg-white/5 text-[var(--text-secondary)] border-transparent hover:text-white'
          }`}
          title="Settings"
        >
          <Settings size={16} className="shrink-0" />
          <span className={`transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:inline'}`}>Settings</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex bg-[var(--bg-base)] text-[var(--text-primary)] w-screen overflow-hidden">
      
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 h-screen overflow-y-auto p-4 md:p-8 flex flex-col items-center">



        {showSettings ? (
          /* Extension settings/admin panel */
          <div className="w-full max-w-xl lg:max-w-full mb-6 glass-panel border-zinc-850 animate-fade-in p-6">
            {/* Header */}
            <div className="border-b border-[var(--border-color)] pb-4 mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                <Settings size={22} className="text-zinc-400" /> Viri Admin Panel <Tooltip text="System settings, terminal registration, lock PIN, and bank credentials." />
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                System configuration, lock PIN security, and local bank account credentials.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: System & Security Settings (5 cols) */}
              <div className="lg:col-span-5 space-y-5">
                <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">Terminal Status <Tooltip text="Shows pairing state and company connection details." /></h4>
                  <div className="p-3 bg-black/30 border border-zinc-850 rounded-lg text-sm text-[var(--color-success)] font-mono flex items-center justify-between">
                    <span className="truncate pr-2">Connected to {companyName}</span>
                    <button
                      onClick={() => {
                        if (confirm("Are you sure you want to unlink this terminal? You will need a new pairing code to use it again.")) {
                          clearTerminalData();
                        }
                      }}
                      className="text-red-400 hover:text-red-300 text-xs px-2 py-1 border border-red-500/30 hover:border-red-500 hover:bg-red-500/10 rounded transition-colors shrink-0"
                    >
                      Unlink
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl space-y-4">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Security & API</h4>
                  
                  <div className="input-group">
                    <label className="input-label text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">Terminal Lock PIN (Optional) <Tooltip text="A local cashier PIN to lock/unlock this terminal." /></label>
                    <input
                      type="password"
                      className="input-field text-transparent bg-zinc-950/50 border-zinc-800 focus:border-[var(--color-success)] rounded-lg text-sm px-3 py-2"
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
                    <span className="text-[10px] text-[var(--text-secondary)] block mt-1">
                      Type a 4-digit PIN to update. Input length is hidden.
                    </span>
                  </div>

                  <div className="input-group">
                    <label className="input-label text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">Viri Bridge Extension ID (System) <Tooltip text="Unique ID of the local companion browser extension helper." /></label>
                    <input
                      type="text"
                      className="input-field opacity-60 cursor-not-allowed bg-zinc-950/50 border-zinc-800 text-xs px-3 py-2"
                      value={extensionId}
                      readOnly
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">Viri Backend API Endpoint (System) <Tooltip text="Server URL for syncing metadata and statuses." /></label>
                    <input
                      type="text"
                      className="input-field opacity-60 cursor-not-allowed bg-zinc-950/50 border-zinc-800 text-xs px-3 py-2"
                      value={backendUrl}
                      readOnly
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Bank Credentials (7 cols) */}
              <div className="lg:col-span-7 space-y-5">
                <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl min-h-[360px] flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Shield size={14} className="text-[var(--color-warning)]" />
                      Local Bank Credentials <Tooltip text="Local bank login credentials used strictly by the browser extension." />
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)] mb-4">
                      Configure individual login credentials for each bank account paired with this terminal.
                    </p>

                    <div className="bg-black/25 border border-zinc-800 rounded-xl p-5 text-center leading-relaxed">
                      <Shield size={36} className="mx-auto text-[var(--color-warning)] mb-3 opacity-80" />
                      <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Zero-Knowledge Security</h5>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        All bank login credentials (usernames, passwords, and 2FA seeds) are encrypted locally in your browser storage and never transmitted to Viri servers.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bank Accounts Manager */}
            <div className="mt-6 pt-6 border-t border-[var(--border-color)]">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">Managed Bank Accounts & Login Safety Status <Tooltip text="Lock status of bank accounts under this terminal. If failures >= 2, functions are disabled." /></h4>
              <p className="text-xs text-[var(--text-secondary)] mb-4">Accounts are synced from company dashboard. Reset failed logins in the Company Admin Panel to unlock terminal operations.</p>

              <div className="space-y-3 mb-4">
                {bankAccounts.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] italic">No accounts configured. Please add them in the company dashboard.</p>
                ) : (
                  bankAccounts.map(acc => {
                    const failures = acc.login_failures || 0;
                    const isLocked = failures >= 2;
                    const hasCreds = !!(accountsCreds[acc.id.toString()]?.username);
                    const isExpanded = expandedCredsAccountId === acc.id.toString();

                    return (
                      <div key={acc.id} className="p-4 bg-[var(--bg-canvas)] border border-[var(--border-color)] rounded-xl text-sm flex flex-col gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded bg-zinc-950/80 border border-zinc-800 p-1 flex items-center justify-center shrink-0">
                              <img src={acc.bank_name === 'BML' ? '/logo_bml.png' : '/logo_mib.png'} className="w-full h-full object-contain" alt="" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[var(--text-primary)] flex items-center gap-1.5 flex-wrap">
                                <span>{acc.bank_name} - {acc.account_name}</span>
                                {acc.label && (
                                  <span className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded font-medium">
                                    {acc.label}
                                  </span>
                                )}
                                {isLocked ? (
                                  <span className="text-[9px] font-bold text-red-400 bg-red-955/40 border border-red-500/30 px-2 py-0.5 rounded uppercase">
                                    Locked
                                  </span>
                                ) : failures > 0 ? (
                                  <span className="text-[9px] font-bold text-yellow-500 bg-yellow-955/40 border border-yellow-500/30 px-2 py-0.5 rounded uppercase">
                                    {failures} Fail
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-955/40 border border-emerald-500/30 px-2 py-0.5 rounded uppercase font-sans">
                                    Secure
                                  </span>
                                )}
                              </div>
                              <div className="text-[var(--text-secondary)] text-xs mt-0.5 font-mono">Account: {acc.account_number}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                              hasCreds 
                                ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/10' 
                                : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {hasCreds ? 'Credentials Configured' : 'No Credentials'}
                            </span>
                            {!isExpanded && (
                              <div className="flex items-center gap-2">
                                <button 
                                  className={`btn text-xs py-1.5 px-3 font-semibold ${
                                    hasCreds 
                                      ? 'border border-zinc-800 hover:bg-zinc-800 text-zinc-300' 
                                      : 'btn-success text-black'
                                  }`}
                                  onClick={() => {
                                    const creds = accountsCreds[acc.id.toString()] || {};
                                    setTempUsername(creds.username || '');
                                    setTempPassword(creds.password || '');
                                    setTempTotpSeed(creds.totpSeed || '');
                                    setExpandedCredsAccountId(acc.id.toString());
                                  }}
                                >
                                  {hasCreds ? 'Edit' : 'Configure'}
                                </button>
                                {hasCreds && (
                                  <button 
                                    className="text-xs text-red-400 hover:text-red-300 underline font-semibold px-2 py-1"
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to clear credentials for account ${acc.account_name}?`)) {
                                        clearAccountCredentials(acc.id.toString());
                                      }
                                    }}
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="pt-4 border-t border-zinc-800/80 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="input-group">
                                <label className="input-label text-[10px]">Username</label>
                                <input 
                                  type="text" 
                                  className="input-field text-xs bg-zinc-950/50 border-zinc-800 py-1.5" 
                                  placeholder="Bank portal username" 
                                  value={tempUsername} 
                                  onChange={e => setTempUsername(e.target.value)} 
                                />
                              </div>
                              <div className="input-group">
                                <label className="input-label text-[10px]">Password</label>
                                <input 
                                  type="password" 
                                  className="input-field text-xs bg-zinc-950/50 border-zinc-800 py-1.5" 
                                  placeholder="Bank portal password" 
                                  value={tempPassword} 
                                  onChange={e => setTempPassword(e.target.value)} 
                                />
                              </div>
                              <div className="input-group">
                                <label className="input-label text-[10px]">Authenticator Seed (TOTP)</label>
                                <input 
                                  type="password" 
                                  className="input-field text-xs bg-zinc-950/50 border-zinc-800 py-1.5 font-mono" 
                                  placeholder="2FA authenticator secret key" 
                                  value={tempTotpSeed} 
                                  onChange={e => setTempTotpSeed(e.target.value.replace(/\s+/g, '').toUpperCase())} 
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 text-xs">
                              <button 
                                type="button" 
                                className="btn border border-zinc-800 hover:bg-zinc-800 text-zinc-300 py-1.5 px-3 font-semibold" 
                                onClick={() => setExpandedCredsAccountId(null)}
                              >
                                Cancel
                              </button>
                              <button 
                                type="button" 
                                className="btn btn-success py-1.5 px-5 font-bold" 
                                onClick={() => {
                                  if (!tempUsername.trim() || !tempPassword.trim()) {
                                    alert("Username and Password are required.");
                                    return;
                                  }
                                  saveAccountCredentials(acc.id.toString(), tempUsername, tempPassword, tempTotpSeed);
                                  setExpandedCredsAccountId(null);
                                }}
                              >
                                Save Credentials
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* View Tab 1: Verification */}
            {activeTab === 'verify' && (
              <div className="w-full max-w-xl lg:max-w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in animate-duration-500">
                {/* Header */}
                <div className="w-full flex justify-between items-center lg:col-span-12 border-b border-[var(--border-color)] pb-4">
                  <div>
                    <h1 className="text-2xl tracking-tight text-white font-bold">{companyName}</h1>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Powered by Viri {planName && <span>• {planName.toUpperCase()} PLAN</span>}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {/* Status & Last Fetch */}
                    <div className="text-right hidden sm:block">
                      <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>ONLINE {terminalName && ` - ${terminalName.toUpperCase()}`}</span>
                      </div>
                      {lastPopulatedTime && (
                        <span className="text-[10px] text-[var(--text-secondary)] font-mono block mt-0.5">
                          LAST FETCH: {lastPopulatedTime}
                        </span>
                      )}
                    </div>

                    {/* Zero-Knowledge Security Badge & Subtitle */}
                    <div className="flex flex-col items-end gap-1 text-right max-w-[280px]">
                      <div 
                        className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/30 border border-emerald-500/20 rounded-full text-[11px] font-semibold text-emerald-400 cursor-help"
                        title="Viri Zero-Knowledge Architecture: Financial passwords are fully encrypted and stored strictly on this local terminal machine."
                      >
                        <Shield size={12} className="shrink-0 text-emerald-400" />
                        <span>Zero-Knowledge Secure</span>
                      </div>
                      <p className="text-[10px] text-zinc-500 leading-normal select-none">
                        Financial passwords are fully encrypted and stored strictly on this local terminal machine.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Left Column: Form Inputs (lg:col-span-4) */}
                <div className="lg:col-span-4 w-full">
                  <div className="glass-panel p-6 border border-zinc-800 bg-zinc-950/20 rounded-2xl flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-1.5">Verify Transfer <Tooltip text="Input details from the customer's transfer receipt to programmatically confirm funds arrival." /></h2>
                      <div className="flex items-center gap-2">
                        {initLoading && <Loader2 size={12} className="animate-spin text-zinc-400" />}
                        <span className="px-2 py-0.5 bg-zinc-800/80 border border-zinc-700/50 text-zinc-400 text-[9px] font-bold uppercase tracking-wider rounded font-mono">
                          Step 1-3
                        </span>
                      </div>
                    </div>

                    {/* Error Alert */}
                    {error && (
                      <div className="p-3 bg-[var(--color-warning-bg)] border border-[var(--color-warning)] border-opacity-30 rounded-lg flex items-center gap-3 text-sm text-[var(--color-warning)]">
                        <AlertTriangle className="shrink-0" size={18} />
                        <p>{error}</p>
                      </div>
                    )}

                    <div className="input-group mb-0">
                      <label className="input-label text-[10px] uppercase tracking-wider font-bold text-zinc-400 flex items-center gap-1.5">Target Amount ({selectedAccountCurrency}) <Tooltip text="The exact transfer amount shown on the customer's receipt." /></label>
                      <input
                        type="number"
                        className="input-field text-2xl font-bold tracking-tight text-white py-3.5 bg-black/40 border border-zinc-800/80 rounded-xl focus:border-emerald-500"
                        placeholder="0.00"
                        value={amount}
                        disabled={loading}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>

                    <div className="input-group mb-0">
                      <label className="input-label text-[10px] uppercase tracking-wider font-bold text-zinc-400 flex items-center gap-1.5">Receiving Account <Tooltip text="The company's bank account the customer claims to have sent funds to." /></label>
                      {bankAccounts.length === 0 ? (
                        <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-lg text-center text-zinc-500 italic text-sm">
                          No accounts configured
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                          {bankAccounts.map((acc) => {
                            const isSelected = selectedAccountId === acc.id.toString();
                            const isBml = acc.bank_name === 'BML';
                            return (
                              <button
                                key={acc.id}
                                type="button"
                                disabled={loading}
                                onClick={() => setSelectedAccountId(acc.id.toString())}
                                className={`w-full px-4 py-3 rounded-xl border text-left flex items-center gap-3 transition-all ${
                                  isSelected
                                    ? isBml
                                      ? 'bg-red-955/20 border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                                      : 'bg-emerald-955/20 border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                                    : 'bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700'
                                }`}
                              >
                                <div className="w-8 h-8 rounded bg-zinc-950/80 border border-zinc-800/80 p-1 flex items-center justify-center shrink-0">
                                  <img src={isBml ? '/logo_bml.png' : '/logo_mib.png'} className="w-full h-full object-contain" alt="" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-[10px] uppercase font-bold tracking-wider ${
                                      isBml ? 'text-red-400' : 'text-emerald-400'
                                    }`}>
                                      {acc.bank_name}
                                    </span>
                                    {acc.label && (
                                      <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-bold">
                                        {acc.label}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[15px] font-bold text-white truncate mt-0.5">{acc.account_name}</div>
                                  <div className="text-[13px] font-mono text-[var(--text-secondary)] mt-0.5 flex items-center gap-2">
                                    <span>{acc.account_number}</span>
                                    <span className="text-[9px] bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded font-bold font-mono">
                                      {acc.currency || 'MVR'}
                                    </span>
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isBml ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 mb-2 select-none cursor-pointer">
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={isDefault}
                          disabled={loading}
                          onChange={(e) => handleDefaultToggle(e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                      <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                        Set as Default Account
                      </span>
                    </div>

                    {/* Lockout and Credentials Checks */}
                    {(() => {
                      const selectedAccount = bankAccounts.find(a => a.id.toString() === selectedAccountId);
                      const isSelectedAccountLocked = selectedAccount && (selectedAccount.login_failures || 0) >= 2;
                      return (
                        <>
                          <div className="space-y-3 mt-2">
                            <button
                              onClick={() => handleVerify('search')}
                              disabled={loading || !isCredentialsComplete || !amount || isNaN(Number(amount)) || Number(amount) <= 0 || creditsExhausted || isSelectedAccountLocked}
                              className={`w-full btn btn-success py-3.5 text-base justify-center gap-2 font-bold rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all ${
                                loading || !isCredentialsComplete || !amount || isNaN(Number(amount)) || Number(amount) <= 0 || creditsExhausted || isSelectedAccountLocked ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            >
                              {loading && loadingMode === 'search' ? (
                                <>
                                  <Loader2 className="animate-spin" size={20} />
                                  Verifying...
                                </>
                              ) : isSelectedAccountLocked ? (
                                <>
                                  <AlertTriangle size={20} /> Blocked: Reset in Company Dashboard
                                </>
                              ) : (
                                <>
                                  <Search size={20} />
                                  VERIFY TRANSFER
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleVerify('history')}
                              disabled={loading || !isCredentialsComplete || creditsExhausted || isSelectedAccountLocked}
                              className={`w-full btn btn-outline py-3 text-sm justify-center gap-2 font-semibold rounded-xl transition-all border border-zinc-800 hover:border-zinc-700 bg-transparent text-zinc-300 hover:text-white ${
                                loading || !isCredentialsComplete || creditsExhausted || isSelectedAccountLocked ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            >
                              {loading && loadingMode === 'history' ? (
                                <>
                                  <Loader2 className="animate-spin" size={16} />
                                  Fetching History...
                                </>
                              ) : isSelectedAccountLocked ? (
                                <>
                                  <AlertTriangle size={16} /> LOCKED OUT
                                </>
                              ) : (
                                <>
                                  <History size={16} />
                                  VIEW HISTORY
                                </>
                              )}
                            </button>
                          </div>

                          {!isCredentialsComplete && (
                            <p className="text-xs text-[var(--color-warning)] mt-1 text-center leading-relaxed">
                              ⚠️ Please complete all bank credentials (username, password, authenticator seed) in settings before proceeding.
                            </p>
                          )}

                          {isSelectedAccountLocked && (
                            <div className="mt-2 p-3.5 bg-red-955/20 border border-red-500/30 rounded-xl text-xs text-red-400 leading-normal flex items-start gap-2.5">
                              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                              <div>
                                <strong className="block font-bold mb-0.5">Account Security Lockout</strong>
                                This account is locked due to 2 consecutive failed logins. To prevent a permanent block, please log in manually in a web browser, verify the account is active, and then ask an administrator to reset this lockout from the Company Admin Panel.
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {creditsExhausted && (
                      <div className="mt-2 p-3.5 bg-red-955/20 border border-red-500/30 rounded-xl text-xs text-red-400 leading-normal flex items-start gap-2.5">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <div>
                          <strong className="block font-bold mb-0.5">Verification Credits Exhausted</strong>
                          Your monthly verification limit has been reached. Verification services are temporarily disabled. Please contact your company administrator to upgrade your plan.
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Stepper, Logs and Recent Transactions (lg:col-span-8) */}
                <div className="lg:col-span-8 space-y-6 w-full">
                  {/* Multi-stage Progress Stepper Panel */}
                  <div className="p-6 rounded-2xl border border-zinc-800/80 bg-zinc-950/20 animate-fade-in flex flex-col gap-6">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                          {activeStepIndex === 5 ? (
                            <>
                              <span>Transfer Verified!</span>
                              <Tooltip text="The payment has been confirmed as received on your bank account." />
                              <span className="px-2 py-0.5 bg-emerald-955/50 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-wider rounded uppercase">
                                Success
                              </span>
                            </>
                          ) : progress.stage === 'error' ? (
                            <>
                              <span>Verification Failed</span>
                              <Tooltip text="The program failed to verify this transfer. Please review logs or try again." />
                              <span className="px-2 py-0.5 bg-red-955/50 border border-red-500/20 text-red-400 text-[10px] font-bold tracking-wider rounded uppercase">
                                Failed
                              </span>
                            </>
                          ) : loading ? (
                            <>
                              <span>{progress.text || "Verifying Transfer..."}</span>
                              <Tooltip text="Active scraping session running in companion browser extension." />
                              {progress.stage === 'lock' && (
                                <span className="px-2 py-0.5 bg-amber-955/50 border border-amber-500/20 text-amber-400 text-[10px] font-bold tracking-wider rounded uppercase animate-pulse">
                                  Locking
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span>Verification Status</span>
                              <Tooltip text="Verification execution status and headless automation progress." />
                            </>
                          )}
                        </h2>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium leading-relaxed">
                          {activeStepIndex === 5 ? (
                            `Verification completed at ${result ? new Date(result.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()} local time. Reference: ${result?.reference || 'N/A'}`
                          ) : progress.stage === 'error' ? (
                            error || "An error occurred during verification."
                          ) : loading ? (
                            timeLeft !== null ? `Estimated remaining: ~${timeLeft}s` : "Contacting banking server..."
                          ) : (
                            "Enter transfer details on the left and click Verify to start."
                          )}
                        </p>
                      </div>


                    </div>

                    {/* Stepper progress track */}
                    <div className="relative flex justify-between items-center w-full mt-4 mb-2 px-1 select-none">
                      {/* Connecting Line Track */}
                      <div className="absolute left-6 right-6 top-[22px] h-[4px] bg-zinc-800 -z-10 rounded-full flex overflow-hidden">
                        <div className={`flex-1 h-full transition-all duration-500 ${
                          activeStepIndex >= 2 ? 'bg-emerald-500' :
                          activeStepIndex === 1 ? 'bg-gradient-to-r from-blue-500 to-zinc-700' : 'bg-zinc-700'
                        }`} />
                        <div className={`flex-1 h-full transition-all duration-500 ${
                          activeStepIndex >= 3 ? 'bg-emerald-500' :
                          activeStepIndex === 2 ? 'bg-gradient-to-r from-emerald-500 to-blue-500' : 'bg-zinc-700'
                        }`} />
                        <div className={`flex-1 h-full transition-all duration-500 ${
                          activeStepIndex >= 4 ? 'bg-emerald-500' :
                          activeStepIndex === 3 ? 'bg-gradient-to-r from-emerald-500 to-blue-500' : 'bg-zinc-700'
                        }`} />
                        <div className={`flex-1 h-full transition-all duration-500 ${
                          activeStepIndex >= 5 ? 'bg-emerald-500' :
                          activeStepIndex === 4 ? 'bg-gradient-to-r from-emerald-500 to-blue-500' : 'bg-zinc-700'
                        }`} />
                      </div>

                      {/* Stepper Nodes */}
                      {[
                        { id: 1, label: 'START' },
                        { id: 2, label: 'AUTH' },
                        { id: 3, label: 'FETCH' },
                        { id: 4, label: 'MATCH' },
                        { id: 5, label: 'VERIFY' }
                      ].map((step) => {
                        const isCompleted = activeStepIndex > step.id || activeStepIndex === 5;
                        const isActive = activeStepIndex === step.id && activeStepIndex !== 5;
                        
                        return (
                          <div key={step.id} className="flex flex-col items-center z-10">
                            <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-500 ${
                              isCompleted 
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                                : isActive
                                  ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)] animate-pulse-glow'
                                  : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                            }`}>
                              {isCompleted ? (
                                <svg className="w-5 h-5 text-white animate-scale-checkmark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <span>{step.id}</span>
                              )}
                            </div>
                            <span className={`text-[9px] mt-2.5 font-bold tracking-wider transition-colors duration-500 ${
                              isCompleted ? 'text-emerald-400' : isActive ? 'text-blue-400' : 'text-zinc-500'
                            }`}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Verification Log Panel (only shows verification flow logs) */}
                  {permissions.show_vbtl && activeTab === 'verify' && (
                    <div className="w-full bg-black border border-zinc-800 rounded-lg overflow-hidden animate-fade-in shadow-2xl">
                      <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span className="text-xs text-zinc-400 ml-2 font-mono flex items-center gap-1">Viri Bridge Terminal Logs <Tooltip text="Real-time network crawler debugging logs execution stream." /></span>
                        {loading && <Loader2 size={12} className="text-[var(--color-success)] animate-spin ml-2" />}

                        <div className="ml-auto flex items-center gap-2">
                          {logs.length > 0 && (
                            <button
                              onClick={copyLogs}
                              className="flex items-center gap-1 text-[10px] uppercase font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
                            >
                              <Copy size={12} /> Copy
                            </button>
                          )}
                          {loading && (
                            <button
                              onClick={killRobot}
                              className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-500 bg-red-955 border border-red-900 px-2 py-1 rounded hover:bg-red-900 transition-colors"
                            >
                              <XCircle size={12} /> Kill
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="p-4 font-mono text-xs text-[var(--color-success)] h-40 overflow-y-auto flex flex-col gap-1 scrollbar-thin"
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

                  {/* Recent Transactions Table */}
                  <div className="glass-panel p-6 border border-zinc-800 bg-zinc-950/20 rounded-2xl w-full flex flex-col gap-4">
                    <div className="flex justify-between items-center border-b border-zinc-800/80 pb-3">
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
                        Recent Transactions <Tooltip text="The last few statement entries cached/fetched from the bank's database." />
                      </h3>
                      {lastPopulatedTime && (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          [{lastPopulatedTime}]
                        </span>
                      )}
                    </div>
                    
                    <div className="overflow-x-auto bg-transparent">
                      {lastTransactions && lastTransactions.length > 0 ? (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-zinc-800 bg-zinc-900/10 text-zinc-400 uppercase tracking-wider font-semibold text-[10px]">
                              <th className="px-4 py-2 font-medium">Date & Time <Tooltip text="The transaction posting date." /></th>
                              <th className="px-4 py-2 font-medium">Description <Tooltip text="Primary transaction description/type." /></th>
                              <th className="px-4 py-2 font-medium">Details <Tooltip text="Additional transaction info (refs, IDs, card details, sender info)." /></th>
                              <th className="px-4 py-2 font-medium text-right">Amount / Balance <Tooltip text="Green indicates credits (+), red indicates debits (-)." /></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900/50">
                            {lastTransactions.map((tx, idx) => {
                              const isCredit = tx.amount.startsWith('+');
                              const detailsParts = tx.details.split('\n');
                              const description = (detailsParts[0] || '').trim();
                              const details = detailsParts.slice(1).join('\n').trim();

                              return (
                                <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                  <td className="px-4 py-3.5 text-xs font-mono text-zinc-400 whitespace-nowrap align-top">
                                    {tx.date}
                                  </td>
                                  <td className="px-4 py-3.5 text-xs font-semibold text-zinc-200 align-top">
                                    {description}
                                  </td>
                                  <td className="px-4 py-3.5 text-[11px] text-zinc-400 font-mono whitespace-pre-line leading-relaxed align-top break-words max-w-xs lg:max-w-md">
                                    {details || <span className="text-zinc-600 italic">-</span>}
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-top whitespace-nowrap">
                                    <div className={`font-mono font-bold text-sm leading-none ${
                                      isCredit ? 'text-[var(--color-success)]' : 'text-red-400'
                                    }`}>
                                      {tx.amount}
                                    </div>
                                    {tx.runningBalance && (
                                      <div className="text-[10px] font-mono text-zinc-500 leading-none mt-1.5">
                                        Bal: {selectedAccountCurrency} {tx.runningBalance}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-8 text-center text-zinc-500 italic">
                          No recent history available.
                        </div>
                      )}
                    </div>

                    <div className="mt-2 pt-3 flex justify-center border-t border-zinc-900">
                      {(() => {
                        const selectedAccount = bankAccounts.find(a => a.id.toString() === selectedAccountId);
                        const isLocked = selectedAccount && (selectedAccount.login_failures || 0) >= 2;
                        return (
                          <button 
                            onClick={() => handleVerify('history')}
                            disabled={loading || isLocked}
                            className="text-[10px] uppercase font-bold text-zinc-400 hover:text-white transition-colors py-2 px-4 hover:bg-white/5 rounded-lg border border-zinc-800"
                          >
                            {loading && loadingMode === 'history' ? 'Loading...' : isLocked ? 'Blocked: Account Locked' : 'Load More Transactions'}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* View Tab 2: Transaction Ledger */}
            {activeTab === 'ledger' && (
              <div className="w-full max-w-xl lg:max-w-full w-full animate-fade-in flex flex-col gap-6">
                {/* Section Header */}
                <div className="w-full flex justify-between items-center border-b border-[var(--border-color)] pb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-1.5">Transaction Ledger <Tooltip text="A real-time ledger list showing statement entries and balance updates for your bank accounts." /></h2>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Real-time statements fetched directly from your bank</p>
                  </div>
                  
                  {loading && loadingMode === 'ledger' && (
                    <div className="flex items-center gap-2 bg-blue-950/40 text-blue-400 border border-blue-900/50 px-3 py-1 rounded-full text-xs font-semibold">
                      <Loader2 className="animate-spin" size={14} /> Synchronizing...
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
                  {/* Left Column: Bank Accounts & Summary Card (lg:col-span-5) */}
                  <div className="lg:col-span-5 space-y-6 w-full flex flex-col">
                    {/* Account Tabs Switcher */}
                    <div className="glass-panel p-5 w-full">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2.5 flex items-center gap-1.5 font-sans">Select Bank Account <Tooltip text="Filter transaction ledger entries by a specific configured bank account." /></label>
                      {bankAccounts.length === 0 ? (
                        <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-lg text-center text-zinc-500 italic text-sm">
                          No bank accounts configured. Please contact the administrator.
                        </div>
                      ) : (
                        <div className="flex flex-row lg:flex-col gap-2.5 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-thin w-full">
                          {bankAccounts.map(acc => {
                            const isSelected = selectedLedgerAccountId === acc.id.toString();
                            const isBml = acc.bank_name === 'BML';
                            return (
                              <button
                                key={acc.id}
                                onClick={() => {
                                  setSelectedLedgerAccountId(acc.id.toString());
                                  setLedgerPage(1);
                                }}
                                className={`px-4 py-3 rounded-xl border text-left flex items-center gap-3 transition-all shrink-0 lg:shrink w-[260px] lg:w-full ${
                                  isSelected
                                    ? isBml
                                      ? 'bg-red-955/20 border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                                      : 'bg-emerald-955/20 border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                                    : 'bg-[var(--bg-surface)] border-[var(--border-color)] hover:border-zinc-700'
                                }`}
                              >
                                <div className="w-8 h-8 rounded bg-zinc-950/80 border border-zinc-800 p-1 flex items-center justify-center shrink-0">
                                  <img src={isBml ? '/logo_bml.png' : '/logo_mib.png'} className="w-full h-full object-contain" alt="" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-[9px] uppercase font-bold tracking-wider ${
                                      isBml ? 'text-red-400' : 'text-emerald-400'
                                    }`}>
                                      {acc.bank_name}
                                    </span>
                                    {acc.label && (
                                      <span className="text-[9px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded font-medium">
                                        {acc.label}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs font-semibold text-white truncate max-w-full">
                                    {acc.account_name}
                                  </div>
                                  <div className="text-[10px] font-mono text-[var(--text-secondary)]">
                                    {acc.account_number}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Account Summary & Refresh Bar */}
                    {selectedLedgerAccountId && (() => {
                      const activeLedgerAcc = bankAccounts.find(a => a.id.toString() === selectedLedgerAccountId);
                      if (!activeLedgerAcc) return null;
                      
                      const cache = ledgerCache[selectedLedgerAccountId] || {
                        balance: 'Not synced',
                        lastUpdated: 'Never',
                        transactions: []
                      };
                      const ledgerCurrency = activeLedgerAcc.currency || 'MVR';
                      const isLockedByVerify = loading && loadingMode !== 'ledger';
                      const isSelectedLedgerAccountLocked = activeLedgerAcc && (activeLedgerAcc.login_failures || 0) >= 2;

                      return (
                        <div className="space-y-6">
                          {isSelectedLedgerAccountLocked && (
                            <div className="p-3.5 bg-red-955/20 border border-red-500/30 rounded-xl text-xs text-red-400 leading-normal flex items-start gap-2.5">
                              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                              <div>
                                <strong className="block font-bold mb-0.5">Account Security Lockout</strong>
                                This account is locked due to 2 consecutive failed logins. To prevent a permanent block, please log in manually in a web browser, verify the account is active, and then ask an administrator to reset this lockout from the Company Admin Panel.
                              </div>
                            </div>
                          )}
                          
                          {/* Summary Card */}
                          {permissions.ledger_show_balance && (
                            <div className="glass-panel p-6 border-[var(--border-color)] bg-gradient-to-br from-zinc-950 to-zinc-900/60 relative overflow-hidden flex flex-col justify-between items-start gap-4">
                              <div className="space-y-1">
                                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold flex items-center gap-1.5 font-sans">Available Balance <Tooltip text="The cleared account balance fetched directly from the bank's portal." /></span>
                                <div className={`text-3xl font-bold tracking-tight ${
                                  cache.balance === 'Not synced' ? 'text-zinc-500' : 'text-white'
                                }`}>
                                  {cache.balance !== 'Not synced' && cache.balance !== 'Not found' ? `${ledgerCurrency} ${cache.balance}` : cache.balance}
                                </div>
                                <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1.5 font-mono">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
                                  Last updated: {cache.lastUpdated}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Locking Overlay notification */}
                          {isLockedByVerify && (
                            <div className="p-3.5 bg-red-950/20 border border-red-900/30 rounded-xl text-xs text-red-400 flex items-center gap-2 animate-pulse">
                              <AlertTriangle size={14} className="shrink-0" />
                              <span>Ledger synchronization disabled. A transfer verification is currently in progress.</span>
                            </div>
                          )}

                          {/* Sync Error Block */}
                          {cache.error && (
                            <div className="p-3.5 bg-red-900/20 border border-red-500/30 rounded-xl text-xs text-red-400 leading-normal flex items-start gap-2.5">
                              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                              <div>
                                <strong className="block font-bold mb-0.5">Sync Failed:</strong>
                                {cache.error}
                              </div>
                            </div>
                          )}

                          {/* Ledger Logs Panel */}
                          {permissions.show_vbtl && activeTab === 'ledger' && (
                            <div className="w-full bg-black border border-zinc-800 rounded-lg overflow-hidden animate-fade-in shadow-2xl">
                              <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <span className="text-xs text-zinc-400 ml-2 font-mono flex items-center gap-1">Viri Bridge Ledger Logs <Tooltip text="Real-time network crawler debugging logs execution stream." /></span>
                                {loading && <Loader2 size={12} className="text-[var(--color-success)] animate-spin ml-2" />}

                                <div className="ml-auto flex items-center gap-2">
                                  {logs.length > 0 && (
                                    <button
                                      onClick={copyLogs}
                                      className="flex items-center gap-1 text-[10px] uppercase font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
                                    >
                                      <Copy size={12} /> Copy
                                    </button>
                                  )}
                                  {loading && (
                                    <button
                                      onClick={killRobot}
                                      className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-500 bg-red-955 border border-red-900 px-2 py-1 rounded hover:bg-red-900 transition-colors"
                                    >
                                      <XCircle size={12} /> Kill
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="p-4 font-mono text-xs text-[var(--color-success)] h-40 overflow-y-auto flex flex-col gap-1 scrollbar-thin"
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
                      );
                    })()}
                  </div>

                  {/* Right Column: Statement Entries Feed (lg:col-span-7) */}
                  <div className="lg:col-span-7 w-full">
                    {selectedLedgerAccountId && (() => {
                      const activeLedgerAcc = bankAccounts.find(a => a.id.toString() === selectedLedgerAccountId);
                      if (!activeLedgerAcc) return null;
                      
                      const cache = ledgerCache[selectedLedgerAccountId] || {
                        balance: 'Not synced',
                        lastUpdated: 'Never',
                        transactions: []
                      };
                      const ledgerCurrency = activeLedgerAcc.currency || 'MVR';

                      const displayedTransactions = cache.transactions.filter(tx => {
                        if (!permissions.ledger_show_debit) {
                          return tx.amount.startsWith('+');
                        }
                        return true;
                      });

                      const isBml = activeLedgerAcc.bank_name === 'BML';
                      const isSyncing = loading && loadingMode === 'ledger';
                      const isLockedByVerify = loading && loadingMode !== 'ledger';

                      // Pagination variables
                      const itemsPerPage = 20;
                      const totalPages = Math.ceil(displayedTransactions.length / itemsPerPage);
                      // Reset page to 1 if it exceeds total pages
                      const currentPage = Math.min(ledgerPage, totalPages || 1);
                      const startIndex = (currentPage - 1) * itemsPerPage;
                      const paginatedTransactions = displayedTransactions.slice(startIndex, startIndex + itemsPerPage);

                      return (
                        <div className="glass-panel p-5 w-full space-y-4">
                          {/* Panel Header with Title and Sync Button */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border-color)] pb-4">
                            <div>
                              <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5 font-sans">
                                Statement Entries ({displayedTransactions.length}) <Tooltip text="List of statement entries fetched from the selected bank account." />
                              </h3>
                              <div className="text-sm font-bold text-white mt-1 flex items-center gap-2">
                                <span>{activeLedgerAcc.account_name}</span>
                                <span className="bg-zinc-800 text-[10px] text-zinc-300 px-2 py-0.5 rounded font-mono font-semibold uppercase tracking-wider">
                                  {ledgerCurrency}
                                </span>
                              </div>
                            </div>
                            {(() => {
                              const selectedLedgerAccount = bankAccounts.find(a => a.id.toString() === selectedLedgerAccountId);
                              const isSelectedLedgerAccountLocked = selectedLedgerAccount && (selectedLedgerAccount.login_failures || 0) >= 2;
                              return (
                                <button
                                  onClick={() => syncLedger(selectedLedgerAccountId)}
                                  disabled={isSyncing || isLockedByVerify || isSelectedLedgerAccountLocked}
                                  className={`btn ${
                                    isBml ? 'btn-outline border-red-500/50 hover:bg-red-500 hover:text-white' : 'btn-success'
                                  } py-2.5 px-5 text-xs font-semibold flex items-center justify-center gap-2 transition-all shrink-0 ${
                                    isSyncing || isLockedByVerify || isSelectedLedgerAccountLocked ? 'opacity-50 cursor-not-allowed' : ''
                                  }`}
                                >
                                  <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                                  {isSyncing ? 'Syncing...' : isSelectedLedgerAccountLocked ? 'Blocked' : 'Sync Balance & History'}
                                </button>
                              );
                            })()}
                          </div>

                          {/* Linear Sync Progress Bar */}
                          {(isSyncing || progress.stage === 'error') && (
                            <div className="p-4 rounded-xl bg-black/40 border border-[var(--border-color)] animate-fade-in space-y-3">
                              <div className="flex justify-between items-center text-xs font-semibold">
                                <span className={`flex items-center gap-2 ${
                                  progress.stage === 'error' ? 'text-red-400' : 'text-blue-400'
                                }`}>
                                  {progress.stage === 'error' ? (
                                    <AlertTriangle size={14} />
                                  ) : (
                                    <Loader2 className="animate-spin text-blue-400" size={14} />
                                  )}
                                  {progress.text || "Synchronizing account..."}
                                </span>
                                <span className="font-mono text-zinc-400">
                                  {progress.stage === 'error' ? '0%' : `${progress.percent}%`}
                                </span>
                              </div>
                              
                              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden relative border border-zinc-900">
                                <div 
                                  className={`h-full transition-all duration-300 rounded-full ${
                                    progress.stage === 'error' 
                                      ? 'bg-red-500' 
                                      : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500'
                                  }`}
                                  style={{ width: `${progress.stage === 'error' ? 100 : progress.percent}%` }}
                                />
                              </div>
                              
                              <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                                <span>
                                  {timeLeft !== null && progress.stage !== 'success' && `Est. remaining: ~${timeLeft}s`}
                                </span>
                                <span>
                                  {syncTimeElapsed !== null && `Elapsed: ${(syncTimeElapsed / 1000).toFixed(1)}s`}
                                </span>
                              </div>
                            </div>
                          )}

                          <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-black/30 flex flex-col font-sans">
                            {isSyncing && paginatedTransactions.length === 0 ? (
                              <div className="p-12 text-center text-zinc-500 flex flex-col items-center gap-3">
                                <Loader2 className="animate-spin text-zinc-600" size={32} />
                                <span className="italic text-sm">Logging into bank account securely...</span>
                              </div>
                            ) : paginatedTransactions.length === 0 ? (
                              <div className="p-12 text-center text-zinc-500 italic text-sm">
                                No statement entries available. Click "Sync" to fetch recent history.
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                <div className="max-h-[65vh] lg:max-h-[70vh] overflow-y-auto scrollbar-thin">
                                  {/* Desktop Table Layout */}
                                  <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="border-b border-zinc-800/80 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                                          <th className="py-3 px-4 font-medium">Date & Time <Tooltip text="The transaction posting date." /></th>
                                          <th className="py-3 px-4 font-medium">Description <Tooltip text="Primary transaction description/type." /></th>
                                          <th className="py-3 px-4 font-medium">Details <Tooltip text="Additional transaction info (refs, IDs, card details, sender info)." /></th>
                                          <th className="py-3 px-4 font-medium text-right">Amount / Balance <Tooltip text="Green indicates credits (+), red indicates debits (-)." /></th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-900/50">
                                        {paginatedTransactions.map((tx, idx) => {
                                          const isCredit = tx.amount.startsWith('+');
                                          const detailsParts = tx.details.split('\n');
                                          const description = (detailsParts[0] || '').trim();
                                          const details = detailsParts.slice(1).join('\n').trim();
                                          
                                          return (
                                            <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                              <td className="py-3.5 px-4 text-xs font-mono text-zinc-400 whitespace-nowrap align-top">
                                                {tx.date}
                                              </td>
                                              <td className="py-3.5 px-4 text-xs font-semibold text-zinc-200 align-top">
                                                {description}
                                              </td>
                                              <td className="py-3.5 px-4 text-[11px] text-zinc-400 font-mono whitespace-pre-line leading-relaxed align-top break-words max-w-xs lg:max-w-md">
                                                {details || <span className="text-zinc-600 italic">-</span>}
                                              </td>
                                              <td className="py-3.5 px-4 text-right align-top whitespace-nowrap">
                                                <div className={`font-mono font-bold text-sm leading-none ${
                                                  isCredit ? 'text-[var(--color-success)]' : 'text-red-400'
                                                }`}>
                                                  {tx.amount}
                                                </div>
                                                {permissions.ledger_show_balance && tx.runningBalance && (
                                                  <div className="text-[10px] font-mono text-zinc-500 leading-none mt-1.5">
                                                    Bal: {ledgerCurrency} {tx.runningBalance}
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Mobile List Layout */}
                                  <div className="block md:hidden divide-y divide-zinc-900/50">
                                    {paginatedTransactions.map((tx, idx) => {
                                      const isCredit = tx.amount.startsWith('+');
                                      return (
                                        <div key={idx} className="p-4 flex justify-between items-start hover:bg-white/[0.02] transition-colors gap-4">
                                          <div className="space-y-1 flex-1">
                                            <div className="text-xs font-mono text-zinc-500">{tx.date}</div>
                                            <div className="text-[11px] text-zinc-200 whitespace-pre-line leading-relaxed break-words max-w-md">{tx.details}</div>
                                          </div>
                                          <div className="text-right space-y-1 shrink-0">
                                            <div className={`font-mono font-bold text-sm leading-none ${
                                              isCredit ? 'text-[var(--color-success)]' : 'text-red-400'
                                            }`}>
                                              {tx.amount}
                                            </div>
                                            {permissions.ledger_show_balance && tx.runningBalance && (
                                              <div className="text-[10px] font-mono text-zinc-500 leading-none mt-1">
                                                Bal: {ledgerCurrency} {tx.runningBalance}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                  <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-t border-[var(--border-color)] text-xs">
                                    <div className="text-[var(--text-secondary)] font-mono">
                                      Page <span className="text-white font-bold">{currentPage}</span> of <span className="text-white font-bold">{totalPages}</span> (Entries {startIndex + 1}-{Math.min(startIndex + itemsPerPage, displayedTransactions.length)} of {displayedTransactions.length})
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => setLedgerPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="btn btn-outline py-1 px-3 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5"
                                      >
                                        Previous
                                      </button>
                                      <button
                                        onClick={() => setLedgerPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className="btn btn-outline py-1 px-3 text-xs disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5"
                                      >
                                        Next
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'help' && (
              <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col items-center justify-start p-4 md:p-8 animate-fade-in overflow-y-auto space-y-8">
                <div className="w-full text-center space-y-2 mb-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-4">
                    <HelpCircle size={32} className="text-blue-400" />
                  </div>
                  <h2 className="text-3xl font-bold text-white tracking-tight">Help & Support</h2>
                  <p className="text-[var(--text-secondary)]">Learn how to install the extension and use the Terminal PWA.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  {/* Extension Installation Card */}
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 shadow-xl">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-white">
                      <MonitorSmartphone className="text-[var(--color-success)]" />
                      1. Extension Installation
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                      The Viri Bridge extension is required to establish a secure local connection between your device and the bank’s servers.
                    </p>
                    <div className="mb-6 flex justify-start">
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
                    </div>
                  </div>

                  {/* Terminal Pairing Card */}
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 shadow-xl">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-white">
                      <Lock className="text-blue-400" />
                      2. Terminal Pairing
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                      Link this browser to your company's Viri account by pairing the terminal.
                    </p>
                    <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-4 marker:text-blue-400">
                      <li>Obtain the <strong>Hardware ID</strong> and <strong>PIN</strong> from your superadmin dashboard.</li>
                      <li>Click the <strong>Settings</strong> icon (bottom left) to open the setup screen.</li>
                      <li>Enter the Hardware ID, PIN, and the Extension ID (found in chrome://extensions after installing).</li>
                      <li>Click <strong>Pair Terminal</strong> to securely authenticate.</li>
                    </ol>
                  </div>

                  {/* Verification Workflow Card */}
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 shadow-xl">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-white">
                      <Search className="text-purple-400" />
                      3. Transfer Verification
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                      Verify incoming customer transfers instantly without relying on SMS or full bank logins.
                    </p>
                    <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-3 marker:text-purple-400">
                      <li>Select the target bank account from the top dropdown.</li>
                      <li>Select the verification mode (e.g. <strong>BML Receipt Match</strong> or <strong>MIB Transfer</strong>).</li>
                      <li>Enter the exact amount shown on the customer's transfer receipt.</li>
                      <li>Click <strong>Verify Transfer</strong>. The system will securely wake up the extension and ping the bank for an exact match.</li>
                    </ol>
                    <div className="mt-4 p-3 bg-zinc-900 rounded-lg text-xs text-zinc-400 border border-zinc-800">
                      <strong>Note:</strong> Verification performs a lightweight sync using the cached session credentials to prevent rate-limiting.
                    </div>
                  </div>

                  {/* Ledger & Syncing Card */}
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 shadow-xl">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-white">
                      <BookOpen className="text-amber-400" />
                      4. Transaction Ledger
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                      View recent transaction history natively within the PWA.
                    </p>
                    <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-3 marker:text-amber-400">
                      <li>Navigate to the <strong>Transaction Ledger</strong> tab using the left sidebar.</li>
                      <li>Select an account and click <strong>Sync Ledger</strong>.</li>
                      <li>The extension will pull the 10 most recent transactions securely from your bank.</li>
                      <li>Credit (incoming) transactions are highlighted in green, while Debit (outgoing) are red.</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
}

export default App;
