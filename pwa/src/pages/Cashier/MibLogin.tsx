import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle, ArrowRight, Loader2, ShieldAlert } from 'lucide-react';

export default function MibLogin() {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId');
  const terminalId = searchParams.get('terminalId');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'login' | 'otp' | 'profile' | 'success'>('login');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [accessDeniedReason, setAccessDeniedReason] = useState<string | null>(null);

  const extensionId = localStorage.getItem('viri_extension_id') || '';
  const pairedHardwareId = localStorage.getItem('viri_hardware_id') || '';
  const backendUrl = localStorage.getItem('viri_backend_url') || 
    (window.location.origin.includes('localhost') ? 'http://localhost:8000/api' : `${window.location.origin}/api`);

  useEffect(() => {
    if (!accountId || !terminalId) {
      setIsAccessDenied(true);
      setAccessDeniedReason('Missing required parameters (accountId or terminalId). Please launch this page directly from your Cashier Counter PWA.');
      return;
    }

    // Layer 1 Security Guard: Check local terminal pairing
    if (!pairedHardwareId) {
      setIsAccessDenied(true);
      setAccessDeniedReason('Access Denied: Unpaired Device. This browser does not have an active paired cashier terminal. MIB Authentication can only be launched from an active terminal session on a paired device.');
      return;
    }

    if (pairedHardwareId !== terminalId) {
      setIsAccessDenied(true);
      setAccessDeniedReason(`Access Denied: Terminal Mismatch. The requested terminal ID (${terminalId}) does not match the active paired terminal on this machine (${pairedHardwareId}). Direct link access across terminals is strictly prohibited.`);
      return;
    }

    if (!extensionId) {
      setError('Viri Extension is not linked. Please pair the cashier counter first.');
    }
  }, [accountId, terminalId, extensionId, pairedHardwareId]);

  // Store credentials to localStorage on successful auth so the A40 fallback can re-authenticate sessions
  useEffect(() => {
    if (step === 'success' && username && password && accountId) {
      try {
        const saved = localStorage.getItem('viri_accounts_creds');
        const creds = saved ? JSON.parse(saved) : {};
        creds[accountId] = { username, password, totpSeed: '' };
        localStorage.setItem('viri_accounts_creds', JSON.stringify(creds));
      } catch (e) {
        console.error('Failed to store MIB credentials:', e);
      }
    }
  }, [step, username, password, accountId]);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username and Password are required.');
      return;
    }
    
    setError(null);
    setLoading(true);

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      setError('Chrome extension API is not available. Please ensure the Viri extension is installed and enabled.');
      setLoading(false);
      return;
    }
    
    if (!extensionId) {
      setError('Viri Extension ID is missing. Please re-pair your terminal.');
      setLoading(false);
      return;
    }

    try {
      const timeoutId = setTimeout(() => {
        setLoading(false);
        setError('Authentication timed out. The bank server or extension is not responding.');
      }, 30000); // 30 seconds timeout

      chrome.runtime.sendMessage(extensionId, {
        action: 'START_MIB_AUTH',
        payload: {
          mibUsername: username.trim(),
          password: password.trim(),
          terminalId: terminalId,
          bankAccountId: accountId,
          backendUrl: backendUrl,
          sanctumToken: localStorage.getItem('token') || '',
          hardwareId: terminalId
        }
      }, (response: any) => {
        clearTimeout(timeoutId);
        setLoading(false);
        if (response && response.success) {
          if (response.needProfile && response.profiles) {
            setProfiles(response.profiles);
            setStep('profile');
          } else if (response.requiresOtp) {
            setStep('otp');
          } else if (response.skipOtp) {
            setStep('success');
          }
        } else {
          setError(response?.error || 'Authentication failed. Please check your credentials.');
        }
      });
    } catch (e: any) {
      setLoading(false);
      setError(`Extension connection error: ${e.message}`);
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 5) {
      setError('Please enter a valid OTP.');
      return;
    }
    
    setError(null);
    setLoading(true);

    try {
      const timeoutId = setTimeout(() => {
        setLoading(false);
        setError('Verification timed out. The bank server or extension is not responding.');
      }, 30000); // 30 seconds timeout

      chrome.runtime.sendMessage(extensionId, {
        action: 'SUBMIT_MIB_OTP',
        payload: {
          otp: otp,
          terminalId: terminalId,
          bankAccountId: accountId,
          backendUrl: backendUrl,
          mibUsername: username.trim(),
          sanctumToken: localStorage.getItem('token') || ''
        }
      }, (response: any) => {
        clearTimeout(timeoutId);
        setLoading(false);
        if (response && response.success) {
          if (response.needProfile && response.profiles) {
            setProfiles(response.profiles);
            setStep('profile');
          } else {
            setStep('success');
          }
        } else {
          setError(response?.error || 'OTP Verification failed.');
        }
      });
    } catch (e: any) {
      setLoading(false);
      setError(`Extension connection error: ${e.message}`);
    }
  };

  const handleProfileSelect = (profileId: string, profileType: string) => {
    setLoading(true);
    setError(null);

    try {
      const timeoutId = setTimeout(() => {
        setLoading(false);
        setError('Profile selection timed out.');
      }, 30000);

      chrome.runtime.sendMessage(extensionId, {
        action: 'SELECT_MIB_PROFILE',
        payload: { profileId, profileType }
      }, (response: any) => {
        clearTimeout(timeoutId);
        setLoading(false);
        if (response && response.success) {
          setStep('success');
        } else {
          setError(response?.error || 'Profile selection failed.');
        }
      });
    } catch (e: any) {
      setLoading(false);
      setError(`Extension error: ${e.message}`);
    }
  };

  if (isAccessDenied) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-center items-center p-4 font-sans text-gray-900">
        <div className="w-full max-w-md bg-white border border-red-200 rounded-2xl shadow-xl p-8 text-center space-y-6 animate-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 text-red-600 flex items-center justify-center mx-auto shadow-sm">
            <ShieldAlert size={36} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-2">Access Denied</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              {accessDeniedReason}
            </p>
          </div>
          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={() => window.close()}
              className="w-full py-3.5 px-4 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold transition-colors shadow-md shadow-gray-900/10"
            >
              Close Window
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center items-center p-4 font-sans text-gray-900">
      
      <div className="w-full max-w-md">
        {/* Header Graphics */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-4 text-gray-400 mb-6">
            <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl shadow-sm">
              <span className="font-bold text-xl tracking-tight text-gray-900">Viri</span>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="h-[2px] w-8 bg-emerald-600 rounded-full"></div>
              <Lock size={18} className="text-emerald-600" />
              <div className="h-[2px] w-8 bg-emerald-600 rounded-full"></div>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl shadow-sm">
              <span className="font-bold text-xl tracking-tight text-emerald-700">MIB</span>
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Viri to MIB Connection</h1>
          <p className="text-sm text-gray-500 mt-2 text-center px-4">
            Securely link your MIB account to the Viri Cashier terminal.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden p-8">
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {(step === 'login' || step === 'otp') && (
            <div className="space-y-5">
              {/* MIB Info Notice */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-xl flex gap-3 text-emerald-800 text-sm leading-relaxed">
                <ShieldAlert size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-emerald-950">Notice:</span> MIB only accepts Authenticator OTP during new device setup. Please first setup your Authenticator and use the OTP generated by the application.
                </div>
              </div>

              <form onSubmit={step === 'login' ? handleLoginSubmit : handleOtpSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MIB Username</label>
                  <input
                    type="text"
                    required
                    autoFocus={step === 'login'}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Enter your MIB username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={step !== 'login' || loading}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MIB Password</label>
                  <input
                    type="password"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Enter your MIB password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={step !== 'login' || loading}
                  />
                </div>

                {step === 'login' && (
                  <button
                    type="submit"
                    disabled={loading || !username || !password || !accountId || !terminalId}
                    className="w-full py-3.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-medium transition-colors flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-md shadow-emerald-800/10"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                    {loading ? 'Authenticating...' : 'Secure Login'}
                  </button>
                )}

                {step === 'otp' && (
                  <div className="pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-4 duration-500 space-y-4">
                    <div className="text-center mb-2">
                      <p className="text-gray-600 text-sm">Please enter the 6-digit OTP sent to your registered device or authenticator app.</p>
                    </div>

                    <div>
                      <input
                        type="text"
                        required
                        autoFocus
                        maxLength={6}
                        className="w-full px-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-center text-2xl font-mono tracking-[0.5em] text-gray-900"
                        placeholder="000000"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        disabled={loading}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || otp.length < 5}
                      className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-600/20"
                    >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                      {loading ? 'Verifying...' : 'Verify Device'}
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {step === 'profile' && (
            <div className="pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="text-center mb-4">
                <p className="text-gray-600 text-sm">Select an operating profile to link:</p>
              </div>
              <div className="space-y-3">
                {profiles.map((p, i) => {
                  const name = p.name || p.customerProfileId || `Profile ${i + 1}`;
                  const type = p.profileType === '1' ? 'Business' : 'Personal';
                  const color = p.color || '#1a1a2e';
                  const initials = name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
                  const profileId = p.profileId || p.customerProfileId || '';
                  const profileType = p.profileType || '0';
                  return (
                    <button
                      key={profileId}
                      onClick={() => handleProfileSelect(profileId, profileType)}
                      disabled={loading}
                      className="w-full flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-all disabled:opacity-50 text-left"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{name}</div>
                        <div className="text-sm text-gray-500">{type}</div>
                      </div>
                      {loading ? (
                        <Loader2 size={18} className="animate-spin text-gray-400 flex-shrink-0" />
                      ) : (
                        <ArrowRight size={18} className="text-gray-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center space-y-6 py-6 animate-in zoom-in-95 duration-500">
              <div className="flex justify-center">
                <div className="bg-green-100 p-4 rounded-full">
                  <CheckCircle size={48} className="text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Connection Successful</h3>
                <p className="text-gray-500 mt-2 text-sm">Your Viri Cashier terminal has been securely linked to your MIB account.</p>
              </div>
              <button
                onClick={() => window.close()}
                className="w-full py-3.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-medium transition-colors"
              >
                Close Window
              </button>
            </div>
          )}

        </div>

        <div className="mt-8 text-center text-xs text-gray-400">
          <p>This is a secure connection portal provided by Viri.</p>
          <p>Your credentials are encrypted locally and used only for seamless session recovery.</p>
        </div>
      </div>
    </div>
  );
}
