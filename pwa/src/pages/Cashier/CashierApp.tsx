import React, { useState, useEffect, useRef } from 'react';
import { Shield, RefreshCw, Settings, AlertTriangle, Lock, MonitorSmartphone, XCircle, Copy, Loader2, Search, History, BookOpen, BarChart3, Info, HelpCircle, ChevronRight, ChevronLeft, Terminal, Activity, Sun, Moon, ExternalLink, Trash2, KeyRound, Download, FileText } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import CryptoJS from 'crypto-js';

const Tooltip = ({ text, helpSectionId, onHelpNavigate }: { text: string; helpSectionId?: string; onHelpNavigate?: (sectionId: string) => void }) => (
  <div className="relative inline-flex items-center group ml-1.5 cursor-help align-middle">
    <Info size={13} className="text-zinc-500 hover:text-zinc-300 transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 p-3 bg-zinc-900 border border-zinc-700 text-white text-[11px] leading-relaxed rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 font-normal normal-case" style={{ pointerEvents: 'none' }}>
      {text}
      {helpSectionId && onHelpNavigate && (
        <button
          onClick={(e) => { e.stopPropagation(); onHelpNavigate(helpSectionId); }}
          className="mt-2 flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors text-[10px] font-semibold"
          style={{ pointerEvents: 'auto' }}
        >
          <ExternalLink size={10} /> Learn more in Help
        </button>
      )}
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

// ---------------------------------------------------------------------------
// Zero-Knowledge Credential Sync Helpers
// All cryptography runs exclusively in the browser via Web Crypto API.
// ---------------------------------------------------------------------------
const ZK_WORD_LIST = [
  'apple', 'brave', 'coral', 'delta', 'eagle', 'frost', 'grape', 'honey', 'ivory', 'jewel',
  'karma', 'lemon', 'maple', 'noble', 'ocean', 'pearl', 'quartz', 'river', 'storm', 'tiger',
  'ultra', 'vivid', 'waltz', 'xenon', 'yield', 'zebra', 'amber', 'blaze', 'cedar', 'drift',
  'ember', 'flint', 'glade', 'haven', 'iris', 'jade', 'knoll', 'lunar', 'mirth', 'nexus',
  'oasis', 'prism', 'quest', 'ridge', 'solar', 'thorn', 'unity', 'valor', 'winds', 'xenial',
  'young', 'zephyr', 'acorn', 'birch', 'crest', 'dusk', 'ether', 'forge', 'grove', 'haze',
  'inlet', 'jest', 'kite', 'lance', 'mango', 'north', 'orbit', 'pike', 'quiet', 'raven',
  'swift', 'tide', 'urban', 'veil', 'wheat', 'xeric', 'yarn', 'zinc', 'atlas', 'bison',
  'cliff', 'dune', 'epoch', 'fable', 'giant', 'helix', 'icon', 'joust', 'knave', 'lark',
  'merit', 'nymph', 'olive', 'plume', 'quirk', 'robin', 'slate', 'trove', 'umbra', 'vortex',
  'wren', 'exact', 'yoke', 'zonal', 'abyss', 'bloom', 'chrome', 'dawns', 'elbow', 'flair',
  'guile', 'hyper', 'irony', 'joker', 'kiosk', 'laser', 'magic', 'nerve', 'optic', 'pivot',
  'quota', 'realm', 'scout', 'tempo', 'utmost', 'vibrant', 'woven', 'xtra', 'yeoman', 'zipper',
  'arch', 'beam', 'crisp', 'dwell', 'elite', 'flora', 'glyph', 'hoard', 'isle', 'jelly',
  'kudos', 'lilac', 'marsh', 'notch', 'oven', 'plaza', 'quill', 'reign', 'spare', 'torque',
  'uncap', 'visor', 'watch', 'xenon2', 'yodel', 'zippy', 'azure', 'blunt', 'cloak', 'decoy',
  'envoy', 'fluke', 'glint', 'hinge', 'index', 'joust2', 'knelt', 'lyric', 'manor', 'nudge',
  'onset', 'prowl', 'quake', 'rivet', 'servo', 'tunic', 'ultra2', 'vouch', 'whisk', 'expel',
  'yearn', 'zesty', 'adept', 'brace', 'crane', 'depot', 'evoke', 'floss', 'gloom', 'hatch',
  'input', 'jolly', 'knack', 'ledge', 'model', 'notch2', 'onset2', 'pixel', 'query', 'rouge',
  'synth', 'tryst', 'upend', 'vivid2', 'walrus', 'xylem', 'yawns', 'zonal2', 'abode', 'brush'
];

function generateSyncPassphrase(): string {
  const arr = new Uint32Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(n => ZK_WORD_LIST[n % ZK_WORD_LIST.length]).join('-');
}

async function encryptCredentialsForSync(
  passphrase: string,
  creds: object
): Promise<{ passphrase: string; encrypted_blob: string; wrapped_dek: string; kdf_salt: string; gcm_iv: string }> {
  const enc = new TextEncoder();
  const kdfSalt = crypto.getRandomValues(new Uint8Array(16));
  const gcmIv = crypto.getRandomValues(new Uint8Array(12));

  const keyMat = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const kek = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: kdfSalt, iterations: 600_000, hash: 'SHA-256' },
    keyMat, { name: 'AES-KW', length: 256 }, false, ['wrapKey']
  );
  const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const blob = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: gcmIv }, dek, enc.encode(JSON.stringify(creds))
  );
  const wdek = await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW');

  const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
  return {
    passphrase,
    encrypted_blob: b64(blob),
    wrapped_dek: b64(wdek),
    kdf_salt: b64(kdfSalt),
    gcm_iv: b64(gcmIv),
  };
}

