import { useState, useEffect } from 'react';
import { Shield, RefreshCw, CheckCircle, Settings, AlertTriangle } from 'lucide-react';
import './index.css';

function App() {
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState<'BML' | 'MIB'>('BML');
  const [account, setAccount] = useState('acc_1');
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
    // Default to the current origin's subfolder path if not set
    const defaultUrl = window.location.origin.includes('localhost') 
      ? 'http://localhost:8000/api' // default local Laravel port
      : `${window.location.origin}/viri/api`;
    return localStorage.getItem('viri_backend_url') || defaultUrl;
  });
  const [showSettings, setShowSettings] = useState(false);
  
  // Verification State
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    reference: string;
    amount: string;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Dynamic Totals
  const [totals, setTotals] = useState({
    acc_1: 12450.00,
    acc_2: 3200.00
  });

  // Persist settings
  useEffect(() => {
    localStorage.setItem('viri_extension_id', extensionId);
  }, [extensionId]);

  useEffect(() => {
    localStorage.setItem('viri_backend_url', backendUrl);
  }, [backendUrl]);

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

    chrome.runtime.sendMessage(
      extensionId,
      {
        action: 'VERIFY_TRANSFER',
        payload: {
          amount: parseFloat(amount).toFixed(2),
          bank: bank,
          accountId: account
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
            [account]: prev[account as keyof typeof prev] + addedAmount
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
        </div>
      )}

      <div className="w-full max-w-xl grid gap-6">
        
        {/* Main Verification Panel */}
        <div className="glass-panel animate-fade-in">
          <div className="mb-6 flex-between">
            <h2 className="text-xl">Verify Transfer</h2>
            <div className="flex bg-[var(--bg-canvas)] rounded-lg p-1 border border-[var(--border-color)]">
              <button 
                onClick={() => setBank('BML')}
                disabled={loading}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${bank === 'BML' ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                BML
              </button>
              <button 
                onClick={() => setBank('MIB')}
                disabled={loading}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${bank === 'MIB' ? 'bg-[var(--text-primary)] text-[var(--bg-canvas)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                MIB
              </button>
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
              value={account}
              disabled={loading}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="acc_1">Business Checking (...4592)</option>
              <option value="acc_2">Main Savings (...1103)</option>
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
            <div className="bg-[var(--bg-canvas)] p-4 rounded-lg border border-[var(--border-color)]">
              <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-1">Checking (...4592)</p>
              <p className="text-2xl font-bold text-[var(--color-success)]">
                {totals.acc_1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-normal text-[var(--text-secondary)]">MVR</span>
              </p>
            </div>
            <div className="bg-[var(--bg-canvas)] p-4 rounded-lg border border-[var(--border-color)]">
              <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-1">Savings (...1103)</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {totals.acc_2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-normal text-[var(--text-secondary)]">MVR</span>
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