async function decryptCredentialsFromSync(
  payload: { passphrase: string; encrypted_blob: string; wrapped_dek: string; kdf_salt: string; gcm_iv: string }
): Promise<Record<string, { username?: string; password?: string; totpSeed?: string }>> {
  const enc = new TextEncoder();
  const b64d = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  const keyMat = await crypto.subtle.importKey('raw', enc.encode(payload.passphrase), 'PBKDF2', false, ['deriveKey']);
  const kek = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64d(payload.kdf_salt), iterations: 600_000, hash: 'SHA-256' },
    keyMat, { name: 'AES-KW', length: 256 }, false, ['unwrapKey']
  );
  const dek = await crypto.subtle.unwrapKey(
    'raw', b64d(payload.wrapped_dek), kek, 'AES-KW',
    { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64d(payload.gcm_iv) }, dek, b64d(payload.encrypted_blob)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

interface BankAccount {
  id: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  mib_profile_type?: string;
  bml_profile_type?: string;
  bml_internal_id?: string;
  bml_auth_state?: any;
  has_api_token?: boolean;
  is_default: boolean;
  label?: string;
  currency?: string;
  login_failures?: number;
  login_credentials_hash?: string;
  session_holder_terminal_id?: number | null;
  session_holder_name?: string | null;
  session_claimed_at?: string | null;
  session_last_heartbeat_at?: string | null;
}

interface LedgerTransaction {
  date: string;
  details: string;
  amount: string;
  runningBalance?: string;
  hash?: string;
  reference?: string;
}

interface LedgerData {
  balance: string;
  lastUpdated: string;
  lastUpdatedTimestamp?: number;
  timestamp?: number;
  transactions: LedgerTransaction[];
  error?: string;
  cacheVersion?: number;
  cachedAt?: string;
  cachedByTerminalName?: string;
  isFromServerCache?: boolean;
}

const LiveTimer = ({ 
  startTime, 
  mode = 'elapsed' 
}: { 
  startTime: number; 
  mode?: 'elapsed' | 'ago' | 'hms' 
}) => {
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (mode === 'elapsed') {
    return <span>{((tick - startTime) / 1000).toFixed(1)}s</span>;
  }
  
  if (mode === 'ago') {
    const diffSeconds = Math.max(0, Math.floor((tick - startTime) / 1000));
    return <span>{diffSeconds}</span>;
  }

  if (mode === 'hms') {
    const diffSeconds = Math.max(0, Math.floor((tick - startTime) / 1000));
    const h = Math.floor(diffSeconds / 3600);
    const m = Math.floor((diffSeconds % 3600) / 60);
    const s = diffSeconds % 60;
    return <span>{`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`}</span>;
  }
  
  return null;
};

const formatAmount = (val: any): string => {
  if (val === undefined || val === null || val === '') return '0.00';
  const str = String(val).trim();
  if (str === 'Not synced' || str === 'Not found' || str === 'Never' || str === 'Never synced') {
    return str;
  }
  let sign = '';
  let rest = str;
  if (str.startsWith('+')) {
    sign = '+';
    rest = str.substring(1);
  } else if (str.startsWith('-')) {
    sign = '-';
    rest = str.substring(1);
  }
  const cleanRest = rest.replace(/,/g, '');
  const num = parseFloat(cleanRest);
  if (isNaN(num)) return str;
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${sign}${formatted}`;
};

const getTransactionIcon = (description: string) => {
  const descLower = description.toLowerCase();
  if (descLower.includes('annual') || descLower.includes('fee') || descLower.includes('charge')) {
    return <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 border border-zinc-700/50"><Copy size={14} /></div>;
  }
  if (descLower.includes('withdrawal') || descLower.includes('atm') || descLower.includes('cash')) {
    return <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 border border-zinc-700/50 font-mono text-[9px] font-bold">ATM</div>;
  }
  if (descLower.includes('purchase') || descLower.includes('visa') || descLower.includes('pos') || descLower.includes('card')) {
    return <div className="w-8 h-8 rounded-lg bg-red-955/20 flex items-center justify-center text-red-400 border border-red-900/30"><MonitorSmartphone size={14} /></div>;
  }
  return <div className="w-8 h-8 rounded-lg bg-emerald-955/20 flex items-center justify-center text-emerald-400 border border-emerald-900/30"><BookOpen size={14} /></div>;
};

const TransactionRow = React.memo(({
  tx,
  isNew,
  isCredit,
  isChecked,
  activeLedgerAcc,
  permissions,
  handleCheckTransaction,
}: {
  tx: LedgerTransaction;
  isNew: boolean;
  isCredit: boolean;
  isChecked: boolean;
  activeLedgerAcc: BankAccount | undefined;
  permissions: any;
  handleCheckTransaction: (accountId: string, hash: string) => void;
}) => {
  const detailsParts = (tx.details || '').split('\n');
  const description = (detailsParts[0] || '').trim();
  const details = detailsParts.slice(1).join('\n').trim();

  return (
    <tr className={`hover:bg-white/[0.01] transition-colors group ${isNew ? 'animate-new-transaction' : ''}`}>
      <td className="py-4 px-5 text-center align-middle">
        {tx.hash && (
          <button 
            onClick={() => !isChecked && activeLedgerAcc && handleCheckTransaction(activeLedgerAcc.id.toString(), tx.hash!)}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              isChecked 
                ? 'bg-emerald-500 border-emerald-500 text-white cursor-default' 
                : 'border-zinc-600 hover:border-emerald-400 text-transparent hover:text-zinc-600 cursor-pointer'
            }`}
            title={isChecked ? 'Received' : 'Mark as Received'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        )}
      </td>
      <td className="py-4 px-5 text-xs font-mono text-zinc-400 whitespace-nowrap align-middle">
        {tx.date}
      </td>
      <td className="py-4 px-5 text-sm font-bold text-zinc-200 align-middle">
        <div className="flex items-center gap-3">
          {getTransactionIcon(description)}
          <span>{description}</span>
        </div>
      </td>
      <td className="py-4 px-5 text-xs text-zinc-400 font-mono whitespace-pre-line leading-relaxed align-middle break-all max-w-sm">
        {details || <span className="text-zinc-600 italic">-</span>}
        {activeLedgerAcc?.bank_name === 'BML' && (
          <div className="mt-2 flex flex-wrap gap-2 text-zinc-300">
            {(() => {
              const combinedText = `${tx.reference || ''} ${tx.details || ''}`;
              const refs = Array.from(new Set(combinedText.match(/(?:BLZ|BLAZ|FT)[A-Za-z0-9\\]+/gi) || []));
              
              const fallbackRef = tx.reference && tx.reference.trim().length > 4 && !tx.reference.toLowerCase().includes('ansfer') && !tx.reference.toLowerCase().includes('transfer') ? tx.reference : null;
              if (refs.length === 0 && fallbackRef) refs.push(fallbackRef);
              
              if (refs.length > 0) {
                return refs.map((ref, idx) => (
                  <div key={idx} className="inline-flex items-center gap-2 bg-zinc-900 px-2 py-1 rounded">
                    <span className="font-semibold">{ref}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(ref)}
                      className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                      title="Copy Reference"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                ));
              }
              return null;
            })()}
          </div>
        )}
      </td>
      <td className="py-4 px-5 text-right align-middle whitespace-nowrap">
        <div className={`font-mono font-extrabold text-base ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
          {formatAmount(tx.amount)}
        </div>
        {permissions.ledger_show_balance && tx.runningBalance && (
          <div className="text-[10px] font-mono text-zinc-500 leading-none mt-1 uppercase">
            Bal {formatAmount(tx.runningBalance)}
          </div>
        )}
      </td>
    </tr>
  );
});

function App() {
  const [theme, toggleTheme] = useTheme();


  const [amount, setAmount] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [appConfig, setAppConfig] = useState({
    session_status_poll_interval: 12,
    credential_sync_poll_interval: 60,
    version_check_interval: 120,
    active_session_heartbeat_interval: 5,
    realtime_event_poll_interval: 3,
    poll_interval_holder: 1,
    debug_log_mib_html: false,
    bml_login_procedure: 'legacy'
  });
  const [settingsPin, setSettingsPin] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<any>({
    verification_enabled: true,
    ledger_enabled: true,
    ledger_show_balance: true,
    ledger_show_debit: true,
    reports_enabled: false,
    show_vbtl: false
  });
  const [shouldUploadLogs, setShouldUploadLogs] = useState(true);
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [licenseExpiresAt, setLicenseExpiresAt] = useState<string | null>(null);
  const [expiryWarningDays, setExpiryWarningDays] = useState<number>(7);
  const [showExpiryWarning, setShowExpiryWarning] = useState<boolean>(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  useEffect(() => {
    if (showExpiryWarning) {
      console.log(`Subscription warning threshold triggered: expiry within ${expiryWarningDays} days.`);
    }
  }, [showExpiryWarning, expiryWarningDays]);

  const [sessionStatus, setSessionStatus] = useState<'idle' | 'claiming' | 'holder' | 'delegating'>('idle');
  const [sessionHolderAccountId, setSessionHolderAccountId] = useState<string | null>(null);
  const [delegatedFulfilling, setDelegatedFulfilling] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [defaultAccountId, setDefaultAccountId] = useState<string>(() => {
    return localStorage.getItem('viri_default_account_id') || '';
  });
  const [recentTxCache, setRecentTxCache] = useState<Record<string, {
    transactions: {
      date: string;
      details: string;
      amount: string;
      runningBalance?: string;
      reference?: string;
    }[];
    label: string;
    lastUpdated: string;
    timestamp: number | null;
  }>>(() => {
    const saved = localStorage.getItem('viri_recent_tx_cache');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('viri_recent_tx_cache', JSON.stringify(recentTxCache));
  }, [recentTxCache]);

  const [isUserIdle, setIsUserIdle] = useState(false);
  const [isUserDeepIdle, setIsUserDeepIdle] = useState(false);

  useEffect(() => {
    let idleTimeout: ReturnType<typeof setTimeout>;
    let deepIdleTimeout: ReturnType<typeof setTimeout>;

    const resetIdleTimer = () => {
      setIsUserIdle(false);
      setIsUserDeepIdle(false);
      clearTimeout(idleTimeout);
      clearTimeout(deepIdleTimeout);

      idleTimeout = setTimeout(() => {
        setIsUserIdle(true);
      }, 180000); // 3 minutes of inactivity

      deepIdleTimeout = setTimeout(() => {
        setIsUserDeepIdle(true);
      }, 1800000); // 30 minutes of inactivity
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdleTimer));

    resetIdleTimer();

    return () => {
      clearTimeout(idleTimeout);
      clearTimeout(deepIdleTimeout);
      events.forEach(event => window.removeEventListener(event, resetIdleTimer));
    };
  }, []);



  const computeStatementFingerprint = async (
    accountId: number,
    bankName: string,
    currency: string,
    transactions: any[]
  ): Promise<string> => {
    const sorted = [...transactions].sort((a, b) => {
      const keyA = `${a.date || ''}|${a.amount || ''}|${a.details || ''}`;
      const keyB = `${b.date || ''}|${b.amount || ''}|${b.details || ''}`;
      return keyA.localeCompare(keyB);
    });

    const txStr = sorted.map(t => `${t.date || ''}|${t.amount || ''}|${t.details || ''}`).join(';');
    const dateStr = new Date().toISOString().split('T')[0]; // Statement date
    const input = `${accountId}|${bankName}|${currency}|${dateStr}|${txStr}`;

    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const [visibility, setVisibility] = useState<DocumentVisibilityState>(typeof document !== 'undefined' ? document.visibilityState : 'visible');
  const [newTransactionKeys, setNewTransactionKeys] = useState<Set<string>>(new Set());
  
  // Statements State
  const [stmtAccountId, setStmtAccountId] = useState('');
  const [stmtFromDate, setStmtFromDate] = useState('');
  const [stmtToDate, setStmtToDate] = useState('');
  const [stmtLoading, setStmtLoading] = useState(false);
  const [stmtTransactions, setStmtTransactions] = useState<any[] | null>(null);
  const [stmtError, setStmtError] = useState('');

  // Derived state for the selected account's recent transactions
  const lastTransactions = selectedAccountId ? (recentTxCache[selectedAccountId]?.transactions || []) : [];
  const lastTransactionsLabel = selectedAccountId ? (recentTxCache[selectedAccountId]?.label || '') : '';
  const lastPopulatedTime = selectedAccountId ? (recentTxCache[selectedAccountId]?.lastUpdated || '') : '';
  const lastPopulatedTimestamp = selectedAccountId ? (recentTxCache[selectedAccountId]?.timestamp || null) : null;
  const [syncTimeElapsed, setSyncTimeElapsed] = useState<number | null>(null);
  const syncStartTimeRef = useRef<number | null>(null);
  const checkPendingRequestsRef = useRef<() => Promise<void>>();
  // Removed currentTick state for performance
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);
  const [terminalId, setTerminalId] = useState<number | null>(null);
  const LATEST_EXTENSION_VERSION = "1.2.41";

  const setErrorAndLog = (errorMsg: string, accountId?: string) => {
    setError(errorMsg);
    const bUrl = backendUrl || localStorage.getItem('viri_backend_url') || (typeof window !== 'undefined' ? `${window.location.origin}/api` : '');
    const accId = parseInt(accountId || selectedAccountId || '0');
    if (!isNaN(accId) && accId > 0 && bUrl) {
      fetch(`${bUrl}/terminal/session/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_id: hardwareId || localStorage.getItem('viri_hardware_id'),
          event_type: 'fetch_request_failed',
          bank_account_id: accId,
          event_summary: errorMsg,
          pwa_logs: logsRef.current || [],
          extension_version: extensionVersion || LATEST_EXTENSION_VERSION
        })
      }).catch(e => console.error("Failed to log system error:", e));
    }
  };

  // (Interval for currentTick removed for performance)




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

  useEffect(() => {
    if (!extensionId || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;

    const checkVersion = () => {
      try {
        chrome.runtime.sendMessage(extensionId, { action: 'GET_VERSION' }, (response) => {
          if (!chrome.runtime.lastError && response && response.version) {
            setExtensionVersion(response.version);
          } else {
            setExtensionVersion(null);
          }
        });
      } catch (e) {
        setExtensionVersion(null);
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, appConfig.version_check_interval * 1000);
    return () => clearInterval(interval);
  }, [extensionId, appConfig.version_check_interval]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'VIRI_BRIDGE_HEARTBEAT' && event.data.extensionId) {
        console.log("Auto-detected Viri Bridge Extension ID:", event.data.extensionId);
        setExtensionId(event.data.extensionId);
        localStorage.setItem('viri_extension_id', event.data.extensionId);
        if (event.data.version) {
          setExtensionVersion(event.data.version);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    const requestInterval = setInterval(() => {
      try {
        window.postMessage({ type: 'REQUEST_VIRI_BRIDGE_ID' }, '*');
      } catch (e) { }
    }, 2000);
    try {
      window.postMessage({ type: 'REQUEST_VIRI_BRIDGE_ID' }, '*');
    } catch (e) { }
    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(requestInterval);
    };
  }, []);

  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('viri_sidebar_collapsed') === 'true';
  });
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'in' | 'out'>('all');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerPageSize, setLedgerPageSize] = useState(25);
  const [ledgerDateFilter, setLedgerDateFilter] = useState<string | null>(null); // "YYYY-MM-DD" or null
  const [ledgerDatePickerOpen, setLedgerDatePickerOpen] = useState(false);
  const [ledgerPickerYear, setLedgerPickerYear] = useState(() => new Date().getFullYear());
  const [ledgerPickerMonth, setLedgerPickerMonth] = useState(() => new Date().getMonth());

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

  // Standalone/On-demand Credential Sync States
  const [importPending, setImportPending] = useState(false);
  const [importSyncId, setImportSyncId] = useState<string | null>(null);
  const [importCountdown, setImportCountdown] = useState<number>(300);
  const [importStatus, setImportStatus] = useState<'idle' | 'connecting' | 'done' | 'error'>('idle');



  const logActivityToServer = async (eventType: string, metadata: any = {}) => {
    if (!hardwareId || !backendUrl) return;
    try {
      await fetch(`${backendUrl}/terminal/status/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_id: hardwareId,
          event: eventType,
          metadata
        })
      });
    } catch (e) {
      console.error("Error logging activity to server:", e);
    }
  };

  useEffect(() => {
    const handleOnline = () => logActivityToServer('terminal_online');
    const handleOffline = () => logActivityToServer('terminal_offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Also log initial connect if hardwareId is present
    if (hardwareId && backendUrl) {
      logActivityToServer('terminal_online');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hardwareId, backendUrl]);

  // Real-Time signaling poll (Zero-Knowledge: credentials remain client-side only)
  useEffect(() => {
    if (!hardwareId || !backendUrl) return;

    let pollInterval: ReturnType<typeof setInterval>;

    const processEvent = async (eventType: string, payloadStr: string) => {
      try {
        const payload = JSON.parse(payloadStr || '{}');
        if (eventType === 'verify_request_queued') {
          addLog(`> [Realtime] Received instant verification request signal. Querying pending queue...`);
          if (checkPendingRequestsRef.current) {
            await checkPendingRequestsRef.current();
          }
        } else if (eventType === 'cache_refresh_requested') {
          const { request_id, bank_account_id, bank_name, account_number, account_name, mib_profile_type, requester_name } = payload;

          addLog(`> [Realtime] Received cache refresh request ID ${request_id} from counter "${requester_name}". Acknowledging...`);

          // 1. Acknowledge the request immediately to let follower know we're active
          await fetch(`${backendUrl}/terminal/session/acknowledge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hardware_id: hardwareId,
              request_id: request_id
            })
          });

          // 2. Trigger background sync via extension using local client-side credentials (ZK compliance)
          const activeCreds = accountsCreds[bank_account_id.toString()];
          if (!activeCreds) {
            throw new Error(`No saved credentials for account ID ${bank_account_id}`);
          }
          if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
            throw new Error("Local extension not connected/detected.");
          }

          addLog(`> [Realtime] Initiating background bank sync for request ID ${request_id}...`);
          const port = chrome.runtime.connect(extensionId, { name: "viri-verify" });

          const responseData = await new Promise<any>((resolve, reject) => {
            const disconnectHandler = () => reject(new Error("Extension port disconnected unexpectedly."));
            port.onDisconnect.addListener(disconnectHandler);

            port.onMessage.addListener((msg) => {
              if (msg.type === 'log') {
                addLog(`> [Realtime Leader Sync] ${msg.message}`);
              } else if (msg.type === 'success') {
                port.onDisconnect.removeListener(disconnectHandler);
                addLog(`> [Realtime Leader Sync] Raw history size: ${msg.raw_history ? msg.raw_history.length : 0} items.`);
                if (msg.raw_history && msg.raw_history.length > 0) {
                  addLog(`> [Realtime Leader Sync] Raw history sample: ${JSON.stringify(msg.raw_history.slice(0, 1))}`);
                }
                resolve(msg.payload || msg);
              } else if (msg.type === 'error') {
                port.onDisconnect.removeListener(disconnectHandler);
                reject(new Error(msg.error));
              }
            });

            port.postMessage({
              action: 'FULFILL_DELEGATED_REQUEST',
              payload: {
                req: {
                  id: request_id,
                  bank_account_id,
                  bank_name,
                  account_number,
                  account_name,
                  mib_profile_type,
                  request_type: 'ledger'
                },
                credentials: {
                  username: activeCreds.username,
                  password: activeCreds.password,
                  totpSeed: activeCreds.totpSeed
                },
                bankName: bank_name,
                debugLogMibHtml: appConfig.debug_log_mib_html
              }
            });
          });

          port.disconnect();

          // 3. Push new data to cache & mark request fulfilled
          addLog(`> [Realtime] Sync succeeded for request ID ${request_id}. Pushing new cache to server...`);
          await fetch(`${backendUrl}/terminal/ledger-cache/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hardware_id: hardwareId,
              bank_account_id: bank_account_id,
              balance: responseData.balance || '0.00',
              transactions: responseData.transactions || [],
              request_id: request_id
            })
          });

          addLog(`> [Realtime] Cache updated successfully for account ID ${bank_account_id}.`);

          // Proactively update local cache too!
          setLedgerCache(prev => ({
            ...prev,
            [bank_account_id.toString()]: {
              balance: responseData.balance || '0.00',
              lastUpdated: new Date().toLocaleTimeString(),
              lastUpdatedTimestamp: Date.now(),
              transactions: responseData.transactions || [],
              isFromServerCache: true
            }
          }));

        } else if (eventType === 'verify_request_completed') {
          addLog(`> [Realtime] Sync request ID ${payload.request_id} resolved with status: ${payload.status}`);

          const customEvent = new CustomEvent(`sync_request_${payload.request_id}`, {
            detail: payload
          });
          window.dispatchEvent(customEvent);
        } else if (eventType === 'verify_request_acknowledged') {
          addLog(`> [Realtime] Sync request ID ${payload.request_id} acknowledged by leader.`);

          const customEvent = new CustomEvent(`sync_request_ack_${payload.request_id}`, {
            detail: payload
          });
          window.dispatchEvent(customEvent);
        } else if (eventType === 'transaction_checked') {
          setCheckedHashes(prev => {
            const next = new Set(prev);
            next.add(payload.hash);
            return next;
          });
        }
      } catch (err: any) {
        console.error("Realtime event process failed:", err);
        addLog(`> [Realtime Sync Failed] ${err.message}`);
      }
    };

    const poll = async () => {
      // Visibility-Based Throttling: Pause polling completely when tab is hidden/minimized
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      try {
        const res = await fetch(`${backendUrl}/terminal/events/poll?hardware_id=${encodeURIComponent(hardwareId)}`);
        if (!res.ok) return;
        const events = await res.json();
        if (Array.isArray(events)) {
          for (const evt of events) {
            await processEvent(evt.event_type, evt.payload);
          }
        }
      } catch (err) {
        console.error("Realtime event polling error:", err);
      }
    };

    // Run initial poll immediately
    poll();

    pollInterval = setInterval(poll, (appConfig.realtime_event_poll_interval || 3) * 1000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [hardwareId, backendUrl, accountsCreds, extensionId]);


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
    // Credentials are stored locally only (ZK architecture — not transmitted to server)
    logActivityToServer('settings_changed', { action: 'saved_credentials', account_id: accId });
  };

  const clearAccountCredentials = async (accId: string) => {
    const updated = { ...accountsCreds };
    delete updated[accId];
    setAccountsCreds(updated);
    localStorage.setItem('viri_accounts_creds', JSON.stringify(updated));
    // Credentials are stored locally only (ZK architecture — not transmitted to server)
    logActivityToServer('settings_changed', { action: 'cleared_credentials', account_id: accId });
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

  const [activeTab, setActiveTab] = useState<'verify' | 'ledger' | 'reports' | 'checklist' | 'help' | 'statements'>('verify');
  const [helpSearchQuery, setHelpSearchQuery] = useState('');
  const [bankSearchQuery, setBankSearchQuery] = useState('');
  const verifyAccountRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const helpContentRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const [ledgerCache, setLedgerCache] = useState<Record<string, LedgerData>>(() => {
    const saved = localStorage.getItem('viri_ledger_cache');
    return saved ? JSON.parse(saved) : {};
  });

  const [checkedHashes, setCheckedHashes] = useState<Set<string>>(new Set());

  const handleSaveReport = async () => {
    if (!hardwareId || !backendUrl) return;

    // We get the active account and its transactions
    const activeLedgerAcc = bankAccounts.find(a => a.id.toString() === selectedLedgerAccountId);
    if (!activeLedgerAcc) return;

    const cache = ledgerCache[activeLedgerAcc.id.toString()];
    if (!cache || !cache.transactions || cache.transactions.length === 0) {
      alert("No transactions available to save into a report.");
      return;
    }

    let currentBal = parseFloat((cache.balance || '0').replace(/,/g, ''));
    const rawTransactions = (cache.transactions || []).map((tx: any) => {
      if (tx.runningBalance) return tx;
      
      const newTx = { ...tx, runningBalance: currentBal.toFixed(2) };
      const amt = parseFloat((tx.amount || '0').replace(/,/g, '').replace('+', ''));
      currentBal -= amt;
      return newTx;
    });
    const filteredTransactionsForReport = rawTransactions.filter((tx: any) => {
      const isCredit = (tx.amount || '').startsWith('+');

      // 0. Permission Filter (Hide Outward / Debit)
      if (!permissions.ledger_show_debit && !isCredit) return false;

      // 1. Direction Filter
      if (ledgerFilter === 'in' && !isCredit) return false;
      if (ledgerFilter === 'out' && isCredit) return false;

      // 2. Search Query Matching (description, details, date)
      if (ledgerSearch.trim()) {
        const query = ledgerSearch.toLowerCase();
        const matchesDesc = (tx.details || '').toLowerCase().includes(query);
        const matchesDate = (tx.date || '').toLowerCase().includes(query);
        const matchesAmount = (tx.amount || '').toLowerCase().includes(query);
        if (!(matchesDesc || matchesDate || matchesAmount)) return false;
      }

      // 3. Date Filter
      if (ledgerDateFilter) {
        // tx.date format: "Jul 5, 14:06" → match by "Jul D," prefix
        const picked = new Date(ledgerDateFilter);
        const monthShort = picked.toLocaleString('en-US', { month: 'short' });
        const day = picked.getDate();
        const prefix = `${monthShort} ${day},`;
        if (!(tx.date || '').startsWith(prefix)) return false;
      }

      return true;
    });

    if (filteredTransactionsForReport.length === 0) {
      alert("No transactions match the current filters. Cannot save an empty report.");
      return;
    }

    const reportPayload = {
      createdAt: new Date().toISOString(),
      bankName: activeLedgerAcc.bank_name,
      accountName: activeLedgerAcc.account_name,
      accountNumber: activeLedgerAcc.account_number,
      currency: activeLedgerAcc.currency || 'MVR',
      balanceAtSave: cache.balance || '0.00',
      transactions: filteredTransactionsForReport,
    };

    const payloadString = JSON.stringify(reportPayload);
    const encryptedPayload = CryptoJS.AES.encrypt(payloadString, reportsKey).toString();

    try {
      const res = await fetch(`${backendUrl}/terminal/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_id: hardwareId,
          date: reportPayload.createdAt,
          bank: reportPayload.bankName,
          account_name: reportPayload.accountName,
          account_number: reportPayload.accountNumber,
          encrypted_payload: encryptedPayload
        })
      });

      if (res.ok) {
        alert("Report successfully saved!");
        loadReports(); // Refresh the saved reports list
      } else {
        const errData = await res.json();
        alert(`Failed to save report: ${errData.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Error saving report: ${e.message}`);
    }
  };

  useEffect(() => {
    localStorage.setItem('viri_ledger_cache', JSON.stringify(ledgerCache));
  }, [ledgerCache]);

  const [reportsKey] = useState<string>(() => {
    let key = localStorage.getItem('viri_reports_key');
    if (!key) {
      key = CryptoJS.lib.WordArray.random(256 / 8).toString();
      localStorage.setItem('viri_reports_key', key);
    }
    return key;
  });

  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  const loadReports = async () => {
    if (!hardwareId || !backendUrl) return;
    try {
      const response = await fetch(`${backendUrl}/terminal/reports?hardware_id=${hardwareId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.reports) {
          const decrypted = data.reports.map((r: any) => {
            try {
              const bytes = CryptoJS.AES.decrypt(r.encrypted_payload, reportsKey);
              const decStr = bytes.toString(CryptoJS.enc.Utf8);
              return { ...r, payload: JSON.parse(decStr) };
            } catch (e) {
              return { ...r, payload: null, error: 'Decryption failed' };
            }
          }).filter((r: any) => r.payload);
          setSavedReports(decrypted);
        }
      }
    } catch (err) {
      console.error('Failed to load reports', err);
    }
  };

  const handleDeleteReport = async (reportId: number) => {
    if (!hardwareId || !backendUrl) return;
    if (!confirm('Are you sure you want to delete this report? This action cannot be undone.')) return;
    
    try {
      const response = await fetch(`${backendUrl}/terminal/reports/${reportId}?hardware_id=${hardwareId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        if (selectedReportId === reportId) setSelectedReportId(null);
        setSavedReports(prev => prev.filter(r => r.id !== reportId));
      } else {
        const errData = await response.json();
        alert(`Failed to delete report: ${errData.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error deleting report: ${err.message}`);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports') {
      loadReports();
    }
  }, [activeTab, hardwareId, backendUrl, reportsKey]);

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
        // Credentials are stored locally only (ZK architecture — not transmitted to server)

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

  // Poll bank accounts session state from server every 6 seconds
  // Poll bank accounts session state from server every 6 seconds (runs even when locked to receive PIN reset signals)
  useEffect(() => {
    if (!hardwareId || !backendUrl || isSetupMode) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let consecutiveFailures = 0;

    const poll = async () => {
      if (visibility === 'hidden') {
        timeoutId = setTimeout(poll, 60000);
        return;
      }

      let success = false;
      try {
        const response = await fetch(`${backendUrl}/verify-terminal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hardware_id: hardwareId })
        });
        if (response.ok) {
          success = true;
          consecutiveFailures = 0;
          const data = await response.json();
          if (data.app_config) {
            setAppConfig(data.app_config);
          }
          if (data.sync_health_summary) {
            setSyncHealthSummary(data.sync_health_summary);
          }
          if (data.operation_mode) {
            setOperationMode(data.operation_mode);
          }
          if (data.active_terminals_count !== undefined) {
            setActiveTerminalsCount(data.active_terminals_count);
          }
          const accounts = data.tenant?.bank_accounts || [];
          setBankAccounts(accounts);

          if (data.credits_exhausted !== undefined) {
            setCreditsExhausted(data.credits_exhausted);
          }
          if (data.subscription_expired !== undefined) {
            setSubscriptionExpired(data.subscription_expired);
          }
          if (data.license_expires_at !== undefined) {
            setLicenseExpiresAt(data.license_expires_at);
          }
          if (data.expiry_warning_days !== undefined) {
            setExpiryWarningDays(data.expiry_warning_days);
          }
          if (data.license_expires_at && data.expiry_warning_days) {
            const expires = new Date(data.license_expires_at).getTime();
            const warningMs = data.expiry_warning_days * 24 * 60 * 60 * 1000;
            const diff = expires - Date.now();
            if (diff > 0 && diff <= warningMs) {
              setShowExpiryWarning(true);
            } else {
              setShowExpiryWarning(false);
            }
          } else {
            setShowExpiryWarning(false);
          }
          if (data.terminal_id !== undefined) {
            setTerminalId(data.terminal_id);
          }

          // Auto-heal session holding state from database
          if (data.terminal_id) {
            const heldAccount = accounts.find((a: any) => a.session_holder_terminal_id === data.terminal_id);
            if (heldAccount) {
              if (sessionStatus === 'idle') {
                setSessionStatus('holder');
                setSessionHolderAccountId(heldAccount.id.toString());
              }
            } else {
              if (sessionStatus === 'holder') {
                setSessionStatus('idle');
                setSessionHolderAccountId(null);
              }
            }
          }

          // Sync local PIN with server-set/reset lock PIN
          if (data.terminal_pin !== undefined) {
            const serverPin = data.terminal_pin ? String(data.terminal_pin).trim() : '';
            const localPin = localStorage.getItem('viri_terminal_pin') || '';
            if (serverPin !== localPin) {
              if (serverPin) {
                setPin(serverPin);
                localStorage.setItem('viri_terminal_pin', serverPin);
              } else {
                setPin('');
                localStorage.removeItem('viri_terminal_pin');
                setIsLocked(false);
              }
            }
          }
        }
      } catch (e) {
        console.error("Session status poll failed:", e);
      }

      if (!success) {
        consecutiveFailures++;
      }

      // Calculate next dynamic delay based on idle state & failures
      const baseInterval = appConfig.session_status_poll_interval * 1000;
      const idleMultiplier = isUserDeepIdle ? 5 : (isUserIdle ? 2.5 : 1);
      const backoffMultiplier = Math.pow(2, Math.min(consecutiveFailures, 4));

      const nextDelay = Math.min(
        baseInterval * idleMultiplier * backoffMultiplier,
        60000
      );

      timeoutId = setTimeout(poll, nextDelay);
    };

    poll();

    return () => clearTimeout(timeoutId);
  }, [hardwareId, backendUrl, isSetupMode, appConfig.session_status_poll_interval, isUserIdle, isUserDeepIdle, sessionStatus, visibility]);

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

  // Auto-center selected ledger card in carousel when it changes
  useEffect(() => {
    if (activeTab === 'ledger' && selectedLedgerAccountId && carouselRef.current) {
      const timer = setTimeout(() => {
        const selectedEl = carouselRef.current?.querySelector(
          `[data-ledger-card-id="${selectedLedgerAccountId}"]`
        );
        if (selectedEl) {
          selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [selectedLedgerAccountId, activeTab]);

  const activePortRef = useRef<chrome.runtime.Port | null>(null);
  const [initLoading, setInitLoading] = useState(false);
  const [operationMode, setOperationMode] = useState<string>('Single Terminal');
  const [activeTerminalsCount, setActiveTerminalsCount] = useState<number>(1);
  const [syncHealthSummary, setSyncHealthSummary] = useState<{
    confidence_score: number;
    efficiency_score: number;
    status: string;
    failures_24h: number;
    avg_latency_ms: number;
    total_requests: number;
    total_fetches: number;
    backlog: number;
  }>({
    confidence_score: 100,
    efficiency_score: 100,
    status: 'excellent',
    failures_24h: 0,
    avg_latency_ms: 0,
    total_requests: 0,
    total_fetches: 0,
    backlog: 0,
  });
  const [result, setResult] = useState<{
    status: string;
    reference: string;
    amount: string;
    timestamp: string;
    transaction?: LedgerTransaction;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<string[]>([]);
  const addLog = (rawMsg: string) => {
    let msg = rawMsg;
    // Mask sensitive credentials
    try {
      const storedCreds = localStorage.getItem('viri_accounts_creds');
      if (storedCreds) {
        const credsObj = JSON.parse(storedCreds) as Record<string, { username?: string; password?: string; totpSeed?: string }>;
        Object.values(credsObj).forEach(creds => {
          if (creds.username && creds.username.trim() !== '') {
            msg = msg.split(creds.username).join('*'.repeat(creds.username.length));
          }
          if (creds.password && creds.password.trim() !== '') {
            msg = msg.split(creds.password).join('*'.repeat(creds.password.length));
          }
          if (creds.totpSeed && creds.totpSeed.trim() !== '') {
            msg = msg.split(creds.totpSeed).join('*'.repeat(creds.totpSeed.length));
          }
        });
      }
    } catch (e) { }

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

  useEffect(() => {
    const handleVisibility = () => {
      setVisibility(document.visibilityState);
      if (document.visibilityState === 'hidden') {
        if (sessionStatus === 'holder' && sessionHolderAccountId) {
          addLog(`> [Session] Tab backgrounded. Proactively releasing session lock for account ID ${sessionHolderAccountId}...`);
          fetch(`${backendUrl}/terminal/session/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hardware_id: hardwareId,
              bank_account_id: parseInt(sessionHolderAccountId)
            })
          }).catch(() => {});
          setSessionStatus('idle');
          setSessionHolderAccountId(null);
        }
      } else if (document.visibilityState === 'visible') {
        if (checkPendingRequestsRef.current) {
          checkPendingRequestsRef.current();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [sessionStatus, sessionHolderAccountId, hardwareId, backendUrl]);

  // ---------------------------------------------------------------------------
  // Zero-Knowledge Credential Sync (background, no admin terminal interaction)
  // ---------------------------------------------------------------------------
  const [credSyncStatus, setCredSyncStatus] = useState<
    'idle' | 'exporting' | 'export_done' | 'importing' | 'import_done' | 'error'
  >('idle');
  const [credSyncMsg, setCredSyncMsg] = useState<string | null>(null);
  const credSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCredSyncMsg = (status: typeof credSyncStatus, msg: string, autoDismissMs = 8000) => {
    setCredSyncStatus(status);
    setCredSyncMsg(msg);
    if (credSyncTimerRef.current) clearTimeout(credSyncTimerRef.current);
    credSyncTimerRef.current = setTimeout(() => {
      setCredSyncStatus('idle');
      setCredSyncMsg(null);
    }, autoDismissMs);
  };

  // Standalone/On-demand Sync Poll (Runs only when settings panel is open)
  useEffect(() => {
    if (!hardwareId || !backendUrl || isSetupMode || !showSettings) return;

    const poll = async () => {
      if (credSyncStatus === 'exporting' || importStatus === 'connecting') return;
      try {
        const res = await fetch(`${backendUrl}/terminal/credential-sync/pending?hardware_id=${hardwareId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.sync_id) return;

        if (data.action === 'export') {
          setCredSyncStatus('exporting');
          setCredSyncMsg('🔐 Encrypting credentials for sync...');
          const passphrase = generateSyncPassphrase();
          const pkg = await encryptCredentialsForSync(passphrase, accountsCreds);
          const uploadRes = await fetch(`${backendUrl}/terminal/credential-sync/${data.sync_id}/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hardware_id: hardwareId, ...pkg })
          });
          if (!uploadRes.ok) throw new Error('Upload failed');
          showCredSyncMsg('export_done', '✅ Credentials encrypted and uploaded successfully!', 8000);
        }

        if (data.action === 'import') {
          if (importSyncId !== data.sync_id) {
            setImportPending(true);
            setImportSyncId(data.sync_id);
            setImportCountdown(300);
            setImportStatus('idle');
          }
        }
      } catch (e: any) {
        showCredSyncMsg('error', `❌ Sync check failed: ${e.message}`, 8000);
      }
    };

    poll();
    const intervalId = setInterval(poll, 5000);
    return () => clearInterval(intervalId);
  }, [hardwareId, backendUrl, isSetupMode, showSettings, credSyncStatus, importStatus, accountsCreds, importSyncId]);

  // Countdown timer for pending imports
  useEffect(() => {
    if (!importPending || importCountdown <= 0) {
      if (importCountdown <= 0) {
        setImportPending(false);
        setImportSyncId(null);
      }
      return;
    }
    const timer = setInterval(() => {
      setImportCountdown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [importPending, importCountdown]);

  const handleImportCredentials = async () => {
    if (!importSyncId) return;
    setImportStatus('connecting');
    
    const sseUrl = `${backendUrl}/terminal/credential-sync/sse?hardware_id=${hardwareId}`;
    const sse = new EventSource(sseUrl);

    sse.addEventListener('import_ready', async (e: any) => {
      try {
        const payload = JSON.parse(e.data);
        const decrypted = await decryptCredentialsFromSync(payload);
        setAccountsCreds(decrypted);
        localStorage.setItem('viri_accounts_creds', JSON.stringify(decrypted));

        const confirmRes = await fetch(`${backendUrl}/terminal/credential-sync/${payload.sync_id}/confirm-import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hardware_id: hardwareId })
        });
        if (!confirmRes.ok) throw new Error('Confirmation failed on server');

        setImportStatus('done');
        setImportPending(false);
        setImportSyncId(null);
        showCredSyncMsg('import_done', '✅ Credentials imported successfully!', 8000);
      } catch (err: any) {
        setImportStatus('error');
        showCredSyncMsg('error', `❌ Decryption or confirmation failed: ${err.message}`, 12000);
      } finally {
        sse.close();
      }
    });

    sse.addEventListener('not_ready', (e: any) => {
      setImportStatus('error');
      try {
        const d = JSON.parse(e.data);
        showCredSyncMsg('error', `❌ Sync not ready: ${d.message}`, 8000);
      } catch {
        showCredSyncMsg('error', '❌ Sync data not ready. Please try again.', 8000);
      }
      sse.close();
    });

    sse.onerror = () => {
      setImportStatus('error');
      showCredSyncMsg('error', '❌ Connection error during import.', 8000);
      sse.close();
    };
  };

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
        if (data.app_config) {
          setAppConfig(data.app_config);
        }
        if (data.sync_health_summary) {
          setSyncHealthSummary(data.sync_health_summary);
        }
        if (data.operation_mode) {
          setOperationMode(data.operation_mode);
        }
        if (data.active_terminals_count !== undefined) {
          setActiveTerminalsCount(data.active_terminals_count);
        }
        const accounts = data.tenant?.bank_accounts || [];
        setBankAccounts(accounts);

        if (data.tenant?.name) setTenantName(data.tenant.name);
        if (data.tenant?.tier) setSubscriptionTier(data.tenant.tier);
        if (data.tenant?.lock_timeout) setLockTimeout(data.tenant.lock_timeout);
        if (data.tenant?.extension_id && data.tenant.extension_id !== 'viri_default_extension_id') {
          setExtensionId(data.tenant.extension_id);
          localStorage.setItem('viri_extension_id', data.tenant.extension_id);
        }
        if (data.terminal_name) setTerminalName(data.terminal_name);
        setSettingsPin(data.settings_pin || null);

        // Sync local PIN with server-set/reset lock PIN
        if (data.terminal_pin !== undefined) {
          const serverPin = data.terminal_pin ? String(data.terminal_pin).trim() : '';
          const localPin = localStorage.getItem('viri_terminal_pin') || '';
          if (serverPin !== localPin) {
            if (serverPin) {
              setPin(serverPin);
              localStorage.setItem('viri_terminal_pin', serverPin);
            } else {
              setPin('');
              localStorage.removeItem('viri_terminal_pin');
              setIsLocked(false);
            }
          }
        }
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
        if (data.subscription_expired !== undefined) {
          setSubscriptionExpired(data.subscription_expired);
        }
        if (data.license_expires_at !== undefined) {
          setLicenseExpiresAt(data.license_expires_at);
        }
        if (data.expiry_warning_days !== undefined) {
          setExpiryWarningDays(data.expiry_warning_days);
        }
        if (data.license_expires_at && data.expiry_warning_days) {
          const expires = new Date(data.license_expires_at).getTime();
          const warningMs = data.expiry_warning_days * 24 * 60 * 60 * 1000;
          const diff = expires - Date.now();
          if (diff > 0 && diff <= warningMs) {
            setShowExpiryWarning(true);
          } else {
            setShowExpiryWarning(false);
          }
        } else {
          setShowExpiryWarning(false);
        }
        if (data.should_upload_logs !== undefined) {
          setShouldUploadLogs(data.should_upload_logs);
        }

        // Credentials are stored locally only (ZK architecture — server no longer holds credentials)

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
        // We do not clear terminal credentials immediately on 403 or 404 to protect local credentials
        // from being wiped due to transient network issues, reboots, or temporary server status codes.
        console.error(`Verification server returned non-ok status during loading: ${response.status}`);
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

  const handleGenerateStatement = async (e: any) => {
    e.preventDefault();
    if (!stmtAccountId || !stmtFromDate || !stmtToDate) {
      setStmtError('Please fill all fields');
      return;
    }
    setStmtError('');
    setStmtLoading(true);
    setStmtTransactions(null);

    const account = bankAccounts.find(a => a.id.toString() === stmtAccountId);
    if (!account) {
      setStmtError('Account not found');
      setStmtLoading(false);
      return;
    }
    
    try {
      // @ts-ignore
      if (typeof window.chrome === 'undefined' || !window.chrome.runtime || !window.chrome.runtime.connect) {
        throw new Error('Viri Chrome Extension is not installed or accessible in this context. Statements generation requires the extension to be running on this browser.');
      }
      
      const extId = extensionId || localStorage.getItem('viri_extension_id') || 'hpbbckjchjjkkicjebifimfijijehclh';
      // @ts-ignore
      const extPort = chrome.runtime.connect(extId, { name: "viri-statements" });
      
      extPort.postMessage({
        action: 'FETCH_STATEMENT_RANGE',
        payload: {
          accountId: account.account_number,
          fromDate: stmtFromDate,
          toDate: stmtToDate,
          bmlProfileType: account.bml_profile_type || '0',
          hardwareId: hardwareId,
          backendUrl: backendUrl
        }
      });
      
      extPort.onMessage.addListener((msg: any) => {
        if (msg.type === 'statement_success') {
          setStmtTransactions(msg.transactions || []);
          setStmtLoading(false);
          extPort.disconnect();
        } else if (msg.type === 'statement_error') {
          setStmtError(msg.error || 'Failed to fetch statement');
          setStmtLoading(false);
          extPort.disconnect();
        }
      });
      
      setTimeout(() => {
        setStmtLoading(prev => {
          if (prev) {
            setStmtError('Request timed out. Please check extension connection.');
            extPort.disconnect();
          }
          return false;
        });
      }, 45000);
      
    } catch (err: any) {
      setStmtError(err.message || 'Failed to communicate with extension');
      setStmtLoading(false);
    }
  };

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
      if (data.extension_id && data.extension_id !== 'viri_default_extension_id') {
        setExtensionId(data.extension_id);
        localStorage.setItem('viri_extension_id', data.extension_id);
      }
      if (data.terminal_name) setTerminalName(data.terminal_name);

      // Credentials are stored locally only (ZK architecture — server no longer holds credentials)

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
    if (!shouldUploadLogs) return;
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


  // Periodic Activity Heartbeat reporter (every 10 seconds, pause when hidden)
  useEffect(() => {
    if (!hardwareId || !backendUrl || isSetupMode) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const reportActivity = async () => {
      if (visibility === 'hidden') {
        timeoutId = setTimeout(reportActivity, 10000);
        return;
      }
      try {
        await fetch(`${backendUrl}/terminal/session/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hardware_id: hardwareId,
            bank_account_id: selectedAccountId ? parseInt(selectedAccountId) : null,
          })
        });
      } catch (err) {
        console.error("Activity report failed:", err);
      }
      timeoutId = setTimeout(reportActivity, 10000);
    };

    reportActivity();

    return () => clearTimeout(timeoutId);
  }, [hardwareId, backendUrl, isSetupMode, selectedAccountId, visibility]);

  // Keep-alive bank session heartbeat loop (every 15s, pause when hidden)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (sessionStatus === 'holder' && hardwareId && backendUrl && sessionHolderAccountId) {
      interval = setInterval(async () => {
        if (visibility === 'hidden') return;
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
            const heldBankAcc = bankAccounts.find(a => a.id.toString() === sessionHolderAccountId);
            const isApi = heldBankAcc?.bank_name === 'BML' && appConfig.bml_login_procedure === 'api';
            if (!isApi) {
              chrome.runtime.sendMessage(extensionId, { action: 'PING_BANK' }).catch(() => { });
            }
          }
        } catch (e) {
          console.error("PWA Heartbeat failed:", e);
        }
      }, 15000);
    }
    return () => clearInterval(interval);
  }, [sessionStatus, hardwareId, backendUrl, sessionHolderAccountId, extensionId, visibility]);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.connect) {
      try {
        const port = chrome.runtime.connect(extensionId, { name: "viri-verify" });
        port.postMessage({
          action: 'UPDATE_CONFIG',
          payload: {
            bmlLoginProcedure: appConfig.bml_login_procedure || 'legacy'
          }
        });
        port.disconnect();
      } catch (err) {
        console.error("Failed to push config to extension", err);
      }
    }
  }, [appConfig.bml_login_procedure, extensionId]);

  // Pending queue checking loop (Holder mode)
  useEffect(() => {
    if (sessionStatus !== 'holder' || !hardwareId || !backendUrl || !sessionHolderAccountId) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const checkPendingRequests = async () => {
      if (visibility === 'hidden') {
        timeoutId = setTimeout(checkPendingRequests, 5000);
        return;
      }
      if (delegatedFulfilling) {
        timeoutId = setTimeout(checkPendingRequests, 1000);
        return;
      }

      try {
        const res = await fetch(`${backendUrl}/terminal/session/pending`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hardware_id: hardwareId,
            bank_account_id: parseInt(sessionHolderAccountId)
          })
        });
        if (res.ok) {
          const resData = await res.json();
          const requestsList = Array.isArray(resData) ? resData : (resData && Array.isArray(resData.requests) ? resData.requests : []);
          if (requestsList.length > 0) {
            for (const req of requestsList) {
              setDelegatedFulfilling(true);
              const startTime = Date.now();
              try {
                addLog(`> [Session] Fulfilling delegated request ID ${req.id} (${req.request_type}) in background...`);

                const activeCreds = accountsCreds[sessionHolderAccountId];
                if (!activeCreds) {
                  throw new Error("No saved bank account credentials for session holder.");
                }

                if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
                  throw new Error("Local extension not connected/detected.");
                }

                const port = chrome.runtime.connect(extensionId, { name: "viri-verify" });

                const responseData = await new Promise<any>((resolve, reject) => {
                  const disconnectHandler = () => reject(new Error("Extension port disconnected unexpectedly."));
                  port.onDisconnect.addListener(disconnectHandler);

                  port.onMessage.addListener((msg) => {
                    if (msg.type === 'log') {
                      addLog(msg.message);
                    } else if (msg.type === 'success') {
                      port.onDisconnect.removeListener(disconnectHandler);
                      addLog(`> [Session] Raw history size: ${msg.raw_history ? msg.raw_history.length : 0} items.`);
                      resolve(msg.payload || msg);
                    } else if (msg.type === 'error') {
                      port.onDisconnect.removeListener(disconnectHandler);
                      reject(new Error(msg.error));
                    }
                  });

                  port.postMessage({
                    action: 'FULFILL_DELEGATED_REQUEST',
                    payload: {
                      req,
                      credentials: {
                        username: activeCreds.username,
                        password: activeCreds.password,
                        totpSeed: activeCreds.totpSeed
                      },
                      bmlInternalId: bankAccounts.find(a => a.id.toString() === sessionHolderAccountId)?.bml_internal_id,
                      bankName: bankAccounts.find(a => a.id.toString() === sessionHolderAccountId)?.bank_name || 'BML',
                      debugLogMibHtml: appConfig.debug_log_mib_html
                    }
                  });
                });

                port.disconnect();

                // Generate fingerprint
                const bankName = bankAccounts.find(a => a.id.toString() === sessionHolderAccountId)?.bank_name || 'BML';
                const currency = bankAccounts.find(a => a.id.toString() === sessionHolderAccountId)?.currency || 'MVR';
                const fingerprint = await computeStatementFingerprint(
                  parseInt(sessionHolderAccountId),
                  bankName,
                  currency,
                  responseData.transactions || []
                );

                addLog(`> [Session] Computed statement fingerprint: ${fingerprint}. Performing pre-check...`);
                const checkRes = await fetch(`${backendUrl}/terminal/account/fingerprint-check`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    hardware_id: hardwareId,
                    account_id: parseInt(sessionHolderAccountId),
                    fingerprint: fingerprint,
                  })
                });

                let txsToUpload = responseData.transactions || [];
                if (checkRes.ok) {
                  const checkData = await checkRes.json();
                  if (checkData.status === 'no_change') {
                    addLog(`> [Session] Fingerprint match (no change). Short-circuiting upload.`);
                    txsToUpload = [];
                  } else {
                    addLog(`> [Session] Fingerprint mismatch. Uploading full transactions list.`);
                  }
                }

                const durationMs = Date.now() - startTime;

                const fulfillRes = await fetch(`${backendUrl}/terminal/ledger-cache/push`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    hardware_id: hardwareId,
                    bank_account_id: parseInt(sessionHolderAccountId),
                    balance: responseData.balance || '0.00',
                    transactions: txsToUpload,
                    request_id: req.id,
                    fingerprint: fingerprint,
                    duration_ms: durationMs,
                    status: 'fulfilled'
                  })
                });
                if (!fulfillRes.ok) throw new Error("Fulfillment upload failed");

                addLog(`> [Session] Fulfilling delegated request ID ${req.id} succeeded.`);

                // Proactively update local cache too!
                setLedgerCache(prev => ({
                  ...prev,
                  [sessionHolderAccountId]: {
                    balance: responseData.balance || '0.00',
                    lastUpdated: new Date().toLocaleTimeString(),
                    lastUpdatedTimestamp: Date.now(),
                    transactions: responseData.transactions || [],
                    isFromServerCache: true
                  }
                }));
              } catch (err: any) {
                console.error("Failed to fulfill delegated request:", err);
                addLog(`> [Session] Fulfilling delegated request ID ${req.id} failed: ${err.message}`);

                const durationMs = Date.now() - startTime;

                await fetch(`${backendUrl}/terminal/ledger-cache/push`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    hardware_id: hardwareId,
                    bank_account_id: parseInt(sessionHolderAccountId),
                    balance: '0.00',
                    transactions: [],
                    request_id: req.id,
                    status: 'failed',
                    error_message: err.message,
                    duration_ms: durationMs
                  })
                }).catch(() => { });
              } finally {
                setDelegatedFulfilling(false);
              }
            }
          }
        }
      } catch (e) {
        console.error("Error polling delegated requests:", e);
      }

      const holderInterval = (appConfig.poll_interval_holder || 1) * 1000;
      timeoutId = setTimeout(checkPendingRequests, holderInterval);
    };

    checkPendingRequestsRef.current = checkPendingRequests;
    timeoutId = setTimeout(checkPendingRequests, (appConfig.poll_interval_holder || 1) * 1000);

    return () => {
      clearTimeout(timeoutId);
      checkPendingRequestsRef.current = undefined;
    };
  }, [sessionStatus, hardwareId, backendUrl, sessionHolderAccountId, accountsCreds, delegatedFulfilling, extensionId, bankAccounts, appConfig.poll_interval_holder, visibility]);

  useEffect(() => {
    if (activeTab === 'verify' && selectedAccountId && verifyAccountRefs.current[selectedAccountId]) {
      verifyAccountRefs.current[selectedAccountId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [selectedAccountId, activeTab]);

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
        text: 'Another cashier counter has active session. Routing request...',
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

      // Wait for verify_request_completed event via custom event instead of polling!
      const resultData = await new Promise<{ status: string, result_json?: any, error_message?: string }>((resolve) => {
        let resolved = false;

        const eventHandler = (e: any) => {
          const detail = e.detail;
          cleanup({ status: detail.status, result_json: detail.result_json, error_message: detail.error });
        };

        const cleanup = (res: { status: string, result_json?: any, error_message?: string }) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          window.removeEventListener(`sync_request_${request_id}`, eventHandler);
          resolve(res);
        };

        window.addEventListener(`sync_request_${request_id}`, eventHandler);

        // Fallback timeout limit of 12 seconds
        const timeoutId = setTimeout(async () => {
          addLog("> [Session] SSE signal wait timed out. Checking server once before failure.");
          try {
            const pollRes = await fetch(`${backendUrl}/terminal/session/result/${request_id}?hardware_id=${hardwareId}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              cleanup({ status: pollData.status, result_json: pollData.result_json, error_message: pollData.error_message });
              return;
            }
          } catch (err) { }
          cleanup({ status: 'timeout' });
        }, 12000);
      });

      if (!isVerifyingRef.current) {
        addLog("> [Session] Delegation cancelled by user.");
        return;
      }

      if (resultData.status === 'fulfilled') {
        const response = resultData.result_json;
        addLog(`> [Session] Delegation fulfilled. Raw result_json: ${JSON.stringify(response)}`);
        setProgress({
          stage: 'success',
          text: requestType === 'ledger' ? '✅ Ledger Synced!' : '✅ Transfer Verified!',
          percent: 100,
          isIndeterminate: false
        });
        setTimeout(async () => {
          setLoading(false);
          setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
          setSyncTimeElapsed(syncStartTimeRef.current ? Date.now() - syncStartTimeRef.current : 0);

          const resData = response ? (response.data || null) : null;
          setResult(resData);

          if (response && response.internal_id) {
            const accToUpdate = bankAccounts.find(a => a.id.toString() === accountId);
            if (accToUpdate && accToUpdate.bml_internal_id !== response.internal_id) {
              try {
                await fetch(`${backendUrl}/terminal/bank-accounts/${accountId}/internal-id`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ bml_internal_id: response.internal_id })
                });
                console.log("Saved BML Internal ID successfully");
              } catch (e) {
                console.error("Failed to save internal ID", e);
              }
            }
          }
          const acc3 = bankAccounts.find(a => a.id.toString() === accountId);
          const labelVal = acc3 ? `${acc3.bank_name} ${acc3.account_number}` : '';

          const getTxKey = (tx: any) => {
            return `${tx.date}-${tx.amount}-${tx.details}-${tx.runningBalance || ''}`;
          };

          const newTxs = response ? (response.transactions || []) : [];
          addLog(`> [Session] Extracted transactions count: ${newTxs.length}`);
          const currentKeys = new Set(
            (requestType === 'ledger'
              ? ledgerCache[accountId]?.transactions
              : recentTxCache[accountId]?.transactions
            )?.map((tx) => getTxKey(tx)) || []
          );

          const incomingKeys = newTxs.map((tx: any) => getTxKey(tx));
          const newlyAddedKeys = incomingKeys.filter((k: string) => !currentKeys.has(k));

          if (newlyAddedKeys.length > 0) {
            setNewTransactionKeys(prev => {
              const next = new Set(prev);
              newlyAddedKeys.forEach((k: string) => next.add(k));
              return next;
            });
          }

          // Update recent transactions cache (only keeping the 3 most recent)
          setRecentTxCache(prev => ({
            ...prev,
            [accountId]: {
              transactions: newTxs.slice(0, 3),
              label: labelVal,
              lastUpdated: new Date().toLocaleTimeString(),
              timestamp: Date.now()
            }
          }));

          // Fetch latest from server so we have hashed transactions (important for checkboxes)
          if (response.balance && requestType === 'ledger') {
            try {
              const res = await fetch(`${backendUrl}/terminal/ledger-cache/${accountId}?hardware_id=${hardwareId}`);
              if (res.ok) {
                const serverData = await res.json();
                setLedgerCache(prev => ({
                  ...prev,
                  [accountId]: serverData
                }));
              }
            } catch (e) {
              console.error("Failed to fetch updated ledger cache", e);
            }
          } else if (response.balance) {
            setLedgerCache(prev => {
              const prevAcc = prev[accountId] || {};
              return {
                ...prev,
                [accountId]: {
                  ...prevAcc,
                  balance: response.balance,
                  lastUpdated: new Date().toLocaleTimeString(),
                  lastUpdatedTimestamp: Date.now(),
                  transactions: prevAcc.transactions || []
                }
              };
            });
          }
          if (requestType === 'search' && response.data) {
            setAmount('');
          }
          releaseLock();
          isVerifyingRef.current = false;
          uploadLogsToServer();
        }, 1500);
        return;
      } else if (resultData.status === 'failed') {
        throw new Error(resultData.error_message || "Holder failed to fetch data.");
      } else {
        addLog("> [Session] Active holder did not respond. Releasing current holder and claiming session lock...");
        const claimRes = await fetch(`${backendUrl}/terminal/session/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hardware_id: hardwareId,
            bank_account_id: parseInt(accountId),
            force: true
          })
        });
        if (claimRes.ok) {
          addLog("> [Session] Reclaimed session successfully. Re-running transaction sync locally...");
          setSessionStatus('holder');
          setSessionHolderAccountId(accountId);
          setTimeout(() => {
            handleVerify(requestType === 'ledger' || requestType === 'history' ? 'history' : 'search');
          }, 500);
          return;
        } else {
          throw new Error("Request timed out. Active session holder did not respond, and reclamation failed.");
        }
      }
    } catch (err: any) {
      setError(`Delegated Fetch Failed: ${err.message}`);
      setLoading(false);
      setSyncTimeElapsed(syncStartTimeRef.current ? Date.now() - syncStartTimeRef.current : 0);
      isVerifyingRef.current = false;
      setProgress({ stage: 'error', text: 'Fetch failed', percent: 100, isIndeterminate: false });
      uploadLogsToServer();
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
    setSyncTimeElapsed(null);
    syncStartTimeRef.current = Date.now();
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
        setErrorAndLog(`License check failed: ${errData.error || response.statusText} (${response.status})`);

        if (response.status === 403 || response.status === 404) {
          clearTerminalData();
        }

        setLoading(false);
        isVerifyingRef.current = false;
        setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
        setTimeLeft(null);
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (data.subscription_expired) {
        setSubscriptionExpired(true);
        setErrorAndLog("Subscription Expired - contact your admin!");
        setLoading(false);
        isVerifyingRef.current = false;
        setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
        setTimeLeft(null);
        return;
      }
      if (data.should_upload_logs !== undefined) {
        setShouldUploadLogs(!!data.should_upload_logs);
      }
    } catch (err: any) {
      setErrorAndLog(`Backend Connection Failed: Could not connect to licensing server at ${backendUrl}. Check your network or settings.`);
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
          const heldBy = lockData.held_by ? `cashier counter ${lockData.held_by.substring(0, 8)}...` : "another cashier counter";
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
              text: 'Another cashier counter is currently using this account. You are next in line...',
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
      setErrorAndLog("Bank session busy: Held by another cashier counter. Please try again later.");
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
    }, appConfig.active_session_heartbeat_interval * 1000);

    // Step 3: Send message to the local extension using a persistent port
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
      setErrorAndLog("Browser extension API not detected. Make sure you are using Chrome and the extension is loaded.");
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
      setErrorAndLog(`Extension connection failed: ${e.message}. Is the Extension ID correct?`);
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
        setErrorAndLog(`Extension connection failed: ${chrome.runtime.lastError.message}`);
      } else {
        setErrorAndLog("Connection to background robot lost unexpectedly. Is the extension installed and enabled?");
      }
      setProgress({ stage: 'error', text: 'Connection lost', percent: 100, isIndeterminate: false });
      setTimeLeft(null);
      setLoading(false);
      setSyncTimeElapsed(syncStartTimeRef.current ? Date.now() - syncStartTimeRef.current : 0);
      activePortRef.current = null;
      releaseLock();
      isVerifyingRef.current = false;
      uploadLogsToServer();
    });

    port.onMessage.addListener((response: any) => {
      if (response.type === 'log') {
        addLog(response.message);
        const parsed = parseLogForProgress(response.message);
        if (parsed) {
          setProgress(parsed);
        }
      } else if (response.type === 'success') {
        addLog("> [Session] Bank session authenticated successfully.");
        setProgress({
          stage: 'success',
          text: mode === 'history' ? '✅ History Fetched!' : '✅ Transfer Verified!',
          percent: 100,
          isIndeterminate: false
        });
        setTimeLeft(null);
        setTimeout(async () => {
          setLoading(false);
          setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
          setSyncTimeElapsed(syncStartTimeRef.current ? Date.now() - syncStartTimeRef.current : 0);
          setResult(response.data || null);

          // Save internal_id if returned
          if (response.internal_id) {
            const accToUpdate = bankAccounts.find(a => a.id.toString() === selectedAccountId);
            if (accToUpdate && accToUpdate.bml_internal_id !== response.internal_id) {
              try {
                await fetch(`${backendUrl}/terminal/bank-accounts/${selectedAccountId}/internal-id`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ bml_internal_id: response.internal_id })
                });
                console.log("Saved BML Internal ID successfully");
              } catch (e) {
                console.error("Failed to save internal ID", e);
              }
            }
          }
          const acc1 = bankAccounts.find(a => a.id.toString() === selectedAccountId);
          const labelVal = acc1 ? `${acc1.bank_name} ${acc1.account_number}` : '';

          const getTxKey = (tx: any) => {
            return `${tx.date}-${tx.amount}-${tx.details}-${tx.runningBalance || ''}`;
          };

          const newTxs = response.transactions || [];
          const currentKeys = new Set(
            recentTxCache[selectedAccountId]?.transactions?.map((tx) => getTxKey(tx)) || []
          );
          const incomingKeys = newTxs.map((tx: any) => getTxKey(tx));
          const newlyAddedKeys = incomingKeys.filter((k: string) => !currentKeys.has(k));

          if (newlyAddedKeys.length > 0) {
            setNewTransactionKeys(prev => {
              const next = new Set(prev);
              newlyAddedKeys.forEach((k: string) => next.add(k));
              return next;
            });
          }

          // Update recent transactions cache (only keeping the 3 most recent)
          setRecentTxCache(prev => ({
            ...prev,
            [selectedAccountId]: {
              transactions: newTxs.slice(0, 3),
              label: labelVal,
              lastUpdated: new Date().toLocaleTimeString(),
              timestamp: Date.now()
            }
          }));

          // Update ledger cache (preserving existing ledger transactions!)
          if (response.balance) {
            setLedgerCache(prev => {
              const prevAcc = prev[selectedAccountId] || {};
              return {
                ...prev,
                [selectedAccountId]: {
                  ...prevAcc,
                  balance: response.balance,
                  lastUpdated: new Date().toLocaleTimeString(),
                  lastUpdatedTimestamp: Date.now(),
                  transactions: prevAcc.transactions || []
                }
              };
            });
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
                credentials: activeCreds,
                bmlLoginProcedure: appConfig.bml_login_procedure || 'legacy',
                bmlAuthState: selectedAccount ? selectedAccount.bml_auth_state : null,
                bmlInternalId: selectedAccount ? selectedAccount.bml_internal_id : null
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
              body: JSON.stringify({ 
                hardware_id: hardwareId, 
                bank_account_id: parseInt(selectedAccountId), 
                credentials_hash: hash, 
                pwa_logs: logsRef.current,
                extension_version: extensionVersion || LATEST_EXTENSION_VERSION
              })
            });
            fetchAccounts();
          } catch (e) {
            console.error("Failed to reset failures:", e);
          }
        }, 1500); // 1.5s reinforcement checkmark flash
      } else if (response.type === 'error') {
        const isSearchNotFound = /No recent credit transaction found/i.test(response.error || '');
        setProgress({
          stage: 'error',
          text: isSearchNotFound ? 'Search not found' : (mode === 'history' ? 'Fetch failed' : 'Verification failed'),
          percent: 100,
          isIndeterminate: false
        });
        setTimeLeft(null);
        setLoading(false);
        setSyncTimeElapsed(syncStartTimeRef.current ? Date.now() - syncStartTimeRef.current : 0);
        setError(isSearchNotFound ? "Search not found" : (response.error || (mode === 'history' ? "Failed to fetch history." : "Verification failed.")));

        // Track consecutive failures
        const isAuthError = !response.login_success && (response.auth_failed || (progress.stage === 'init' || progress.stage === 'auth' ||
          /login|credential|auth|password|seed|incorrect|invalid/i.test(response.error || '')));
        if (isAuthError) {
          addLog("> [System] Invalid bank credentials detected. Incrementing failure count...");
          const currentCreds = accountsCreds[selectedAccountId] || {};
          const activeUsername = currentCreds.username || '';
          computeCredsHash(selectedBankName, activeUsername).then(async (hash) => {
            try {
              await fetch(`${backendUrl}/terminal/bank-accounts/increment-failures`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  hardware_id: hardwareId, 
                  bank_account_id: parseInt(selectedAccountId), 
                  credentials_hash: hash, 
                  pwa_logs: logsRef.current,
                  extension_version: extensionVersion || LATEST_EXTENSION_VERSION
                })
              });
              fetchAccounts();
            } catch (e) {
              console.error("Failed to increment failures:", e);
            }
          });
        } else {
          // Log non-auth errors (HTTP failures, timeouts, etc.) to session activity
          const eventType = isSearchNotFound ? 'search_not_found' : 'fetch_request_failed';
          const eventSummary = isSearchNotFound 
            ? `No recent credit transaction found for ${amount || '0.00'} MVR.` 
            : `${response.error || 'Unknown error'}`;

          fetch(`${backendUrl}/terminal/session/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hardware_id: hardwareId,
              event_type: eventType,
              bank_account_id: parseInt(selectedAccountId),
              event_summary: eventSummary,
              pwa_logs: logsRef.current,
              extension_version: extensionVersion || LATEST_EXTENSION_VERSION
            })
          }).catch(e => console.error("Failed to log session error:", e));
        }
        const acc2 = bankAccounts.find(a => a.id.toString() === selectedAccountId);
        const labelVal = acc2 ? `${acc2.bank_name} ${acc2.account_number}` : '';
        setRecentTxCache(prev => ({
          ...prev,
          [selectedAccountId]: {
            transactions: (response.transactions || []).slice(0, 3),
            label: labelVal,
            lastUpdated: new Date().toLocaleTimeString(),
            timestamp: Date.now()
          }
        }));
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

    const isApiManaged = selectedAccount?.bank_name === 'BML' && appConfig.bml_login_procedure === 'api';

    if (!isApiManaged && (!activeCreds.username || !activeCreds.password)) {
      setError("Credentials missing for this account. Please re-pair the cashier counter or check account settings.");
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
          sessionMode: strategy === 'FETCH_ONLY' ? 'fetch_only' : 'fresh_login',
          amount: mode === 'search' ? parseFloat(amount).toFixed(2) : '0.00',
          bank: selectedBankName,
          accountId: selectedAccountId,
          accountNumber: selectedAccount ? selectedAccount.account_number : '',
          accountName: selectedAccount ? selectedAccount.account_name : '',
          mibProfileType: selectedAccount ? (selectedAccount.mib_profile_type || '0') : '0',
          bmlProfileType: selectedAccount ? (selectedAccount.bml_profile_type || '0') : '0',
          bmlAuthState: selectedAccount ? selectedAccount.bml_auth_state : null,
          bmlInternalId: selectedAccount ? selectedAccount.bml_internal_id : null,
          credentials: activeCreds,
          debugLogMibHtml: appConfig.debug_log_mib_html,
          bmlLoginProcedure: appConfig.bml_login_procedure || 'legacy',
          backendUrl: backendUrl,
          hardwareId: hardwareId
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

  const syncLedgerLocally = async (targetAccountId: string, selectedAccount: any, selectedBankName: string, requestId: number | null) => {
    let claimSuccess = false;
    let strategy = 'CLAIM_AND_LOGIN';

    if (operationMode === 'Single Counter' || operationMode === 'Single Terminal') {
      addLog("> [Session] Single Terminal Mode - skipping session claim.");
    } else {
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
            throw new Error("Active session claimed by another counter. Try again.");
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
    }

    addLog("> [System] Validating cashier counter license...");
    if (subscriptionExpired) {
      setErrorAndLog("Subscription Expired - contact your admin!", targetAccountId);
      addLog("> [System] License validation FAILED: Subscription Expired.");
      setLoading(false);
      isVerifyingRef.current = false;
      setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
      return;
    }
    if (creditsExhausted) {
      setErrorAndLog("Verification credits exhausted - contact your admin!", targetAccountId);
      addLog("> [System] License validation FAILED: Credits Exhausted.");
      setLoading(false);
      isVerifyingRef.current = false;
      setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
      return;
    }
    addLog("> [System] License valid (cached).");

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
      setErrorAndLog("Browser extension API not detected.", targetAccountId);
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
      setErrorAndLog(`Extension connection failed: ${e.message}`, targetAccountId);
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

    const isApiManaged = selectedAccount?.bank_name === 'BML' && appConfig.bml_login_procedure === 'api';

    if (!isApiManaged && (!activeCreds.username || !activeCreds.password)) {
      setError("Credentials missing for this account. Please re-pair the cashier counter or check account settings.");
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
        addLog("> [System] Ledger synced successfully.");
        addLog(`> [System] Raw history size: ${response.raw_history ? response.raw_history.length : 0} items.`);
        if (response.raw_history && response.raw_history.length > 0) {
          addLog(`> [System] Raw history sample: ${JSON.stringify(response.raw_history.slice(0, 1))}`);
        }
        setProgress({
          stage: 'success',
          text: '✅ Ledger Synced Successfully!',
          percent: 100,
          isIndeterminate: false
        });
        setTimeout(async () => {
          setLoading(false);
          setSyncTimeElapsed(syncStartTimeRef.current ? Date.now() - syncStartTimeRef.current : 0);
          setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });

          // Save internal_id if returned
          if (response.internal_id) {
            const accToUpdate = bankAccounts.find(a => a.id.toString() === targetAccountId);
            if (accToUpdate && accToUpdate.bml_internal_id !== response.internal_id) {
              try {
                await fetch(`${backendUrl}/terminal/bank-accounts/${targetAccountId}/internal-id`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ bml_internal_id: response.internal_id })
                });
                console.log("Saved BML Internal ID successfully");
              } catch (e) {
                console.error("Failed to save internal ID", e);
              }
            }
          }
          const getTxKey = (tx: any) => {
            return `${tx.date}-${tx.amount}-${tx.details}-${tx.runningBalance || ''}`;
          };

          const newTxs = response.transactions || [];
          const currentKeys = new Set(
            ledgerCache[targetAccountId]?.transactions?.map((tx) => getTxKey(tx)) || []
          );
          const incomingKeys = newTxs.map((tx: any) => getTxKey(tx));
          const newlyAddedKeys = incomingKeys.filter((k: string) => !currentKeys.has(k));

          if (newlyAddedKeys.length > 0) {
            setNewTransactionKeys(prev => {
              const next = new Set(prev);
              newlyAddedKeys.forEach((k: string) => next.add(k));
              return next;
            });
          }

          // Push the newly scraped data to the server cache (ZK compliance: credentials never sent)
          if (operationMode === 'Single Counter' || operationMode === 'Single Terminal') {
            addLog("> [System] Single Terminal Mode - skipping shared cache push.");
          } else {
            try {
              addLog("> [System] Pushing scraped transactions to Viri shared cache...");
              await fetch(`${backendUrl}/terminal/ledger-cache/push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  hardware_id: hardwareId,
                  bank_account_id: parseInt(targetAccountId),
                  balance: response.balance || 'Not found',
                  transactions: newTxs,
                  request_id: requestId
                })
              });
              addLog("> [System] Shared cache push succeeded.");
            } catch (pushErr: any) {
              console.error("Failed to push cache to server:", pushErr);
              addLog(`> [System] Shared cache push failed: ${pushErr.message}`);
            }
          }

          // Fetch latest from server to get hashed transactions if sharing cache
          if (operationMode !== 'Single Counter' && operationMode !== 'Single Terminal') {
            try {
              const res = await fetch(`${backendUrl}/terminal/ledger-cache/${targetAccountId}?hardware_id=${hardwareId}`);
              if (res.ok) {
                const serverData = await res.json();
                setLedgerCache(prev => ({
                  ...prev,
                  [targetAccountId]: serverData
                }));
              } else {
                throw new Error("Failed to fetch updated ledger cache");
              }
            } catch (e) {
              console.error("Local sync fallback", e);
              // Fallback Update local state ledger cache
              setLedgerCache(prev => ({
                ...prev,
                [targetAccountId]: {
                  balance: response.balance || 'Not found',
                  lastUpdated: new Date().toLocaleTimeString(),
                  lastUpdatedTimestamp: Date.now(),
                  transactions: newTxs,
                  isFromServerCache: true
                }
              }));
            }
          } else {
            // In Single Terminal mode, just use local state directly since we skipped server push
            setLedgerCache(prev => ({
              ...prev,
              [targetAccountId]: {
                balance: response.balance || 'Not found',
                lastUpdated: new Date().toLocaleTimeString(),
                lastUpdatedTimestamp: Date.now(),
                transactions: newTxs,
                isFromServerCache: false
              }
            }));
          }

          // Also update recent transactions cache with the top 3
          const accLabel = selectedAccount ? `${selectedAccount.bank_name} ${selectedAccount.account_number}` : '';
          setRecentTxCache(prev => ({
            ...prev,
            [targetAccountId]: {
              transactions: newTxs.slice(0, 3),
              label: accLabel,
              lastUpdated: new Date().toLocaleTimeString(),
              timestamp: Date.now()
            }
          }));

          try {
            const hash = await computeCredsHash(selectedBankName, activeCreds.username);
            await fetch(`${backendUrl}/terminal/bank-accounts/reset-failures`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                hardware_id: hardwareId, 
                bank_account_id: parseInt(targetAccountId), 
                credentials_hash: hash, 
                pwa_logs: logsRef.current,
                extension_version: extensionVersion || LATEST_EXTENSION_VERSION
              })
            });
            if (sessionStatus === 'claiming' || claimSuccess) {
              port.postMessage({
                action: 'CLAIM_SESSION',
                payload: {
                  accountId: targetAccountId,
                  bankName: selectedBankName,
                  backendUrl: backendUrl,
                  hardwareId: hardwareId,
                  credentials: activeCreds,
                  bmlLoginProcedure: appConfig.bml_login_procedure || 'legacy',
                  bmlAuthState: selectedAccount ? selectedAccount.bml_auth_state : null,
                  bmlInternalId: selectedAccount ? selectedAccount.bml_internal_id : null,
                  debugLogMibHtml: appConfig.debug_log_mib_html
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
        const isSearchNotFound = /No recent credit transaction found/i.test(response.error || '');
        setError(isSearchNotFound ? "Search not found" : (response.error || "An unknown error occurred during sync."));
        setProgress({ 
          stage: 'error', 
          text: isSearchNotFound ? 'Search not found' : 'Sync failed', 
          percent: 100, 
          isIndeterminate: false 
        });
        setSyncTimeElapsed(syncStartTimeRef.current ? Date.now() - syncStartTimeRef.current : 0);
        setTimeLeft(null);
        setLedgerCache(prev => ({
          ...prev,
          [targetAccountId]: {
            ...(prev[targetAccountId] || {}),
            error: isSearchNotFound ? "Search not found" : (response.error || "An unknown error occurred during sync.")
          }
        }));

        // Track consecutive failures
        const isAuthError = !response.login_success && (response.auth_failed || (progress.stage === 'init' || progress.stage === 'auth' ||
          /login|credential|auth|password|seed|incorrect|invalid/i.test(response.error || '')));
        if (isAuthError) {
          const currentCreds = accountsCreds[targetAccountId] || {};
          const activeUsername = currentCreds.username || '';
          computeCredsHash(selectedBankName, activeUsername).then(async (hash) => {
            try {
              await fetch(`${backendUrl}/terminal/bank-accounts/increment-failures`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  hardware_id: hardwareId, 
                  bank_account_id: parseInt(targetAccountId), 
                  credentials_hash: hash, 
                  pwa_logs: logsRef.current,
                  extension_version: extensionVersion || LATEST_EXTENSION_VERSION
                })
              });
              fetchAccounts();
            } catch (e) {
              console.error("Failed to increment failures:", e);
            }
          });
        } else {
          // Log non-auth errors (HTTP failures, timeouts, etc.) to session activity
          const eventType = isSearchNotFound ? 'search_not_found' : 'fetch_request_failed';
          const eventSummary = isSearchNotFound 
            ? `No recent credit transaction found for ledger sync.` 
            : `${response.error || 'Unknown error'}`;

          fetch(`${backendUrl}/terminal/session/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hardware_id: hardwareId,
              event_type: eventType,
              bank_account_id: parseInt(targetAccountId),
              event_summary: eventSummary,
              pwa_logs: logsRef.current,
              extension_version: extensionVersion || LATEST_EXTENSION_VERSION
            })
          }).catch(e => console.error("Failed to log session error:", e));
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
      } else if (response.type === 'session_status') {
        const finalSessionMode = response.hasSession ? 'fetch_only' : 'fresh_login';
        if (!response.hasSession) {
          addLog("> [System] Local session not found. Injecting server tokens...");
        } else {
          addLog("> [System] Valid local session detected. Proceeding...");
        }
        try {
          port.postMessage({
            action: 'VERIFY_TRANSFER',
            payload: {
              mode: 'ledger',
              sessionMode: finalSessionMode,
              amount: '0.00',
              bank: selectedBankName,
              accountId: targetAccountId,
              accountNumber: selectedAccount ? selectedAccount.account_number : '',
              accountName: selectedAccount ? selectedAccount.account_name : '',
              mibProfileType: selectedAccount ? (selectedAccount.mib_profile_type || '0') : '0',
              bmlProfileType: selectedAccount ? (selectedAccount.bml_profile_type || '0') : '0',
              bmlAuthState: selectedAccount ? selectedAccount.bml_auth_state : null,
              bmlInternalId: selectedAccount ? selectedAccount.bml_internal_id : null,
              credentials: activeCreds,
              debugLogMibHtml: appConfig.debug_log_mib_html,
              bmlLoginProcedure: appConfig.bml_login_procedure || 'legacy'
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
      }
    });

    if (operationMode === 'Single Counter' || operationMode === 'Single Terminal') {
      addLog("> [System] Checking extension for active session...");
      try {
        port.postMessage({ action: 'CHECK_SESSION' });
      } catch (msgErr: any) {
        setError(`Failed to check session: ${msgErr.message}`);
        setLoading(false);
        port.disconnect();
        activePortRef.current = null;
        releaseLock();
        isVerifyingRef.current = false;
      }
    } else {
      addLog("> [System] Sending VERIFY_TRANSFER (ledger mode) to extension...");
      try {
        port.postMessage({
          action: 'VERIFY_TRANSFER',
          payload: {
            mode: 'ledger',
            sessionMode: strategy === 'FETCH_ONLY' ? 'fetch_only' : 'fresh_login',
            amount: '0.00',
            bank: selectedBankName,
            accountId: targetAccountId,
            accountNumber: selectedAccount ? selectedAccount.account_number : '',
            accountName: selectedAccount ? selectedAccount.account_name : '',
            mibProfileType: selectedAccount ? (selectedAccount.mib_profile_type || '0') : '0',
            bmlProfileType: selectedAccount ? (selectedAccount.bml_profile_type || '0') : '0',
            bmlAuthState: selectedAccount ? selectedAccount.bml_auth_state : null,
            bmlInternalId: selectedAccount ? selectedAccount.bml_internal_id : null,
            credentials: activeCreds,
            debugLogMibHtml: appConfig.debug_log_mib_html,
            bmlLoginProcedure: appConfig.bml_login_procedure || 'legacy'
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
    }
  };

  const syncLedger = async (targetAccountId: string, forceFullSync: boolean = false) => {
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
    setSyncTimeElapsed(null);
    const sTime = Date.now();
    syncStartTimeRef.current = sTime;
    isVerifyingRef.current = true;

    const isSingleTerminal = operationMode === 'Single Terminal' || operationMode === 'Single Counter';
    let cacheData: any = null;

    if (isSingleTerminal) {
      addLog("> [System] Single Terminal Mode - skipping shared cache read.");
    } else {
      setProgress({
        stage: 'init',
        text: 'Requesting cached data from server...',
        percent: 15,
        isIndeterminate: true
      });

      addLog("> [Cache] Reading from shared transaction cache...");
      try {
        const res = await fetch(`${backendUrl}/terminal/ledger-cache/${targetAccountId}?hardware_id=${hardwareId}`);
        if (res.ok) {
          cacheData = await res.json();
          if (cacheData.checked_hashes) {
            setCheckedHashes(prev => {
              const next = new Set(prev);
              cacheData.checked_hashes.forEach((h: string) => next.add(h));
              return next;
            });
          }
        }
      } catch (e: any) {
        addLog(`> [Cache] Read failed: ${e.message}`);
      }
    }

    const accLabel = `${selectedAccount.bank_name} ${selectedAccount.account_number}`;

    // Render cache immediately if available (even if stale!)
    if (cacheData && cacheData.transactions) {
      const cacheTxs = cacheData.transactions || [];
      addLog(`> [Cache] Rendered cached transactions from server (${cacheTxs.length} entries).`);

      setLedgerCache(prev => ({
        ...prev,
        [targetAccountId]: {
          balance: cacheData.balance || 'Not synced',
          lastUpdated: cacheData.cached_at ? new Date(cacheData.cached_at).toLocaleTimeString() : 'Never',
          lastUpdatedTimestamp: cacheData.cached_at ? new Date(cacheData.cached_at).getTime() : undefined,
          transactions: cacheTxs,
          cacheVersion: cacheData.cache_version,
          cachedAt: cacheData.cached_at,
          cachedByTerminalName: cacheData.holder_terminal_name || undefined,
          isFromServerCache: true
        }
      }));

      setRecentTxCache(prev => ({
        ...prev,
        [targetAccountId]: {
          transactions: cacheTxs.slice(0, 3),
          label: accLabel,
          lastUpdated: cacheData.cached_at ? new Date(cacheData.cached_at).toLocaleTimeString() : 'Never',
          timestamp: cacheData.cached_at ? new Date(cacheData.cached_at).getTime() : null
        }
      }));

      // Check age: is it less than 10 seconds old?
      const cacheAgeSeconds = cacheData.cached_at
        ? (Date.now() - new Date(cacheData.cached_at).getTime()) / 1000
        : Infinity;

      if (cacheAgeSeconds < 10 && !forceFullSync) {
        addLog(`> [Cache] Shared cache is fresh (${Math.round(cacheAgeSeconds)}s old). Skipping sync.`);
        setProgress({
          stage: 'success',
          text: '✅ Ledger updated (fresh server cache)',
          percent: 100,
          isIndeterminate: false
        });
        setTimeout(() => {
          setLoading(false);
          setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
        }, 1000);
        return;
      }
    }

    // Cache is stale or expired or force full sync requested
    const isLive = cacheData ? cacheData.is_live : false;
    const holderTerminalId = cacheData ? cacheData.holder_terminal_id : null;
    const isLeaderActive = isLive && holderTerminalId && holderTerminalId !== terminalId;

    if (isLeaderActive && !forceFullSync) {
      // Route A: SSE Delegation to Active Leader
      setProgress({
        stage: 'init',
        text: 'Requesting sync from active session...',
        percent: 30,
        isIndeterminate: true
      });

      try {
        const reqRes = await fetch(`${backendUrl}/terminal/ledger-cache/request-refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hardware_id: hardwareId,
            bank_account_id: parseInt(targetAccountId)
          })
        });

        if (!reqRes.ok) throw new Error("Failed to post refresh request.");
        const reqData = await reqRes.json();

        if (reqData.status === 'no_holder') {
          addLog("> [Cache Refresh] Holder disappeared. Syncing locally.");
          await syncLedgerLocally(targetAccountId, selectedAccount, selectedBankName, null);
          return;
        }

        const requestId = reqData.request_id;
        addLog(`> [Cache Refresh] Request ID ${requestId} submitted. Waiting for leader acknowledgment...`);
        setProgress({
          stage: 'init',
          text: 'Waiting for active cashier counter to respond...',
          percent: 45,
          isIndeterminate: true
        });

        // Wait for leader acknowledgment or completion via SSE custom window events
        const waitResult = await new Promise<{ status: string, error?: string }>((resolve) => {
          let resolved = false;
          let isAcknowledged = false;

          const ackHandler = () => {
            if (isAcknowledged || resolved) return;
            isAcknowledged = true;
            addLog("> [Cache Refresh] Leader acknowledged. Syncing bank data...");
            setProgress({
              stage: 'auth',
              text: 'Active terminal is fetching new data...',
              percent: 70,
              isIndeterminate: true
            });
          };

          const completionHandler = (e: any) => {
            const detail = e.detail;
            cleanup({ status: detail.status, error: detail.error });
          };

          const cleanup = (res: { status: string, error?: string }) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(ackTimeoutId);
            clearTimeout(totalTimeoutId);
            window.removeEventListener(`sync_request_ack_${requestId}`, ackHandler);
            window.removeEventListener(`sync_request_${requestId}`, completionHandler);
            resolve(res);
          };

          window.addEventListener(`sync_request_ack_${requestId}`, ackHandler);
          window.addEventListener(`sync_request_${requestId}`, completionHandler);

          // If no acknowledgment received in 3 seconds, promote immediately
          const ackTimeoutId = setTimeout(() => {
            if (!isAcknowledged && !resolved) {
              addLog("> [Cache Refresh] Leader failed to acknowledge within 3 seconds.");
              cleanup({ status: 'no_ack' });
            }
          }, 3000);

          // Total wait timeout of 6 seconds
          const totalTimeoutId = setTimeout(async () => {
            if (!resolved) {
              addLog("> [Cache Refresh] SSE signal wait timed out. Checking server once before promotion.");
              try {
                const pollRes = await fetch(`${backendUrl}/terminal/session/result/${requestId}?hardware_id=${hardwareId}`);
                if (pollRes.ok) {
                  const pollData = await pollRes.json();
                  cleanup({ status: pollData.status, error: pollData.error_message });
                  return;
                }
              } catch (err) { }
              cleanup({ status: 'timeout' });
            }
          }, 6000);
        });

        const isCompleted = waitResult.status === 'fulfilled';
        if (waitResult.status === 'failed' && waitResult.error) {
          addLog(`> [Cache Refresh] Leader reported sync error: ${waitResult.error}`);
        }

        if (isCompleted) {
          // Fetch updated cache data
          const finalRes = await fetch(`${backendUrl}/terminal/ledger-cache/${targetAccountId}?hardware_id=${hardwareId}`);
          if (finalRes.ok) {
            const finalCache = await finalRes.json();
            if (finalCache.checked_hashes) {
              setCheckedHashes(prev => {
                const next = new Set(prev);
                finalCache.checked_hashes.forEach((h: string) => next.add(h));
                return next;
              });
            }
            const finalTxs = finalCache.transactions || [];

            setLedgerCache(prev => ({
              ...prev,
              [targetAccountId]: {
                balance: finalCache.balance || 'Not synced',
                lastUpdated: finalCache.cached_at ? new Date(finalCache.cached_at).toLocaleTimeString() : 'Never',
                lastUpdatedTimestamp: finalCache.cached_at ? new Date(finalCache.cached_at).getTime() : undefined,
                transactions: finalTxs,
                cacheVersion: finalCache.cache_version,
                cachedAt: finalCache.cached_at,
                cachedByTerminalName: finalCache.holder_terminal_name || undefined,
                isFromServerCache: true
              }
            }));

            setRecentTxCache(prev => ({
              ...prev,
              [targetAccountId]: {
                transactions: finalTxs.slice(0, 3),
                label: accLabel,
                lastUpdated: finalCache.cached_at ? new Date(finalCache.cached_at).toLocaleTimeString() : 'Never',
                timestamp: finalCache.cached_at ? new Date(finalCache.cached_at).getTime() : null
              }
            }));
          }

          setProgress({
            stage: 'success',
            text: '✅ Ledger updated (via active leader)',
            percent: 100,
            isIndeterminate: false
          });
          setTimeout(() => {
            setLoading(false);
            setProgress({ stage: 'idle', text: '', percent: 0, isIndeterminate: false });
            setSyncTimeElapsed(syncStartTimeRef.current ? Date.now() - syncStartTimeRef.current : 0);
          }, 1000);
        } else {
          // Timeout fallback: Promote this counter and sync locally
          addLog("> [Cache Refresh] Fallback triggered. Promoting this cashier counter to Leader...");
          setProgress({
            stage: 'init',
            text: 'Active terminal busy. Promoting this cashier counter to sync...',
            percent: 50,
            isIndeterminate: true
          });
          await syncLedgerLocally(targetAccountId, selectedAccount, selectedBankName, requestId);
        }

      } catch (err: any) {
        addLog(`> [Cache Refresh Error] ${err.message}. Promoting self...`);
        await syncLedgerLocally(targetAccountId, selectedAccount, selectedBankName, null);
      }

    } else {
      // Route B: Direct Local Sync
      await syncLedgerLocally(targetAccountId, selectedAccount, selectedBankName, null);
    }
  };

  const companyName = tenantName || "Unregistered Cashier Counter";
  const planName = subscriptionTier === 'free' ? 'Free Trial' : (subscriptionTier === '499' ? 'Standard' : (subscriptionTier === '999' ? 'Pro' : ''));

  const selectedAccount = bankAccounts.find(a => a.id.toString() === selectedAccountId);
  const selectedAccountCurrency = selectedAccount ? (selectedAccount.currency || 'MVR') : 'MVR';

  const selectedAccountCreds = selectedAccountId ? (accountsCreds[selectedAccountId] || {}) : {};
  const isSelectedApiManaged = selectedAccount?.bank_name === 'BML' && appConfig.bml_login_procedure === 'api';
  const isCredentialsComplete = isSelectedApiManaged || (
    !!selectedAccountCreds.username?.trim() &&
    !!selectedAccountCreds.password?.trim() &&
    !!selectedAccountCreds.totpSeed?.trim()
  );

  const isSelectedAccountLocked = selectedAccount ? (selectedAccount.login_failures || 0) >= 2 : false;

  const activeLedgerAcc = selectedLedgerAccountId
    ? bankAccounts.find(a => a.id.toString() === selectedLedgerAccountId)
    : bankAccounts[0];
  const isLockedByVerify = loading && loadingMode !== 'ledger';
  const isLedgerSyncing = loading && loadingMode === 'ledger';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (subscriptionExpired) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();

        if (activeTab === 'verify') {
          if (!loading && isCredentialsComplete && !creditsExhausted && !isSelectedAccountLocked) {
            handleVerify('history');
          }
        } else if (activeTab === 'ledger') {
          if (activeLedgerAcc && !isLedgerSyncing && !isLockedByVerify) {
            syncLedger(activeLedgerAcc.id.toString());
          }
        }
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        setActiveTab('verify');
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setActiveTab('ledger');
      } else if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < bankAccounts.length) {
          e.preventDefault();
          const accId = bankAccounts[index].id.toString();
          if (activeTab === 'verify') {
            setSelectedAccountId(accId);
          } else if (activeTab === 'ledger') {
            setSelectedLedgerAccountId(accId);
            setLedgerPage(1);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, loading, isCredentialsComplete, creditsExhausted, isSelectedAccountLocked, activeLedgerAcc, isLedgerSyncing, isLockedByVerify, bankAccounts, selectedAccountId, selectedLedgerAccountId]);


  if (isSetupMode) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-4">
        <div className="glass-panel p-8 max-w-sm w-full text-center animate-fade-in shadow-2xl">
          <img src="/logo_en.png" alt="Viri Logo" className="h-48 mx-auto mb-6 object-contain" />
          <h2 className="text-2xl font-bold mb-2">Cashier Counter Setup</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-6">Enter the 6-digit pairing code from your Company Dashboard to link this cashier counter.</p>

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
          <h2 className="text-2xl font-bold mb-2">Cashier Counter Locked</h2>
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
    <aside className={`border-r border-[var(--border-color)] bg-[var(--bg-surface)] flex flex-col items-center justify-between py-6 shrink-0 transition-all duration-300 relative ${isSidebarCollapsed ? 'w-16' : 'w-16 md:w-64'
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
      <div className={`flex flex-col items-center text-center px-4 mb-8 transition-all w-full`}>
        {/* Viri Logo Container */}
        <div className={`mb-6 flex ${isSidebarCollapsed ? 'flex-col justify-center' : 'flex-row items-center justify-center gap-3'} w-full`}>
          <img src="/logo_en.png" alt="Viri Logo" className={`w-auto object-contain transition-all ${isSidebarCollapsed ? 'h-10 mx-auto' : 'h-10'}`} />
          {!isSidebarCollapsed && (
            <span className="text-[9px] text-zinc-400 font-mono tracking-tight uppercase whitespace-nowrap leading-tight text-left">
              Zero-Knowledge<br />Architecture
            </span>
          )}
        </div>

        {/* Company Name */}
        <span className={`font-bold text-sm text-white truncate max-w-full tracking-tight transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>
          {companyName}
        </span>

        {/* Cashier Counter PWA Subtitle */}
        <span className={`text-[10px] text-emerald-500/80 font-mono font-bold tracking-widest mt-0.5 uppercase transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>
          Cashier Counter PWA
        </span>
      </div>

      {/* Nav items */}
      <nav className={`flex-1 w-full px-2 space-y-1.5 flex flex-col items-center transition-all ${isSidebarCollapsed ? 'md:items-center' : 'md:items-stretch'}`}>
        <button
          onClick={() => { setShowSettings(false); setActiveTab('verify'); }}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold ${isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
            } ${activeTab === 'verify' && !showSettings
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
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold ${isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
              } ${activeTab === 'ledger' && !showSettings
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
            onClick={() => { setShowSettings(false); setActiveTab('reports'); }}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold ${isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
              } ${activeTab === 'reports' && !showSettings
                ? 'bg-[var(--color-success)] text-black font-bold'
                : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            title="Reports"
          >
            <BarChart3 size={16} className="shrink-0" />
            <span className={`transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:inline'}`}>Reports</span>
          </button>
        )}
        {permissions.reports_enabled && (
          <button
            onClick={() => { setShowSettings(false); setActiveTab('statements'); }}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold ${isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
              } ${activeTab === 'statements' && !showSettings
                ? 'bg-[var(--color-success)] text-black font-bold'
                : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
              }`}
            title="Statements"
          >
            <FileText size={16} className="shrink-0" />
            <span className={`transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:inline'}`}>Statements</span>
          </button>
        )}
        <button
          onClick={() => { setShowSettings(false); setActiveTab('help'); }}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold ${isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
            } ${activeTab === 'help' && !showSettings
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
        <div className={`mt-auto mb-2 transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>
          <a href={`/viri/viri-bridge-${LATEST_EXTENSION_VERSION}.zip`} download className="text-[10px] font-bold text-blue-400 hover:text-blue-300 underline flex items-center justify-center w-full">
            Download latest browser extension {LATEST_EXTENSION_VERSION}
          </a>
        </div>

        {/* Keyboard Shortcuts Info */}
        <div className={`mb-2 border border-zinc-800/60 bg-zinc-900/30 rounded-lg p-3 transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Terminal size={10} /> Keyboard Shortcuts</h4>
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-zinc-400">Sync / View History</span>
              <span className="bg-zinc-800 text-zinc-300 font-mono px-1.5 rounded border border-zinc-700">S</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-zinc-400">Select Bank Account</span>
              <span className="bg-zinc-800 text-zinc-300 font-mono px-1.5 rounded border border-zinc-700">1-9</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-zinc-400">Verification Tab</span>
              <span className="bg-zinc-800 text-zinc-300 font-mono px-1.5 rounded border border-zinc-700">V</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-zinc-400">Ledger Tab</span>
              <span className="bg-zinc-800 text-zinc-300 font-mono px-1.5 rounded border border-zinc-700">L</span>
            </div>
          </div>
        </div>
        {pin && (
          <button
            onClick={() => setIsLocked(true)}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold hover:bg-red-955/20 text-red-400 hover:text-red-300 border border-transparent hover:border-red-900/30 ${isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
              }`}
            title="Lock Cashier Counter"
          >
            <Lock size={16} className="shrink-0" />
            <span className={`transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:inline'}`}>Lock Cashier Counter</span>
          </button>
        )}

        <button
          onClick={() => { setShowSettings(false); setActiveTab('checklist'); }}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold ${isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
            } ${activeTab === 'checklist' && !showSettings
              ? 'bg-amber-500/20 text-amber-300 font-bold ring-1 ring-amber-500/40'
              : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-white'
            }`}
          title="Setup Checklist"
        >
          <ChevronRight size={16} className="shrink-0" />
          <span className={`transition-all ${isSidebarCollapsed ? 'hidden' : 'hidden md:inline'}`}>Checklist</span>
        </button>

        <button
          onClick={() => {
            if (showSettings) {
              setShowSettings(false);
            } else {
              if (settingsPin) {
                const check = prompt("Enter Cashier Counter Settings PIN to open settings:");
                if (check !== settingsPin) {
                  alert("Incorrect PIN");
                  return;
                }
              }
              logActivityToServer('settings_opened');
              setShowSettings(true);
            }
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-xs font-semibold border ${isSidebarCollapsed ? 'md:w-10 md:h-10' : 'md:w-full md:h-auto md:justify-start gap-3 px-3 py-2.5'
            } ${showSettings
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

        {/* ── Credential Sync Toast ── */}
        {credSyncMsg && (
          <div
            className={`fixed bottom-6 right-6 z-[9999] max-w-sm px-5 py-4 rounded-2xl shadow-2xl border flex items-start gap-3 transition-all duration-300 ${credSyncStatus === 'error'
                ? 'bg-red-950/95 border-red-500/60 text-red-200'
                : credSyncStatus === 'exporting' || credSyncStatus === 'importing'
                  ? 'bg-zinc-900/95 border-emerald-500/40 text-zinc-100'
                  : 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
              }`}
          >
            {(credSyncStatus === 'exporting' || credSyncStatus === 'importing') && (
              <span className="mt-0.5 h-4 w-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin shrink-0" />
            )}
            <span className="text-sm leading-snug">{credSyncMsg}</span>
            <button
              onClick={() => { setCredSyncMsg(null); setCredSyncStatus('idle'); }}
              className="ml-auto shrink-0 text-zinc-400 hover:text-white"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        )}

        {subscriptionExpired && (
          <div className="w-full max-w-xl lg:max-w-full mb-6 bg-red-955/25 border-2 border-red-500 text-red-300 px-6 py-4 rounded-2xl flex items-center justify-between gap-4 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0"></span>
              <span className="font-extrabold text-base tracking-wide uppercase font-mono">
                Subscription Expired - contact your admin!
              </span>
            </div>
          </div>
        )}



        {showSettings ? (
          /* Extension settings/admin panel */
          <div className="w-full max-w-xl lg:max-w-full mb-6 glass-panel border-zinc-850 animate-fade-in p-6">
            {/* Header */}
            <div className="border-b border-zinc-800 pb-4 mb-6 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                  <Settings size={22} className="text-zinc-400" /> Viri Admin Panel <Tooltip text="System settings, cashier counter registration, lock PIN, and bank credentials." helpSectionId="admin-panel" />
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  System configuration, lock PIN security, and local bank account credentials.
                </p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="btn btn-success px-4 py-2 text-xs flex items-center gap-1.5 shadow-md rounded-xl font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
              >
                Save & Close
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: System & Security Settings (5 cols) */}
              <div className="lg:col-span-5 space-y-5">
                <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-xl">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">Cashier Counter Status <Tooltip text="Shows pairing state and company connection details." helpSectionId="terminal-pairing" /></h4>
                  <div className="p-3 bg-black/30 border border-zinc-850 rounded-lg text-sm text-[var(--color-success)] font-mono flex items-center justify-between">
                    <span className="truncate pr-2">Connected to {companyName}</span>
                    <button
                      onClick={() => {
                        if (confirm("Are you sure you want to unlink this cashier counter? You will need a new pairing code to use it again.")) {
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
                    <label className="input-label text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">Cashier Counter Lock PIN (Optional) <Tooltip text="A local cashier PIN to lock/unlock this cashier counter." helpSectionId="admin-panel" /></label>
                    <input
                      type="password"
                      className="input-field text-transparent bg-zinc-950/50 border-zinc-800 focus:border-[var(--color-success)] rounded-lg text-sm px-3 py-2"
                      style={{ textShadow: '0 0 0 white' }}
                      placeholder={pin ? "PIN Set (Hidden)" : "Not Set"}
                      maxLength={4}
                      value=""
                      onChange={async (e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setPin(val);
                        localStorage.setItem('viri_terminal_pin', val);
                        try {
                          await fetch(`${backendUrl}/terminal/update-pin`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ hardware_id: hardwareId, terminal_pin: val || null })
                          });
                        } catch (err) {
                          console.error("Failed to sync PIN to server:", err);
                        }
                      }}
                    />
                    <span className="text-[10px] text-[var(--text-secondary)] block mt-1">
                      Type a 4-digit PIN to update. Input length is hidden.
                    </span>
                  </div>

                  <div className="input-group">
                    <label className="input-label text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">Viri Bridge Extension ID (System) <Tooltip text="Unique ID of the local companion browser extension helper." helpSectionId="extension-installation" /></label>
                    <input
                      type="text"
                      className="input-field bg-zinc-950/50 border-zinc-800 text-xs px-3 py-2 text-white"
                      value={extensionId}
                      onChange={e => {
                        const val = e.target.value;
                        setExtensionId(val);
                        localStorage.setItem('viri_extension_id', val);
                      }}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">Viri Backend API Endpoint (System) <Tooltip text="Server URL for syncing metadata and statuses." helpSectionId="admin-panel" /></label>
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
                      Local Bank Credentials <Tooltip text="Local bank login credentials used strictly by the browser extension." helpSectionId="bank-credentials" />
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)] mb-4">
                      Configure individual login credentials for each bank account paired with this cashier counter.
                    </p>

                    <div className="bg-black/25 border border-zinc-800 rounded-xl p-5 text-center leading-relaxed">
                      <Shield size={36} className="mx-auto text-[var(--color-warning)] mb-3 opacity-80" />
                      <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Zero-Knowledge Security</h5>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        All bank login credentials (usernames, passwords, and 2FA seeds) are encrypted locally in your browser storage and never transmitted to Viri servers.
                      </p>
                    </div>

                    {importPending && (
                      <div className="mt-4 p-5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-center space-y-4 animate-pulse">
                        <KeyRound size={28} className="mx-auto text-emerald-400" />
                        <div>
                          <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Credential Sync Ready</h5>
                          <p className="text-[11px] text-zinc-300">
                            Another cashier counter's bank credentials are ready to be copied to this machine.
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-3">
                          <button
                            onClick={handleImportCredentials}
                            disabled={importStatus === 'connecting'}
                            className="btn btn-success text-black py-2 px-4 text-xs font-bold flex items-center gap-1.5 shadow-md rounded-xl disabled:opacity-50"
                          >
                            {importStatus === 'connecting' ? (
                              <>
                                <span className="h-3.5 w-3.5 rounded-full border-2 border-black border-t-transparent animate-spin shrink-0"></span>
                                Importing...
                              </>
                            ) : (
                              <>
                                <Download size={13} />
                                Import Credentials
                              </>
                            )}
                          </button>
                          <span className="text-xs font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-500/20 px-2 py-1 rounded">
                            {String(Math.floor(importCountdown / 60)).padStart(2, '0')}:{String(importCountdown % 60).padStart(2, '0')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bank Accounts Manager */}
            <div className="mt-6 pt-6 border-t border-[var(--border-color)]">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">Managed Bank Accounts & Login Safety Status <Tooltip text="Lock status of bank accounts under this cashier counter. If failures >= 2, functions are disabled." helpSectionId="bank-credentials" /></h4>
              <p className="text-xs text-[var(--text-secondary)] mb-4">Accounts are synced from company dashboard. Reset failed logins in the Company Admin Panel to unlock terminal operations.</p>

              <div className="space-y-3 mb-4">
                {bankAccounts.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] italic">No accounts configured. Please add them in the company dashboard.</p>
                ) : (
                  bankAccounts.map(acc => {
                    const failures = acc.login_failures || 0;
                    const isLocked = failures >= 2;
                    const isApiManaged = acc.bank_name === 'BML' && appConfig.bml_login_procedure === 'api';
                    const hasCreds = isApiManaged || !!(accountsCreds[acc.id.toString()]?.username);
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
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${hasCreds
                              ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/10'
                              : 'bg-zinc-800 text-zinc-400'
                              }`}>
                              {isApiManaged ? 'API Session Managed' : (hasCreds ? 'Credentials Configured' : 'No Credentials')}
                            </span>
                            {isApiManaged && acc.has_api_token && (
                              <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                                Token Synced
                              </span>
                            )}
                            {!isExpanded && isApiManaged && (
                              <div className="flex items-center gap-2">
                                <button
                                  className={`btn text-xs py-1.5 px-3 font-semibold border border-emerald-500 hover:bg-emerald-950/50 text-emerald-400`}
                                  onClick={() => {
                                    syncLedgerLocally(acc.id.toString(), acc, acc.bank_name, null);
                                  }}
                                  disabled={loading}
                                >
                                  {loading ? 'Opening...' : 'Login (Browser)'}
                                </button>
                              </div>
                            )}
                            {!isExpanded && !isApiManaged && (
                              <div className="flex items-center gap-2">
                                <button
                                  className={`btn text-xs py-1.5 px-3 font-semibold ${hasCreds
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
                            {acc.bank_name === 'BML' && appConfig.bml_login_procedure === 'api' ? (
                              <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
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
                              </div>
                            ) : (
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
                            )}
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
                                  const isBmlApi = acc.bank_name === 'BML' && appConfig.bml_login_procedure === 'api';
                                  if (!tempUsername.trim() || (!isBmlApi && !tempPassword.trim())) {
                                    alert(`Username ${!isBmlApi ? 'and Password ' : ''}are required.`);
                                    return;
                                  }
                                  
                                  if (isBmlApi) {
                                    saveAccountCredentials(acc.id.toString(), tempUsername, '', '');
                                    
                                    // Send START_BML_AUTH to extension
                                    if (extensionId && typeof window.chrome?.runtime?.sendMessage === 'function') {
                                      addLog("> [System] Initiating BML OAuth flow via Viri Bridge...");
                                      chrome.runtime.sendMessage(extensionId, {
                                        action: 'START_BML_AUTH',
                                        payload: {
                                          terminalId: terminalId,
                                          bankAccountId: acc.id,
                                          backendUrl: backendUrl,
                                          bmlUsername: tempUsername,
                                          profileType: acc.bml_profile_type || '0',
                                          sanctumToken: localStorage.getItem('token') || ''
                                        }
                                      }, (response: any) => {
                                        if (response && response.success) {
                                          addLog("> [System] BML Account linked successfully!");
                                        } else {
                                          addLog(`> [System] Failed to link BML account: ${response?.error || 'Unknown error'}`);
                                        }
                                      });
                                    } else {
                                      alert("Viri Bridge extension is not connected!");
                                    }
                                  } else {
                                    saveAccountCredentials(acc.id.toString(), tempUsername, tempPassword, tempTotpSeed);
                                  }
                                  
                                  setExpandedCredsAccountId(null);
                                }}
                              >
                                {acc.bank_name === 'BML' && appConfig.bml_login_procedure === 'api' ? 'Save & Link Account' : 'Save Credentials'}
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
              <div className="w-full max-w-xl lg:max-w-full flex flex-col lg:grid lg:grid-cols-12 gap-8 items-stretch lg:items-start animate-fade-in animate-duration-500">
                {/* Header */}
                <div className="w-full flex justify-between items-center lg:col-span-12 border-b border-[var(--border-color)] pb-4">
                  <div>
                    <h1 className="text-2xl tracking-tight text-white font-bold">{companyName}</h1>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Powered by Viri {planName && <span>• {planName.toUpperCase()} PLAN</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Theme Toggle */}
                    <button
                      onClick={toggleTheme}
                      title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--color-success)] transition-all"
                    >
                      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                    </button>

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

                {/* LEFT COLUMN: Form + System Health */}
                <div className="w-full flex flex-col gap-8 lg:col-span-4 order-1">
                  {/* Form Card for Verify Transfer */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const canVerify = !loading && isCredentialsComplete && amount && !isNaN(Number(amount)) && Number(amount) > 0 && !creditsExhausted && !isSelectedAccountLocked && !subscriptionExpired;
                      if (canVerify) {
                        handleVerify('search');
                      }
                    }}
                    className="w-full glass-panel p-6 border border-zinc-800 bg-zinc-950/20 rounded-2xl flex flex-col gap-5"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-1.5">Verify Transfer <Tooltip text="Input details from the customer's transfer receipt to programmatically confirm funds arrival." helpSectionId="transfer-verification" /></h2>
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
                      <label className="input-label text-[10px] uppercase tracking-wider font-bold text-zinc-400 flex items-center gap-1.5">Target Amount ({selectedAccountCurrency}) <Tooltip text="The exact transfer amount shown on the customer's receipt." helpSectionId="transfer-verification" /></label>
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
                      <label className="input-label text-[10px] uppercase tracking-wider font-bold text-zinc-400 flex items-center gap-1.5">Receiving Account <Tooltip text="The company's bank account the customer claims to have sent funds to." helpSectionId="transfer-verification" /></label>
                      {bankAccounts.length === 0 ? (
                        <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-lg text-center text-zinc-500 italic text-sm">
                          No accounts configured
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                          {bankAccounts.map((acc, idx) => {
                            const isSelected = selectedAccountId === acc.id.toString();
                            const isBml = acc.bank_name === 'BML';
                            return (
                              <button
                                key={acc.id}
                                type="button"
                                ref={(el) => verifyAccountRefs.current[acc.id.toString()] = el}
                                disabled={loading}
                                onClick={() => setSelectedAccountId(acc.id.toString())}
                                className={`w-full px-4 py-3 rounded-xl border text-left flex items-center gap-3 transition-all ${isSelected
                                  ? (isBml
                                    ? 'bg-red-955/20 border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.15)] animate-scale-bump'
                                    : 'bg-emerald-955/20 border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.15)] animate-scale-bump')
                                  : 'bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700'
                                  }`}
                              >
                                <div className="w-8 h-8 rounded bg-zinc-950/80 border border-zinc-800/80 p-1 flex items-center justify-center shrink-0">
                                  <img src={isBml ? '/logo_bml.png' : '/logo_mib.png'} className="w-full h-full object-contain" alt="" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-[10px] uppercase font-bold tracking-wider ${isBml ? 'text-red-400' : 'text-emerald-400'
                                      }`}>
                                      {acc.bank_name}
                                    </span>
                                    {idx < 9 && (
                                      <kbd className="text-[9px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded shadow-sm flex items-center justify-center font-mono">
                                        {idx + 1}
                                      </kbd>
                                    )}
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
                      return (
                        <>
                          <div className="space-y-3 mt-2">
                            <button
                              onClick={() => handleVerify('search')}
                              disabled={loading || !isCredentialsComplete || !amount || isNaN(Number(amount)) || Number(amount) <= 0 || creditsExhausted || isSelectedAccountLocked || subscriptionExpired}
                              className={`w-full btn btn-success py-3.5 text-base justify-center gap-2 font-bold rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all ${loading || !isCredentialsComplete || !amount || isNaN(Number(amount)) || Number(amount) <= 0 || creditsExhausted || isSelectedAccountLocked || subscriptionExpired ? 'opacity-50 cursor-not-allowed' : ''
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
                              type="button"
                              onClick={() => handleVerify('history')}
                              disabled={loading || !isCredentialsComplete || creditsExhausted || isSelectedAccountLocked || subscriptionExpired}
                              className={`w-full btn btn-outline py-3 text-sm justify-center gap-2 font-semibold rounded-xl transition-all border border-zinc-800 hover:border-zinc-700 bg-transparent text-zinc-300 hover:text-white ${loading || !isCredentialsComplete || creditsExhausted || isSelectedAccountLocked || subscriptionExpired ? 'opacity-50 cursor-not-allowed' : ''
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
                                  VIEW HISTORY <span className="ml-1 opacity-50 text-[10px] font-mono">[S]</span>
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

                    {showExpiryWarning && licenseExpiresAt && (
                      <div className="mt-2 p-3.5 bg-yellow-950/20 border border-yellow-500/30 rounded-xl text-xs text-yellow-400 leading-normal flex items-start gap-2.5">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <div>
                          <strong className="block font-bold mb-0.5">Subscription Expiring Soon</strong>
                        </div>
                      </div>
                    )}
                  </form>

                  {/* System Health Status Panel */}
                  <div className="w-full glass-panel p-6 border border-zinc-800 bg-zinc-950/20 rounded-2xl flex flex-col gap-3.5 shadow-sm animate-fade-in">
                    <h4 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                      <Activity size={12} className="text-zinc-400" /> System Health
                    </h4>
                    
                    <div className="flex flex-col gap-3 font-mono text-[11px] mt-1">
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Bridge Extension <span className="text-zinc-600 text-[9px] ml-1">[latest {LATEST_EXTENSION_VERSION}]</span></span>
                        {extensionVersion ? (
                          (() => {
                            const normExt = extensionVersion.replace(/^v/, '');
                            const normLatest = LATEST_EXTENSION_VERSION.replace(/^v/, '');
                            const isOutdated = normExt !== normLatest;
                            return (
                              <span
                                className={`${isOutdated ? 'text-red-400 animate-pulse' : 'text-emerald-400'} flex items-center gap-1.5 font-bold`}
                                title={isOutdated ? `Extension update available (latest is ${LATEST_EXTENSION_VERSION})` : undefined}
                              >
                                <div className={`w-1.5 h-1.5 rounded-full ${isOutdated ? 'bg-red-400' : 'bg-emerald-400'} animate-pulse-glow`} />
                                Connected &rarr; {extensionVersion}
                              </span>
                            );
                          })()
                        ) : extensionId ? (
                          <span className="text-amber-400 flex items-center gap-1.5 font-bold"><div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-glow" /> Disconnected</span>
                        ) : (
                          <span className="text-red-400 flex items-center gap-1.5 font-bold"><div className="w-1.5 h-1.5 rounded-full bg-red-400" /> Missing ID</span>
                        )}
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-zinc-400" title="The bank session role this cashier counter is currently playing. Active Holder = this cashier counter owns the live bank session. Delegating = another cashier counter requested this session. Claiming = this cashier counter is trying to acquire a session.">Session Role</span>
                        {sessionStatus === 'holder' ? (() => {
                          // Find which account this cashier counter is holding based on extension's report
                          const held = bankAccounts.find(a => a.id.toString() === sessionHolderAccountId);
                          return (
                            <span className="text-emerald-400 flex items-center gap-1.5 font-bold">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-glow" />
                              {held ? `Holding ${held.bank_name} (${held.account_number.slice(-4)})` : 'Active Holder'}
                            </span>
                          );
                        })() : sessionStatus === 'claiming' ? (
                          <span className="text-blue-400 flex items-center gap-1.5 font-bold"><div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-glow" /> Claiming</span>
                        ) : sessionStatus === 'delegating' ? (
                          <span className="text-purple-400 flex items-center gap-1.5 font-bold"><div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse-glow" /> Delegating</span>
                        ) : (
                          <span className="text-zinc-500 flex items-center gap-1.5 font-bold"><div className="w-1.5 h-1.5 rounded-full bg-zinc-600" /> Idle</span>
                        )}
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-zinc-400" title="The current active mode of the synchronization engine. Single Counter = only one terminal is active. Multi-Counter = multiple active cashier counters coordinating.">Operation Mode</span>
                        <span className={`font-bold ${operationMode === 'Multi-Counter' ? 'text-indigo-400' : 'text-zinc-300'}`}>
                          {operationMode} {operationMode === 'Multi-Counter' ? `(${activeTerminalsCount})` : ''}
                        </span>
                      </div>

                      {syncHealthSummary && (
                        <>
                          <div className="flex justify-between items-center border-t border-zinc-800/60 pt-2 mt-1">
                            <span className="text-zinc-400">Sync Confidence</span>
                            <span className={`font-bold flex items-center gap-1.5 ${
                              syncHealthSummary.confidence_score >= 85 ? 'text-emerald-400' :
                              syncHealthSummary.confidence_score >= 60 ? 'text-amber-400' : 'text-red-400'
                            }`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${
                                syncHealthSummary.confidence_score >= 85 ? 'bg-emerald-400 animate-pulse-glow' :
                                syncHealthSummary.confidence_score >= 60 ? 'bg-amber-400 animate-pulse-glow' : 'bg-red-400 animate-pulse'
                              }`} />
                              {syncHealthSummary.confidence_score}%
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-400">Sync Efficiency</span>
                            <span className="text-zinc-300 font-bold">
                              {Math.round(syncHealthSummary.efficiency_score * 100)}%
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-400">Sync Backlog</span>
                            <span className={`font-bold ${syncHealthSummary.backlog > 0 ? 'text-amber-400 animate-pulse' : 'text-zinc-500'}`}>
                              {syncHealthSummary.backlog} request(s)
                            </span>
                          </div>
                        </>
                      )}

                      <div className="border-t border-zinc-800/60 mt-1 pt-2 flex flex-col gap-1.5">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">All Bank Sessions</span>
                        <div className={`grid gap-x-4 gap-y-1.5 ${bankAccounts.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {bankAccounts.map((account) => {
                            const accountIdStr = account.id.toString();
                            const isLocalHolder = sessionStatus === 'holder' && sessionHolderAccountId === accountIdStr;
                            const isServerHolder = terminalId !== null && account.session_holder_terminal_id === terminalId;
                            const isOwnSession = isLocalHolder || isServerHolder;

                            let isActive = false;
                            let elapsedMs: number | null = null;
                            let heartbeatTime: number | undefined;
                            let claimedTime: number | undefined;

                            if (account.session_claimed_at) {
                              try {
                                claimedTime = new Date(account.session_claimed_at).getTime();
                              } catch (e) { }
                            }

                            if (!account.session_holder_terminal_id) {
                              isActive = false;
                            } else if (isLocalHolder) {
                              isActive = true;
                              if (account.session_last_heartbeat_at) {
                                try {
                                  heartbeatTime = new Date(account.session_last_heartbeat_at).getTime();
                                } catch (e) { }
                              }
                            } else if (account.session_last_heartbeat_at) {
                              try {
                                heartbeatTime = new Date(account.session_last_heartbeat_at).getTime();
                                const idleMs = Math.max(0, Date.now() - heartbeatTime);
                                isActive = idleMs <= 90000;
                              } catch (e) {
                                isActive = false;
                              }
                            }

                            if (isActive) {
                              if (claimedTime) {
                                elapsedMs = Math.max(0, Date.now() - claimedTime);
                              } else {
                                elapsedMs = 0;
                              }
                            } else {
                              if (heartbeatTime && claimedTime && heartbeatTime >= claimedTime) {
                                elapsedMs = Math.max(0, heartbeatTime - claimedTime);
                              } else {
                                elapsedMs = null;
                              }
                            }

                            const accountLabel = `${account.bank_name} (${account.account_number.slice(-4)})`;
                            let timeStr = '';
                            if (elapsedMs !== null && elapsedMs >= 0) {
                              const totalSeconds = Math.floor(elapsedMs / 1000);
                              const m = Math.floor(totalSeconds / 60);
                              const s = totalSeconds % 60;
                              timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}s`;
                            }

                            return (
                              <div key={account.id} className="flex justify-between items-center min-w-0">
                                <span className="text-zinc-400 truncate text-[10px]" title={account.label || account.account_number}>
                                  {accountLabel}
                                </span>
                                {isActive ? (
                                  <span className="text-emerald-400 flex items-center gap-1 font-bold text-[10px] shrink-0 ml-1" title={isOwnSession ? 'This terminal' : (account.session_holder_name || undefined)}>
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-glow" />
                                    Active {timeStr}
                                  </span>
                                ) : (
                                  <span className="text-zinc-500 flex items-center gap-1 font-bold text-[10px] shrink-0 ml-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                                    Idle {timeStr}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex justify-between items-center mt-1 pt-2 border-t border-zinc-800/60">
                        <span className="text-zinc-500">Last Fetch</span>
                        <span className="text-zinc-400 font-bold">{lastPopulatedTime || 'Never'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Progress + Active Account + Logs + Recent Transactions */}
                <div className="w-full flex flex-col gap-8 lg:col-span-8 order-2 animate-fade-in animate-duration-500">
                  {/* Progress & Active Account sub-grid */}
                  <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    {/* Progress / Status Card */}
                    <div className="w-full glass-panel p-6 border border-zinc-800 bg-zinc-950/20 rounded-2xl flex flex-col justify-between min-h-[175px] shadow-sm animate-fade-in">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                            {activeStepIndex === 5 ? (
                              <>
                                <span>Last Credit: {selectedAccountCurrency} {formatAmount(result?.amount)}</span>
                                <Tooltip text="The payment has been confirmed as received on your bank account." helpSectionId="transfer-verification" />
                                <span className="px-2 py-0.5 bg-emerald-955/50 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-wider rounded uppercase">
                                  Success
                                </span>
                              </>
                            ) : progress.stage === 'error' ? (
                              /No recent credit transaction found|Search not found/i.test(error || '') ? (
                                <>
                                  <span>Search not found</span>
                                  <Tooltip text="The banking session successfully completed, but no transaction matching the exact searched amount was found." helpSectionId="transfer-verification" />
                                  <span className="px-2 py-0.5 bg-emerald-955/50 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-wider rounded uppercase">
                                    Search not found
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span>Verification Failed</span>
                                  <Tooltip text="The program failed to verify this transfer. Please review logs or try again." helpSectionId="transfer-verification" />
                                  <span className="px-2 py-0.5 bg-red-955/50 border border-red-500/20 text-red-400 text-[10px] font-bold tracking-wider rounded uppercase">
                                    Failed
                                  </span>
                                </>
                              )
                            ) : loading ? (
                              <>
                                <span>{progress.text || "Verifying Transfer..."}</span>
                                <Tooltip text="Active scraping session running in companion browser extension." helpSectionId="extension-installation" />
                                {progress.stage === 'lock' && (
                                  <span className="px-2 py-0.5 bg-amber-955/50 border border-amber-500/20 text-amber-400 text-[10px] font-bold tracking-wider rounded uppercase animate-pulse">
                                    Locking
                                  </span>
                                )}
                              </>
                            ) : (() => {
                              const lastCreditTx = lastTransactions.find(tx => tx.amount.startsWith('+'));
                              const lastCreditAmount = lastCreditTx
                                ? formatAmount(lastCreditTx.amount).replace('+', '')
                                : '00.00';
                              return (
                                <>
                                  <span>Last Credit: {selectedAccountCurrency} {lastCreditAmount}</span>
                                  <Tooltip text="The most recent credit transaction detected on this account." helpSectionId="transfer-verification" />
                                </>
                              );
                            })()}
                          </h2>
                          {activeStepIndex === 5 && result ? (() => {
                            const successTx = result.transaction || lastTransactions.find(tx => {
                              if (!result.reference) return false;
                              const refClean = String(result.reference).trim().toLowerCase();
                              const detailsClean = String(tx.details).toLowerCase();
                              return detailsClean.includes(refClean) || (tx.amount && tx.amount.includes(result.amount));
                            });
                            return (
                              <div className="space-y-1 font-mono text-[11px] mt-1.5 text-zinc-300">
                                <div className="font-bold flex items-center gap-1.5">
                                  <span>Date: {successTx?.date || new Date(result.timestamp).toLocaleString()}</span>
                                </div>
                                {successTx?.details ? (() => {
                                  const detailsSingleLine = String(successTx.details).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                                  const truncated = detailsSingleLine.length > 30 ? detailsSingleLine.substring(0, 30) + '...' : detailsSingleLine;
                                  return (
                                    <div className="text-zinc-400 truncate" title={successTx.details}>
                                      {truncated}
                                    </div>
                                  );
                                })() : (
                                  <div className="text-zinc-500 italic">No additional transaction details.</div>
                                )}
                              </div>
                            );
                          })() : progress.stage === 'error' ? (
                            <p className={`text-xs mt-1 font-medium leading-relaxed ${/No recent credit transaction found|Search not found/i.test(error || '') ? 'text-emerald-400/90' : 'text-[var(--text-secondary)]'}`}>
                              {error || "An error occurred during verification."}
                            </p>
                          ) : loading ? (
                            <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium leading-relaxed">
                              {timeLeft !== null ? `Estimated remaining: ~${timeLeft}s` : "Contacting banking server..."}
                            </p>
                          ) : (() => {
                            const lastCreditTx = lastTransactions.find(tx => tx.amount.startsWith('+'));
                            if (lastCreditTx) {
                              return (
                                <div className="space-y-1 font-mono text-[11px] mt-1.5 text-zinc-300">
                                  <div className="font-bold flex items-center gap-1.5">
                                    <span>Date: {lastCreditTx.date}</span>
                                  </div>
                                  {(() => {
                                    const detailsSingleLine = String(lastCreditTx.details).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                                    const truncated = detailsSingleLine.length > 30 ? detailsSingleLine.substring(0, 30) + '...' : detailsSingleLine;
                                    return (
                                      <div className="text-zinc-400 truncate" title={lastCreditTx.details}>
                                        {truncated}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            }
                            return (
                              <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium leading-relaxed">
                                Enter transfer details on the left and click Verify to start.
                              </p>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Small inline status/timer indicator */}
                      {(loading || progress.stage === 'error' || activeStepIndex === 5) && (
                        <div className="flex items-center gap-2 mt-4 text-[10px] text-zinc-500 font-mono border-t border-zinc-800/40 pt-2 mt-auto">
                          <span>Status:</span>
                          <span className={`${
                            activeStepIndex === 5 ? 'text-emerald-400 font-bold' :
                            progress.stage === 'error' ? (/No recent credit transaction found|Search not found/i.test(error || '') ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold') :
                            'text-zinc-400 animate-pulse'
                          }`}>
                            {progress.text || (activeStepIndex === 5 ? 'Success' : 'Active')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Active Account & Balance Summary Card */}
                    <div className="w-full glass-panel p-6 border border-zinc-800 bg-zinc-950/20 rounded-2xl flex flex-col justify-between min-h-[175px] relative overflow-hidden group shadow-sm">
                      {/* Subtle background glow */}
                      <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors" />

                      <h4 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-1.5 z-10">
                        <BookOpen size={12} className="text-zinc-400" /> Active Account
                      </h4>

                      <div className="flex items-center gap-3 z-10 my-2">
                        {selectedAccount ? (
                          <>
                            <div className="w-8 h-8 rounded bg-zinc-950/80 border border-zinc-800/80 p-1 flex items-center justify-center shrink-0">
                              <img src={selectedAccount.bank_name === 'BML' ? '/logo_bml.png' : '/logo_mib.png'} className="w-full h-full object-contain" alt="" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[10px] uppercase font-bold tracking-wider ${selectedAccount.bank_name === 'BML' ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {selectedAccount.bank_name}
                                </span>
                                {selectedAccount.label && (
                                  <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-bold">
                                    {selectedAccount.label}
                                  </span>
                                )}
                              </div>
                              <div className="text-[13px] font-bold text-white truncate mt-0.5">{selectedAccount.account_name}</div>
                              <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-0.5">
                                {selectedAccount.account_number}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="text-zinc-500 text-sm">No Account Selected</div>
                        )}
                      </div>

                      <div className="flex justify-between items-end z-10 pt-2 border-t border-zinc-800/60 mt-auto">
                        <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-bold">Balance</span>
                        <div className="text-right">
                          <span className="text-[10px] text-emerald-500/70 mr-1 font-bold">{selectedAccountCurrency}</span>
                          <span className="text-sm font-bold font-mono text-emerald-400">
                            {(() => {
                              const verifyCache = selectedAccount ? (ledgerCache[selectedAccount.id.toString()] || { balance: 'Not synced' }) : { balance: 'Not synced' };
                              return permissions.ledger_show_balance ? (
                                verifyCache.balance !== 'Not synced' && verifyCache.balance !== 'Not found' ? formatAmount(verifyCache.balance) : '0.00'
                              ) : '[hidden]';
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Verification Log Panel (only shows verification flow logs) */}
                  {permissions.show_vbtl && activeTab === 'verify' && (
                    <div className="w-full bg-black border border-zinc-800 rounded-lg overflow-hidden animate-fade-in shadow-2xl">
                      <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span className="text-xs text-zinc-400 ml-2 font-mono flex items-center gap-1">Viri Bridge Cashier Counter Logs <Tooltip text="Real-time network crawler debugging logs execution stream." helpSectionId="extension-installation" /></span>
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
                  <div className="w-full glass-panel p-6 border border-zinc-800 bg-zinc-950/20 rounded-2xl flex flex-col gap-4">
                    <div className="flex justify-between items-center border-b border-zinc-800/80 pb-3">
                      <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
                        Recent Transactions {lastTransactionsLabel ? `- ${lastTransactionsLabel}` : ''} <Tooltip text="The last few statement entries cached/fetched from the bank's database." helpSectionId="transaction-ledger" />
                      </h3>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-zinc-900/40 rounded-xl border border-zinc-800">
                      {/* Sync Progress */}
                      <div className="flex items-center gap-3 w-full md:flex-1 min-w-0">
                        <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold font-sans whitespace-nowrap shrink-0">Sync Progress</span>
                        <div className="w-24 sm:w-40 bg-zinc-800 h-3 rounded-full overflow-hidden relative shadow-inner shrink-0">
                          <div
                            className={`h-full transition-all duration-300 rounded-full ${progress.stage === 'error'
                              ? (/No recent credit transaction found|Search not found/i.test(error || '') ? 'bg-emerald-400' : 'bg-red-500')
                              : ((loading && loadingMode === 'history')
                                ? 'bg-gradient-to-r from-emerald-400 to-cyan-500'
                                : 'bg-emerald-400')
                              }`}
                            style={{ width: `${(loading && loadingMode === 'history') ? progress.percent : 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-zinc-300 text-[10px] font-bold whitespace-nowrap shrink-0">
                          {(loading && loadingMode === 'history') ? `${progress.percent}%` : '100%'}
                        </span>
                        <span className="font-mono text-zinc-300 text-[11px] font-bold ml-1 truncate flex-1 min-w-0">
                          {progress.text || ((loading && loadingMode === 'history') ? 'Fetching...' : 'Ready')}
                        </span>
                      </div>

                      {/* Sync Info / Metadata */}
                      <div className="flex flex-wrap items-center justify-end gap-3 font-mono text-[11px] min-w-0">
                        <span className="font-mono text-zinc-500 font-bold tabular-nums">
                          {loading && loadingMode === 'history' && syncStartTimeRef.current
                          ? <><LiveTimer startTime={syncStartTimeRef.current} mode="elapsed" /></>
                          : (syncTimeElapsed !== null ? `${(syncTimeElapsed / 1000).toFixed(1)}s` : '0.0s')}
                        </span>
                        <span className="text-zinc-700 hidden xl:inline">|</span>
                        <span className="text-zinc-500 whitespace-nowrap hidden xl:inline">Since last fetch: <span className={`${!(loading && loadingMode === 'history') ? 'text-zinc-300' : 'text-zinc-500'}`}>
                          {lastPopulatedTimestamp ? (() => {
                            return <><LiveTimer startTime={lastPopulatedTimestamp} mode="ago" />s ago</>;
                          })() : '0s ago'}
                        </span></span>
                        <span className="text-zinc-700 hidden xl:inline">|</span>
                        <span className="text-zinc-500 truncate">{lastPopulatedTime ? lastPopulatedTime : 'Never fetched'}</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto bg-transparent">
                      {lastTransactions && lastTransactions.length > 0 ? (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-zinc-800 bg-zinc-900/10 text-zinc-400 uppercase tracking-wider font-semibold text-[10px]">
                              <th className="px-4 py-2 font-medium">Date & Time <Tooltip text="The transaction posting date." helpSectionId="transaction-ledger" /></th>
                              <th className="px-4 py-2 font-medium">Description <Tooltip text="Primary transaction description/type." helpSectionId="transaction-ledger" /></th>
                              <th className="px-4 py-2 font-medium">Details <Tooltip text="Additional transaction info (refs, IDs, card details, sender info)." helpSectionId="transaction-ledger" /></th>
                              <th className="px-4 py-2 font-medium text-right">Amount / Balance <Tooltip text="Green indicates credits (+), red indicates debits (-)." helpSectionId="transaction-ledger" /></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-color)] text-xs text-[var(--text-secondary)]">
                            {lastTransactions.map((tx) => {
                              const getTxKey = (t: typeof tx) => {
                                return `${t.date}-${t.amount}-${t.details}-${t.runningBalance || ''}`;
                              };
                              const txKey = getTxKey(tx);
                              const rowKey = txKey;
                              const isNew = newTransactionKeys.has(txKey);
                              const isCredit = tx.amount.startsWith('+');
                              const detailsParts = tx.details.split('\n');
                              const description = (detailsParts[0] || '').trim();
                              const details = detailsParts.slice(1).join('\n').trim();

                              return (
                                <tr key={rowKey} className={`hover:bg-zinc-800/50 transition-colors group ${isNew ? 'animate-new-transaction' : ''}`}>
                                  <td className="px-4 py-3.5 text-xs font-mono text-zinc-400 whitespace-nowrap align-top">
                                    {tx.date}
                                  </td>
                                  <td className="px-4 py-3.5 text-xs font-semibold text-zinc-200 align-top">
                                    {description}
                                  </td>
                                  <td className="px-4 py-3.5 text-[11px] text-zinc-400 font-mono whitespace-pre-line leading-relaxed align-top break-words max-w-xs lg:max-w-md">
                                    {details || <span className="text-zinc-600 italic">-</span>}
                                    {selectedAccount?.bank_name === 'BML' && (
                                      <div className="mt-2 flex flex-wrap gap-2 text-zinc-300">
                                        {(() => {
                                          const combinedText = `${tx.reference || ''} ${tx.details || ''}`;
                                          const refs = Array.from(new Set(combinedText.match(/(?:BLZ|BLAZ|FT)[A-Za-z0-9\\]+/gi) || []));
                                          
                                          const fallbackRef = tx.reference && tx.reference.trim().length > 4 && !tx.reference.toLowerCase().includes('ansfer') && !tx.reference.toLowerCase().includes('transfer') ? tx.reference : null;
                                          if (refs.length === 0 && fallbackRef) refs.push(fallbackRef);
                                          
                                          if (refs.length > 0) {
                                            return refs.map((ref, idx) => (
                                              <div key={idx} className="inline-flex items-center gap-2 bg-zinc-900 px-2 py-1 rounded">
                                                <span className="font-semibold text-zinc-300">{ref}</span>
                                                <button
                                                  onClick={() => navigator.clipboard.writeText(ref)}
                                                  className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                                                  title="Copy Reference"
                                                >
                                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                  </svg>
                                                </button>
                                              </div>
                                            ));
                                          }
                                          return null;
                                        })()}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-top whitespace-nowrap">
                                    <div className={`font-mono font-bold text-sm leading-none ${isCredit ? 'text-[var(--color-success)]' : 'text-red-400'
                                      }`}>
                                      {formatAmount(tx.amount)}
                                    </div>
                                    {tx.runningBalance && (
                                      <div className="text-[10px] font-mono text-zinc-500 leading-none mt-1.5">
                                        Bal: {selectedAccountCurrency} {formatAmount(tx.runningBalance)}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-8 text-center text-zinc-500 italic flex flex-col gap-3">
                          <div>No recent history available.</div>
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
                            disabled={loading || isLocked || subscriptionExpired}
                            className={`text-[10px] uppercase font-bold text-zinc-400 hover:text-white transition-colors py-2 px-4 hover:bg-white/5 rounded-lg border border-zinc-800 ${loading || isLocked || subscriptionExpired ? 'opacity-45 cursor-not-allowed' : ''
                              }`}
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

            {activeTab === 'ledger' && (() => {
              // Resolve active ledger account context

              const ledgerCurrency = activeLedgerAcc?.currency || 'MVR';
              const cache = activeLedgerAcc ? (ledgerCache[activeLedgerAcc.id.toString()] || {
                balance: 'Not synced',
                lastUpdated: 'Never',
                transactions: []
              }) : { balance: 'Not synced', lastUpdated: 'Never', transactions: [] };

              // Apply filters & search logic
              const rawTransactions = cache.transactions || [];
              const filteredTransactions = rawTransactions.filter(tx => {
                const isCredit = tx.amount.startsWith('+');

                // 0. Permission Filter (Hide Outward / Debit)
                if (!permissions.ledger_show_debit && !isCredit) return false;

                // 1. Direction Filter
                if (ledgerFilter === 'in' && !isCredit) return false;
                if (ledgerFilter === 'out' && isCredit) return false;

                // 2. Search Query Matching (description, details, date)
                if (ledgerSearch.trim()) {
                  const query = ledgerSearch.toLowerCase();
                  const matchesDesc = tx.details.toLowerCase().includes(query);
                  const matchesDate = tx.date.toLowerCase().includes(query);
                  const matchesAmount = tx.amount.toLowerCase().includes(query);
                  return matchesDesc || matchesDate || matchesAmount;
                }

                // 3. Date Filter
                if (ledgerDateFilter) {
                  // tx.date format: "Jul 5, 14:06" → match by "Jul D," prefix
                  const picked = new Date(ledgerDateFilter);
                  const monthShort = picked.toLocaleString('en-US', { month: 'short' });
                  const day = picked.getDate();
                  const prefix = `${monthShort} ${day},`;
                  if (!tx.date.startsWith(prefix)) return false;
                }

                return true;
              });

              // Pagination variables
              const totalPages = Math.ceil(filteredTransactions.length / ledgerPageSize);
              const currentPage = Math.min(ledgerPage, totalPages || 1);
              const startIndex = (currentPage - 1) * ledgerPageSize;
              const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + ledgerPageSize);

              const isSyncing = loading && loadingMode === 'ledger';

              // Helper function to return icon based on transaction description
              const handleCheckTransaction = async (accountId: string, hash: string) => {
                if (!hardwareId || !backendUrl) return;
                
                // Optimistic UI update
                setCheckedHashes(prev => {
                  const next = new Set(prev);
                  next.add(hash);
                  return next;
                });

                try {
                  const res = await fetch(`${backendUrl}/terminal/transaction/check`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      hardware_id: hardwareId,
                      bank_account_id: parseInt(accountId),
                      hash: hash
                    })
                  });
                  if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d.error || 'Failed to check transaction');
                  }
                } catch (err: any) {
                  console.error(err);
                  // Revert if failed
                  setCheckedHashes(prev => {
                    const next = new Set(prev);
                    next.delete(hash);
                    return next;
                  });
                  alert('Failed to mark transaction as received: ' + err.message);
                }
              };

              // (getTransactionIcon removed, extracted outside component)

              return (
                <div className="w-full max-w-7xl mx-auto animate-fade-in flex flex-col gap-6 font-sans">
                  {/* Top Header Section */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800/80 pb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-950/30 border border-emerald-500/20 rounded-full text-[10px] font-semibold text-emerald-400">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span>ONLINE{terminalName && ` — ${terminalName.toUpperCase()}`}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                          <Shield size={10} /> Viri Zero-Knowledge Architecture: Fully encrypted local storage.
                        </span>
                      </div>
                      <h1 className="text-3xl font-extrabold text-white tracking-tight">Transaction Ledger</h1>
                      <p className="text-sm text-zinc-400 mt-1">Real-time cashier counter view for authenticated accounts</p>
                    </div>

                    {/* Total Position widget */}
                    <div className="text-right">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold font-sans">Total Position</div>
                      <div className="text-3xl font-black text-emerald-400 tracking-tight mt-1">
                        {permissions.ledger_show_balance ? (
                          `${ledgerCurrency} ${cache.balance !== 'Not synced' && cache.balance !== 'Not found' ? formatAmount(cache.balance) : '0.00'}`
                        ) : (
                          '[hidden]'
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-1">
                        LAST SYNC: {cache.lastUpdated}
                      </div>
                    </div>
                  </div>

                  {/* Search input above carousel */}
                  <div className="w-full flex justify-between items-center gap-4">
                    <span className="text-xs text-zinc-500 font-sans">
                      Select account to view entries
                    </span>
                    <div className="relative w-full max-w-[240px]">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-zinc-500">
                        <Search size={13} />
                      </span>
                      <input
                        type="text"
                        placeholder="Search accounts..."
                        className="w-full bg-zinc-950/40 border border-zinc-800 rounded-lg text-xs pl-7 pr-3 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60"
                        value={bankSearchQuery}
                        onChange={e => setBankSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Horizontal Bank Account Cards Selector Carousel */}
                  <div className="relative w-full group flex items-center px-4">
                    <style>{`
                      .scrollbar-none::-webkit-scrollbar {
                        display: none !important;
                      }
                    `}</style>

                    {/* Left Scroll Arrow */}
                    <button
                      type="button"
                      onClick={() => {
                        if (carouselRef.current) {
                          carouselRef.current.scrollBy({ left: -300, behavior: 'smooth' });
                        }
                      }}
                      className="absolute left-0 z-10 w-8 h-8 rounded-full bg-zinc-950/70 border border-zinc-800/80 text-white/50 hover:text-white flex items-center justify-center transition-all hover:bg-zinc-900/80 shadow-md active:scale-95"
                      title="Scroll Left"
                    >
                      <ChevronLeft size={18} />
                    </button>

                    {/* Scrollable Container */}
                    <div
                      ref={carouselRef}
                      className="flex gap-4 w-full overflow-x-auto scroll-smooth py-1 scrollbar-none"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {(() => {
                        const filtered = bankAccounts.filter(acc => {
                          const query = bankSearchQuery.trim().toLowerCase();
                          if (!query) return true;
                          return (
                            acc.account_name.toLowerCase().includes(query) ||
                            acc.account_number.toLowerCase().includes(query) ||
                            acc.bank_name.toLowerCase().includes(query) ||
                            (acc.currency && acc.currency.toLowerCase().includes(query)) ||
                            (acc.label && acc.label.toLowerCase().includes(query))
                          );
                        });

                        if (filtered.length === 0) {
                          return (
                            <div className="w-full text-center py-6 text-xs text-zinc-500 italic bg-zinc-950/20 border border-zinc-900 rounded-xl">
                              No matching bank accounts found
                            </div>
                          );
                        }

                        return filtered.map(acc => {
                          const originalIndex = bankAccounts.findIndex(a => a.id === acc.id);
                          const isSelected = selectedLedgerAccountId === acc.id.toString();
                          const isBml = acc.bank_name === 'BML';
                          const accCache = ledgerCache[acc.id.toString()] || { balance: 'Not synced' };
                          return (
                            <button
                              key={acc.id}
                              data-ledger-card-id={acc.id.toString()}
                              onClick={() => {
                                setSelectedLedgerAccountId(acc.id.toString());
                                setLedgerPage(1);
                              }}
                              className={`p-4 rounded-xl border text-left flex items-center gap-3.5 transition-all shadow-lg shrink-0 w-80 ${isSelected
                                ? 'bg-zinc-900 border-emerald-500/60 ring-1 ring-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.08)]'
                                : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/30'
                                }`}
                            >
                              <div className="w-8 h-8 rounded bg-zinc-950/80 border border-zinc-800 p-1 flex items-center justify-center shrink-0">
                                <img src={isBml ? '/logo_bml.png' : '/logo_mib.png'} className="w-full h-full object-contain" alt={acc.bank_name} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">{acc.bank_name} • Active</span>
                                  {originalIndex < 9 && (
                                    <kbd className="text-[9px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded shadow-sm flex items-center justify-center font-mono">
                                      {originalIndex + 1}
                                    </kbd>
                                  )}
                                  {acc.label && (
                                    <span className="text-[9px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded font-medium">
                                      {acc.label}
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm font-bold text-white truncate mt-0.5">{acc.account_name}</div>
                                <div className="text-[10px] text-zinc-500 font-mono tracking-widest">{acc.account_number}</div>
                                <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                                  {permissions.ledger_show_balance ? (
                                    accCache.balance !== 'Not synced' ? `${acc.currency || 'MVR'} ${formatAmount(accCache.balance)}` : 'Not synced'
                                  ) : (
                                    '[hidden]'
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        });
                      })()}
                    </div>

                    {/* Right Scroll Arrow */}
                    <button
                      type="button"
                      onClick={() => {
                        if (carouselRef.current) {
                          carouselRef.current.scrollBy({ left: 300, behavior: 'smooth' });
                        }
                      }}
                      className="absolute right-0 z-10 w-8 h-8 rounded-full bg-zinc-950/70 border border-zinc-800/80 text-white/50 hover:text-white flex items-center justify-center transition-all hover:bg-zinc-900/80 shadow-md active:scale-95"
                      title="Scroll Right"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>

                  {/* Main Table Container */}
                  {activeLedgerAcc && (
                    <div className="glass-panel p-5 w-full bg-zinc-950/40 border border-zinc-800 rounded-2xl flex flex-col gap-5">

                      {/* Filter & Toolbar Area */}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-white tracking-tight">Daily Entries</h3>
                          <span className="text-sm font-mono text-zinc-500">({filteredTransactions.length})</span>
                          {/* Shared Sync Badge */}
                          {(() => {
                            const cache = ledgerCache[activeLedgerAcc.id.toString()];
                            if (!cache || !cache.timestamp) return null;
                            const isFresh = (Date.now() - cache.timestamp) < 10000;
                            const terminalNameStr = cache.cachedByTerminalName || 'System';

                            return (
                              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${isFresh
                                  ? 'bg-emerald-950/30 border-emerald-500/20 text-emerald-400'
                                  : 'bg-amber-950/30 border-amber-500/20 text-amber-400'
                                }`}
                                title={`Version: ${cache.cacheVersion || 0}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isFresh ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                                <span>Updated by {terminalNameStr} {(() => {
                                  return <><LiveTimer startTime={cache.timestamp} mode="ago" />s ago</>;
                                })()}</span>
                              </div>
                            );
                          })()}
                        </div>


                        <div className="flex flex-wrap items-center gap-4">
                          {/* Segmented Filter Control */}
                          <div className="bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-800 flex items-center gap-1">
                            <button
                              onClick={() => { setLedgerFilter('all'); setLedgerPage(1); }}
                              className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${ledgerFilter === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                                }`}
                            >
                              All
                            </button>
                            <button
                              onClick={() => { setLedgerFilter('in'); setLedgerPage(1); }}
                              className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${ledgerFilter === 'in' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                                }`}
                            >
                              Inwards
                            </button>
                            <button
                              onClick={() => { setLedgerFilter('out'); setLedgerPage(1); }}
                              className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${ledgerFilter === 'out' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                                }`}
                            >
                              Outwards
                            </button>
                          </div>

                          {/* Search Inputs */}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                            <input
                              type="text"
                              value={ledgerSearch}
                              onChange={(e) => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
                              placeholder="Search..."
                              className="pl-9 pr-4 py-1.5 bg-zinc-900/60 border border-zinc-800 focus:border-zinc-700 text-xs text-white rounded-lg w-48 font-medium focus:outline-none transition-colors"
                            />
                          </div>

                          {/* Date Picker */}
                          {(() => {
                            const today = new Date();
                            const todayYear = today.getFullYear();
                            const todayMonth = today.getMonth();
                            const pickerYear = ledgerPickerYear;
                            const pickerMonth = ledgerPickerMonth;
                            const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
                            const firstDayOfWeek = new Date(pickerYear, pickerMonth, 1).getDay();
                            const monthLabel = new Date(pickerYear, pickerMonth, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
                            const todayStr = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            const isCurrentMonth = pickerYear === todayYear && pickerMonth === todayMonth;

                            const goToPrevMonth = () => {
                              if (pickerMonth === 0) {
                                setLedgerPickerYear(pickerYear - 1);
                                setLedgerPickerMonth(11);
                              } else {
                                setLedgerPickerMonth(pickerMonth - 1);
                              }
                            };
                            const goToNextMonth = () => {
                              if (isCurrentMonth) return; // don't go past current month
                              if (pickerMonth === 11) {
                                setLedgerPickerYear(pickerYear + 1);
                                setLedgerPickerMonth(0);
                              } else {
                                setLedgerPickerMonth(pickerMonth + 1);
                              }
                            };

                            return (
                              <div className="relative" id="ledger-date-picker">
                                <button
                                  onClick={() => setLedgerDatePickerOpen(v => !v)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${ledgerDateFilter
                                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-300 hover:bg-violet-500/30'
                                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
                                    }`}
                                  title={ledgerDateFilter ? `Showing: ${new Date(ledgerDateFilter).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Filter by date'}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                  {ledgerDateFilter
                                    ? new Date(ledgerDateFilter).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    : 'Date'}
                                  {ledgerDateFilter && (
                                    <span
                                      role="button"
                                      onClick={(e) => { e.stopPropagation(); setLedgerDateFilter(null); setLedgerPage(1); }}
                                      className="ml-0.5 text-violet-300 hover:text-white leading-none"
                                      title="Clear date filter"
                                    >✕</span>
                                  )}
                                </button>

                                {ledgerDatePickerOpen && (
                                  <>
                                    {/* Backdrop */}
                                    <div
                                      className="fixed inset-0 z-40"
                                      onClick={() => setLedgerDatePickerOpen(false)}
                                    />
                                    {/* Calendar Dropdown */}
                                    <div className="absolute right-0 top-full mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 w-64 select-none" style={{ backdropFilter: 'blur(12px)' }}>
                                      {/* Month navigation header */}
                                      <div className="flex items-center justify-between mb-2">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); goToPrevMonth(); }}
                                          className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors text-sm"
                                          title="Previous month"
                                        >&#8249;</button>
                                        <span className="text-[11px] font-bold text-zinc-300 tracking-wider uppercase">{monthLabel}</span>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); goToNextMonth(); }}
                                          disabled={isCurrentMonth}
                                          className={`w-6 h-6 flex items-center justify-center rounded-md text-sm transition-colors ${isCurrentMonth
                                              ? 'text-zinc-700 cursor-not-allowed'
                                              : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                                            }`}
                                          title={isCurrentMonth ? 'Already at current month' : 'Next month'}
                                        >&#8250;</button>
                                      </div>
                                      {/* Weekday headers */}
                                      <div className="grid grid-cols-7 mb-1">
                                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                                          <span key={d} className="text-center text-[9px] font-bold text-zinc-600 uppercase py-0.5">{d}</span>
                                        ))}
                                      </div>
                                      {/* Day cells */}
                                      <div className="grid grid-cols-7 gap-y-0.5">
                                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                                          <span key={`empty-${i}`} />
                                        ))}
                                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                          const dateStr = `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                          const isSelected = ledgerDateFilter === dateStr;
                                          const isToday = dateStr === todayStr;
                                          // Disable future dates in current month
                                          const isFuture = isCurrentMonth && day > today.getDate();
                                          return (
                                            <button
                                              key={day}
                                              disabled={isFuture}
                                              onClick={() => {
                                                if (isFuture) return;
                                                setLedgerDateFilter(isSelected ? null : dateStr);
                                                setLedgerPage(1);
                                                setLedgerDatePickerOpen(false);
                                              }}
                                              className={`w-full aspect-square rounded-lg text-[11px] font-medium transition-all flex items-center justify-center ${isFuture
                                                  ? 'text-zinc-700 cursor-not-allowed'
                                                  : isSelected
                                                    ? 'bg-violet-500 text-white shadow-[0_0_10px_rgba(139,92,246,0.5)]'
                                                    : isToday
                                                      ? 'bg-zinc-800 text-violet-300 ring-1 ring-violet-500/40'
                                                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                                                }`}
                                            >
                                              {day}
                                            </button>
                                          );
                                        })}
                                      </div>
                                      {/* Show All / Jump to Today */}
                                      <div className="mt-2 flex items-center justify-between gap-2">
                                        {!isCurrentMonth && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setLedgerPickerYear(todayYear); setLedgerPickerMonth(todayMonth); }}
                                            className="text-[10px] text-zinc-500 hover:text-violet-300 transition-colors py-1"
                                          >
                                            Jump to today
                                          </button>
                                        )}
                                        {ledgerDateFilter && (
                                          <button
                                            onClick={() => { setLedgerDateFilter(null); setLedgerPage(1); setLedgerDatePickerOpen(false); }}
                                            className="ml-auto text-[10px] text-zinc-500 hover:text-white transition-colors py-1"
                                          >
                                            Show all dates
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}



                          {/* Sync Button */}
                          <button
                            onClick={() => syncLedger(activeLedgerAcc.id.toString())}
                            disabled={isSyncing || isLockedByVerify || subscriptionExpired}
                            className="bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(52,211,153,0.15)] disabled:opacity-40"
                          >
                            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
                            <span>Sync History <span className="opacity-50 text-[10px] font-mono ml-1">[S]</span></span>
                          </button>
                        </div>
                      </div>

                      {/* Sync Progress Bar (Moved under Daily Entries) */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-zinc-900/40 rounded-xl border border-zinc-800">
                        {/* Sync Progress */}
                        <div className="flex items-center gap-3 w-full md:flex-1 min-w-0">
                          <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold font-sans whitespace-nowrap shrink-0">Sync Progress</span>
                          <div className="w-24 sm:w-40 bg-zinc-800 h-3 rounded-full overflow-hidden relative shadow-inner shrink-0">
                            <div
                              className={`h-full transition-all duration-300 rounded-full ${progress.stage === 'error'
                                ? (/No recent credit transaction found|Search not found/i.test(error || '') ? 'bg-emerald-400' : 'bg-red-500')
                                : (isSyncing
                                  ? 'bg-gradient-to-r from-emerald-400 to-cyan-500'
                                  : 'bg-emerald-400')
                                }`}
                              style={{ width: `${isSyncing ? progress.percent : 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-zinc-300 text-[10px] font-bold whitespace-nowrap shrink-0">
                            {isSyncing ? `${progress.percent}%` : '100%'}
                          </span>
                          <span className="font-mono text-zinc-300 text-[11px] font-bold ml-1 truncate flex-1 min-w-0">
                            {progress.text || (isSyncing ? 'Syncing...' : 'Success')}
                          </span>
                        </div>

                        {/* Sync Info / Metadata */}
                        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                          <span className="font-mono text-zinc-500 font-bold tabular-nums">
                            {isSyncing && syncStartTimeRef.current
                              ? <><LiveTimer startTime={syncStartTimeRef.current} mode="elapsed" /></>
                              : (syncTimeElapsed !== null ? `${(syncTimeElapsed / 1000).toFixed(1)}s` : '0.0s')}
                          </span>
                          <span className="text-zinc-700">|</span>
                          <span className="text-zinc-500">Since last sync: <span className={`${!isSyncing ? 'text-zinc-300' : 'text-zinc-500'}`}>
                            {cache.lastUpdatedTimestamp ? (
                              <LiveTimer startTime={cache.lastUpdatedTimestamp} mode="hms" />
                            ) : '00:00:00'}
                          </span></span>
                          <span className="text-zinc-700">|</span>
                          <span className="text-zinc-500">{cache.lastUpdated !== 'Never' ? cache.lastUpdated : 'Never synced'}</span>
                        </div>
                      </div>

                      {/* Entries Table */}
                      <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/10 flex flex-col font-sans">
                        {isSyncing && paginatedTransactions.length === 0 ? (
                          <div className="p-16 text-center text-zinc-500 flex flex-col items-center gap-3">
                            <Loader2 className="animate-spin text-zinc-600" size={32} />
                            <span className="italic text-sm">Logging into banking portal securely...</span>
                          </div>
                        ) : paginatedTransactions.length === 0 ? (
                          <div className="p-16 text-center text-zinc-500 italic text-sm">
                            No ledger entries found. Modify filters or click "Sync History" to fetch statement.
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                                    <th className="py-4 px-5 font-semibold w-12 text-center">Status</th>
                                    <th className="py-4 px-5 font-semibold">Date & Time</th>
                                    <th className="py-4 px-5 font-semibold">Description</th>
                                    <th className="py-4 px-5 font-semibold">Details / Meta</th>
                                    <th className="py-4 px-5 font-semibold text-right">Amount ({ledgerCurrency})</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/60">
                                  {paginatedTransactions.map((tx: LedgerTransaction) => {
                                    const getTxKey = (t: typeof tx) => `${t.date}-${t.amount}-${t.details}-${t.runningBalance || ''}`;
                                    const txKey = getTxKey(tx);
                                    const isNew = newTransactionKeys.has(txKey);
                                    const isCredit = tx.amount.startsWith('+');
                                    const isChecked = tx.hash ? checkedHashes.has(tx.hash) : false;

                                    return (
                                      <TransactionRow
                                        key={txKey}
                                        tx={tx}
                                        isNew={isNew}
                                        isCredit={isCredit}
                                        isChecked={isChecked}
                                        activeLedgerAcc={activeLedgerAcc}
                                        permissions={permissions}
                                        handleCheckTransaction={handleCheckTransaction}
                                      />
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Bottom Pagination Panel */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-4 bg-zinc-950/60 border-t border-zinc-800 text-xs">
                              <div className="flex-1"></div> {/* Spacer to push paging to right */}

                              {/* Paging controls */}
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-zinc-500">Show</span>
                                  <select
                                    value={ledgerPageSize}
                                    onChange={(e) => { setLedgerPageSize(Number(e.target.value)); setLedgerPage(1); }}
                                    className="bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold px-2 py-1 rounded text-xs focus:outline-none focus:border-zinc-700"
                                  >
                                    <option value={10}>10 rows</option>
                                    <option value={20}>20 rows</option>
                                    <option value={25}>25 rows</option>
                                    <option value={50}>50 rows</option>
                                  </select>
                                </div>

                                {/* Save Report Button */}
                                <button
                                  onClick={handleSaveReport}
                                  className="bg-[var(--color-success)] hover:bg-emerald-400 text-black font-semibold text-[10px] px-2.5 py-1.5 rounded-md border border-emerald-500 hover:border-emerald-400 flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(16,185,129,0.2)] hover:shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                                  title="Save this ledger snapshot as an encrypted report"
                                >
                                  <BookOpen size={12} />
                                  <span>Save Report</span>
                                </button>

                                {/* Force Full Sync Button */}
                                <button
                                  onClick={() => syncLedger(activeLedgerAcc.id.toString(), true)}
                                  disabled={isSyncing || isLockedByVerify || subscriptionExpired}
                                  className="bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white font-semibold text-[10px] px-2.5 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-700 flex items-center gap-1.5 transition-all disabled:opacity-40"
                                  title="Bypass shared cache and force direct bank authentication sync"
                                >
                                  <AlertTriangle size={12} className="text-amber-500/80" />
                                  <span>Force Sync</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTab === 'reports' && (
              <div className="flex-1 w-full max-w-7xl mx-auto flex gap-6 p-4 md:p-6 animate-fade-in h-full min-h-[500px]">
                {/* Left Sidebar: List of Reports */}
                <div className="w-80 flex flex-col gap-4 overflow-y-auto pr-2">
                  <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <BarChart3 className="text-[var(--color-success)]" size={20} />
                    Saved Reports
                  </h2>
                  {savedReports.length === 0 ? (
                    <div className="text-sm text-zinc-500 italic p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">No reports saved yet. Save a snapshot from the Ledger tab.</div>
                  ) : (
                    savedReports.map(report => (
                      <div
                        key={report.id}
                        className={`w-full text-left p-4 rounded-xl border transition-all relative flex flex-col items-start justify-center cursor-pointer ${
                          selectedReportId === report.id 
                            ? 'bg-[var(--color-success)]/10 border-[var(--color-success)] shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-scale-bump' 
                            : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'
                        }`}
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        <div className="flex justify-between items-start w-full">
                          <div className="text-sm font-bold text-white mb-1">{report.bank} - {report.account_name}</div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteReport(report.id); }}
                            className="text-zinc-500 hover:text-red-400 p-1 rounded-md hover:bg-red-400/10 transition-colors z-10"
                            title="Delete this report"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono tracking-wider mb-2">{new Date(report.date).toLocaleString()}</div>
                        <div className="text-xs font-semibold text-[var(--color-success)]">Bal: {report.payload?.balanceAtSave || '-'} {report.payload?.currency}</div>
                      </div>
                    ))
                  )}
                </div>
                
                {/* Right Panel: Report Details */}
                <div className="flex-1 flex flex-col bg-zinc-950/40 border border-zinc-800 rounded-2xl overflow-hidden relative">
                  {selectedReportId ? (() => {
                    const selectedReport = savedReports.find(r => r.id === selectedReportId);
                    if (!selectedReport) return null;
                    return (
                      <div className="flex flex-col h-full animate-slide-up">
                        <div className="p-6 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm z-20 sticky top-0">
                          <h3 className="text-2xl font-bold text-white">Ledger Report Snapshot</h3>
                          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-xs font-mono">
                            <div className="flex flex-col"><span className="text-zinc-500 uppercase">Bank</span><span className="text-zinc-200">{selectedReport.bank}</span></div>
                            <div className="flex flex-col"><span className="text-zinc-500 uppercase">Account</span><span className="text-zinc-200">{selectedReport.account_name} ({selectedReport.account_number})</span></div>
                            <div className="flex flex-col"><span className="text-zinc-500 uppercase">Date Generated</span><span className="text-zinc-200">{new Date(selectedReport.date).toLocaleString()}</span></div>
                            <div className="flex flex-col"><span className="text-zinc-500 uppercase">Snapshot Balance</span><span className="text-[var(--color-success)] font-bold">{selectedReport.payload?.balanceAtSave} {selectedReport.payload?.currency}</span></div>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-0">
                          <table className="w-full text-sm text-left">
                            <thead className="text-[10px] text-zinc-500 bg-zinc-950 sticky top-0 uppercase tracking-wider z-10">
                              <tr>
                                <th className="px-6 py-3 font-semibold">Date</th>
                                <th className="px-6 py-3 font-semibold">Description</th>
                                <th className="px-6 py-3 font-semibold text-right">Amount</th>
                                <th className="px-6 py-3 font-semibold text-right hidden sm:table-cell">Balance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                              {selectedReport.payload?.transactions?.length > 0 ? (
                                selectedReport.payload.transactions.map((tx: any, idx: number) => {
                                  const isCredit = (tx.amount || '').startsWith('+');
                                  const detailsParts = (tx.details || '').split('\n');
                                  const description = (detailsParts[0] || '').trim();
                                  return (
                                    <tr key={idx} className="hover:bg-zinc-900/50 transition-colors group">
                                      <td className="px-6 py-3 text-zinc-300 whitespace-nowrap text-xs">{tx.date}</td>
                                      <td className="px-6 py-3 text-zinc-200 text-xs">{description}</td>
                                      <td className={`px-6 py-3 text-right font-mono font-medium text-xs ${isCredit ? 'text-[var(--color-success)]' : 'text-red-400'}`}>
                                        {tx.amount}
                                      </td>
                                      <td className="px-6 py-3 text-right text-zinc-400 font-mono text-xs hidden sm:table-cell">{tx.runningBalance || '-'}</td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic">No transactions found in this snapshot.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4">
                      <div className="w-16 h-16 rounded-full bg-zinc-900/50 border border-zinc-800 flex items-center justify-center">
                        <BookOpen size={24} className="opacity-50" />
                      </div>
                      <p>Select a report from the left to view details.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- TAB: STATEMENTS --- */}
            {activeTab === 'statements' && (
              <div className="flex flex-col h-full overflow-hidden animate-fade-in bg-[var(--bg-canvas)]">
                <div className="p-6 md:p-8 flex-1 overflow-y-auto">
                  <div className="max-w-5xl mx-auto space-y-6 text-left">
                    <div className="glass-panel p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-emerald-900/50 border border-emerald-600/30 flex items-center justify-center">
                          <FileText size={18} className="text-emerald-400" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">Bank Statements</h2>
                          <p className="text-xs text-zinc-400 mt-0.5">Generate statements from your linked bank accounts using the Viri Chrome Extension.</p>
                        </div>
                      </div>

                      <form onSubmit={handleGenerateStatement} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-6">
                        <div className="input-group">
                          <label className="input-label">Bank Account</label>
                          <select 
                            className="input-field w-full"
                            value={stmtAccountId}
                            onChange={(e) => setStmtAccountId(e.target.value)}
                            required
                          >
                            <option value="">Select Account</option>
                            {bankAccounts.map(a => (
                              <option key={a.id} value={a.id}>{a.account_name} ({a.account_number})</option>
                            ))}
                          </select>
                        </div>
                        <div className="input-group">
                          <label className="input-label">From Date</label>
                          <input type="date" className="input-field w-full" value={stmtFromDate} onChange={(e) => setStmtFromDate(e.target.value)} required />
                        </div>
                        <div className="input-group">
                          <label className="input-label">To Date</label>
                          <input type="date" className="input-field w-full" value={stmtToDate} onChange={(e) => setStmtToDate(e.target.value)} required />
                        </div>
                        <div>
                          <button type="submit" disabled={stmtLoading} className="btn bg-emerald-600 hover:bg-emerald-500 text-white w-full h-[42px] disabled:opacity-50">
                            {stmtLoading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Generate'}
                          </button>
                        </div>
                      </form>

                      {stmtError && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-6">
                          {stmtError}
                        </div>
                      )}

                      {stmtTransactions && (
                        <div className="mt-8 border border-zinc-800 rounded-xl overflow-hidden bg-black/20">
                          <div className="flex justify-between items-center p-4 border-b border-zinc-800">
                            <h3 className="font-semibold text-white">Transactions ({stmtTransactions.length})</h3>
                            <button 
                              onClick={() => {
                                const csv = 'Date,Description,Reference,Amount,Balance\n' + 
                                  stmtTransactions.map(t => `${t.date},"${t.description}",${t.reference},${t.amount},${t.balance}`).join('\n');
                                const blob = new Blob([csv], { type: 'text/csv' });
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `statement_${stmtAccountId}_${stmtFromDate}_to_${stmtToDate}.csv`;
                                a.click();
                              }}
                              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                            >
                              <Download size={14} /> Download CSV
                            </button>
                          </div>
                          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                              <thead className="bg-zinc-900/50 sticky top-0">
                                <tr>
                                  <th className="px-4 py-3 text-zinc-400 font-medium">Date</th>
                                  <th className="px-4 py-3 text-zinc-400 font-medium">Description</th>
                                  <th className="px-4 py-3 text-zinc-400 font-medium">Reference</th>
                                  <th className="px-4 py-3 text-zinc-400 font-medium text-right">Amount</th>
                                  <th className="px-4 py-3 text-zinc-400 font-medium text-right">Balance</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800">
                                {stmtTransactions.length === 0 ? (
                                  <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">No transactions found in this date range.</td></tr>
                                ) : (
                                  stmtTransactions.map((tx, idx) => (
                                    <tr key={idx} className="hover:bg-zinc-800/30">
                                      <td className="px-4 py-3 text-zinc-300">{tx.date}</td>
                                      <td className="px-4 py-3 text-white max-w-[200px] truncate" title={tx.description}>{tx.description}</td>
                                      <td className="px-4 py-3 text-zinc-400 text-xs font-mono">{tx.reference}</td>
                                      <td className={`px-4 py-3 text-right font-medium ${tx.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-4 py-3 text-right text-zinc-300">{tx.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'checklist' && (
              <div className="flex-1 w-full max-w-3xl mx-auto flex flex-col items-start justify-start p-4 md:p-8 animate-fade-in overflow-y-auto space-y-8">

                {/* Page Header */}
                <div className="w-full">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/10">
                      <ChevronRight size={20} className="text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white tracking-tight">Getting Started</h2>
                      <p className="text-sm text-[var(--text-secondary)] mt-0.5">Complete these steps before using the Cashier Counter.</p>
                    </div>
                  </div>
                  <div className="mt-4 w-full h-px bg-zinc-800" />
                </div>

                {/* Step 1: Download & Install Extension */}
                <div className="w-full space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">1</div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white mb-1">Download &amp; Install the Browser Extension</h3>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
                        The <strong className="text-white">Viri Bridge</strong> browser extension is required. It acts as a secure local bridge between the Cashier Counter and your bank's portal — without exposing your credentials to any server.
                      </p>

                      {/* Download Button */}
                      <a
                        href={`/viri/viri-bridge-${LATEST_EXTENSION_VERSION}.zip`}
                        download
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors mb-6 shadow-lg shadow-emerald-900/30"
                      >
                        <MonitorSmartphone size={16} />
                        Download Viri Bridge Extension (.zip)
                      </a>

                      {/* Desktop steps */}
                      <div className="space-y-5">
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
                          <h4 className="font-bold text-white mb-3 flex items-center gap-2 text-sm">
                            <span className="text-base">🖥️</span> Installing on Desktop (Chrome / Brave)
                          </h4>
                          <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-2 marker:text-emerald-400">
                            <li>Download the <strong className="text-zinc-300">.zip</strong> file using the button above.</li>
                            <li>Extract / unzip it into a permanent folder on your computer.</li>
                            <li>Open your browser and go to <code className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-xs">chrome://extensions</code>.</li>
                            <li>Enable <strong className="text-zinc-300">Developer mode</strong> using the toggle in the top-right corner.</li>
                            <li>Click <strong className="text-zinc-300">Load unpacked</strong> and select the folder you just extracted.</li>
                            <li>The extension icon should now appear in your browser toolbar. You're done!</li>
                          </ol>
                        </div>

                        {/* Mobile steps */}
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
                          <h4 className="font-bold text-white mb-1 flex items-center gap-2 text-sm">
                            <span className="text-base">📱</span> Installing on Android (Kiwi Browser)
                          </h4>
                          <p className="text-xs text-yellow-500 mb-3">Standard Chrome for Android does not support extensions. Use Kiwi Browser instead.</p>
                          <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-2 marker:text-yellow-400">
                            <li>Install <strong className="text-zinc-300">Kiwi Browser</strong> from the Google Play Store.</li>
                            <li>Open this Cashier Counter page inside Kiwi Browser.</li>
                            <li>Download the <strong className="text-zinc-300">.zip</strong> file using the button above.</li>
                            <li>In Kiwi, tap the <strong className="text-zinc-300">⋮ menu → Extensions</strong> and enable Developer mode.</li>
                            <li>Tap <strong className="text-zinc-300">+ (from .zip / .crx)</strong> and select the downloaded file.</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-zinc-800" />

                {/* Step 2: Bank Credentials */}
                <div className="w-full space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm">2</div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white mb-1">Enter Your Bank Login Credentials</h3>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
                        The terminal needs your online banking username, password, and TOTP seed (if applicable) to authenticate with your bank and verify transfers on your behalf.
                      </p>

                      {/* Where to find */}
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 mb-4">
                        <h4 className="font-bold text-white mb-3 text-sm flex items-center gap-2">
                          <span className="text-base">📍</span> Where to enter credentials
                        </h4>
                        <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-2 marker:text-blue-400">
                          <li>Go to the <strong className="text-zinc-300">Settings</strong> tab (the bottom tab in the left sidebar) of this Cashier Counter PWA.</li>
                          <li>Scroll to the bottom of the page and look for the section labelled <strong className="text-zinc-300">"Managed Bank Accounts &amp; Login Safety Status"</strong>.</li>
                          <li>If any account already shows <strong className="text-zinc-300">Credentials Configured</strong>, it is ready to use. Otherwise, click the <strong className="text-zinc-300">EDIT</strong> button next to the account and enter your internet banking username, password, and TOTP seed.</li>
                          <li>Click <strong className="text-zinc-300">Save</strong>. You only need to do this once per account.</li>
                        </ol>
                      </div>

                      {/* Security callout */}
                      <div className="bg-blue-950/40 border border-blue-700/40 rounded-xl p-5">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            <Lock size={18} className="text-blue-400" />
                          </div>
                          <div>
                            <h4 className="font-bold text-blue-300 mb-2 text-sm">Your credentials are completely private</h4>
                            <ul className="text-sm text-blue-200/70 space-y-2 leading-relaxed">
                              <li>🔒 <strong className="text-blue-200">Stored only on your device</strong> — credentials are saved inside an encrypted browser storage container that lives exclusively on this computer.</li>
                              <li>🚫 <strong className="text-blue-200">Never sent to Viri</strong> — at no point are your credentials transmitted to Viri's servers or any third party. Viri has zero access to your banking passwords.</li>
                              <li>👁️ <strong className="text-blue-200">Not visible to other cashier counter users</strong> — even if another user opens the Cashier Counter on a different device, they cannot see or access credentials saved here.</li>
                              <li>🛡️ <strong className="text-blue-200">Isolated by browser profile</strong> — the data is scoped to your browser profile. Switching profiles or browsers means starting fresh.</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-zinc-800" />

                {/* Done callout */}
                <div className="w-full bg-emerald-950/30 border border-emerald-700/30 rounded-xl p-5 flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <span className="text-lg">✅</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-300 mb-1 text-sm">You're all set!</h4>
                    <p className="text-sm text-emerald-200/70 leading-relaxed">
                      Once the extension is installed and credentials are saved, head to the <strong className="text-emerald-200">Verification</strong> tab to start verifying customer transfers in real-time.
                    </p>
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'help' && (
              <div ref={helpContentRef} className="flex-1 w-full max-w-4xl mx-auto flex flex-col items-center justify-start p-4 md:p-8 animate-fade-in overflow-y-auto space-y-6">
                <div className="w-full text-center space-y-2 mb-2">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-4">
                    <HelpCircle size={32} className="text-blue-400" />
                  </div>
                  <h2 className="text-3xl font-bold text-white tracking-tight">Help & Support</h2>
                  <p className="text-[var(--text-secondary)]">Learn how to install the extension and use the Cashier Counter PWA.</p>
                </div>

                {/* Search Bar */}
                <div className="w-full relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search help topics..."
                    value={helpSearchQuery}
                    onChange={e => setHelpSearchQuery(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                  {helpSearchQuery && (
                    <button onClick={() => setHelpSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors">
                      <XCircle size={15} />
                    </button>
                  )}
                </div>

                {(() => {
                  const q = helpSearchQuery.toLowerCase().trim();
                  const sections = [
                    {
                      id: 'extension-installation',
                      title: '1. Extension Installation',
                      icon: <MonitorSmartphone className="text-[var(--color-success)]" />,
                      tags: 'extension install zip chrome kiwi android desktop download browser',
                      body: (
                        <>
                          <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                            The Viri Bridge extension is required to establish a secure local connection between your device and the bank's servers.
                          </p>
                          <div className="mb-6 flex justify-start">
                            <a href={`/viri/viri-bridge-${LATEST_EXTENSION_VERSION}.zip`} download className="btn btn-success flex items-center gap-2">
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
                                <li>Open the Cashier Counter inside Kiwi Browser.</li>
                                <li>Download the extension <strong>.zip</strong> file above.</li>
                                <li>In Kiwi Browser, tap the 3-dot menu and select <strong>Extensions</strong>.</li>
                                <li>Turn on <strong>Developer mode</strong>.</li>
                                <li>Tap <strong>+ (from .zip/.crx/.user.js)</strong> and select the downloaded file.</li>
                              </ol>
                            </div>
                          </div>
                        </>
                      )
                    },
                    {
                      id: 'terminal-pairing',
                      title: '2. Cashier Counter Pairing',
                      icon: <Lock className="text-blue-400" />,
                      tags: 'pairing code link cashier counter company admin',
                      body: (
                        <>
                          <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                            Link this browser to your company's Viri account by pairing the cashier counter.
                          </p>
                          <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-4 marker:text-blue-400">
                            <li>Set up the cashier counter from the <strong>Company Admin Panel</strong>.</li>
                            <li>Get the generated <strong>6-digit Pairing Code</strong>.</li>
                            <li>Go to <strong>https://viri.thinksafe.mv/cashier</strong> on the target device.</li>
                            <li>Enter the pairing code to securely link the cashier counter.</li>
                          </ol>
                        </>
                      )
                    },
                    {
                      id: 'transfer-verification',
                      title: '3. Transfer Verification',
                      icon: <Search className="text-purple-400" />,
                      tags: 'verify transfer amount receipt bml mib bank account',
                      body: (
                        <>
                          <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                            Verify incoming customer transfers instantly without relying on SMS or full bank logins.
                          </p>
                          <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-3 marker:text-purple-400 mb-6">
                            <li>Select the target bank account from the top dropdown.</li>
                            <li>Select the verification mode (e.g. <strong>BML Receipt Match</strong> or <strong>MIB Transfer</strong>).</li>
                            <li>Enter the exact amount shown on the customer's transfer receipt.</li>
                            <li>Click <strong>Verify Transfer</strong>. The system will securely wake up the extension and ping the bank for an exact match.</li>
                          </ol>
                          <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg flex gap-3 text-xs text-zinc-400">
                            <div className="mt-0.5">💡</div>
                            <div><strong>Pro Tip:</strong> Use the <kbd className="bg-zinc-800 border border-zinc-700 px-1.5 rounded font-mono text-white mx-1">S</kbd> key to quickly <strong>View History</strong> or <strong>Sync Ledger</strong> from anywhere!</div>
                          </div>
                        </>
                      )
                    },
                    {
                      id: 'transaction-ledger',
                      title: '4. Transaction Ledger',
                      icon: <BookOpen className="text-amber-400" />,
                      tags: 'ledger transaction history sync credit debit balance',
                      body: (
                        <>
                          <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">View recent transaction history natively within the PWA.</p>
                          <ol className="list-decimal pl-5 text-sm text-[var(--text-secondary)] space-y-3 marker:text-amber-400">
                            <li>Navigate to the <strong>Transaction Ledger</strong> tab using the left sidebar.</li>
                            <li>Select an account and click <strong>Sync Ledger</strong>.</li>
                            <li>The extension will pull the 10 most recent transactions securely from your bank.</li>
                            <li>Credit (incoming) transactions are highlighted in green, while Debit (outgoing) are red.</li>
                          </ol>
                        </>
                      )
                    },
                  ];

                  const filtered = q
                    ? sections.filter(s => s.tags.includes(q) || s.title.toLowerCase().includes(q))
                    : sections;

                  return filtered.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                      {filtered.map(s => (
                        <div key={s.id} id={s.id} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 shadow-xl transition-all duration-300">
                          <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-white">
                            {s.icon}
                            {s.title}
                          </h3>
                          {s.body}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full text-center py-16 text-zinc-500">
                      <Search size={32} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No help topics matched <strong className="text-zinc-400">&ldquo;{helpSearchQuery}&rdquo;</strong>.</p>
                      <button onClick={() => setHelpSearchQuery('')} className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline">Clear search</button>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
}

export default App;
