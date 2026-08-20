import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle, ArrowRight, Loader2, ShieldAlert } from 'lucide-react';

export default function MibLogin() {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId');
  const accountNumber = searchParams.get('accountNumber') || '';
  const terminalId = searchParams.get('terminalId');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'login' | 'otp' | 'profile' | 'success'>('login');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [resumeFlow, setResumeFlow] = useState(false);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [accessDeniedReason, setAccessDeniedReason] = useState<string | null>(null);

  // OTP method selector (mirrors the new MIB app — server returns otpTypes/primaryOTPType)
  const [otpMethods, setOtpMethods] = useState<{ name: string; code: string }[]>([]);
  const [selectedOtpType, setSelectedOtpType] = useState('3');
  const [primaryOtpType, setPrimaryOtpType] = useState<string | null>(null);
  const [otpAutoSent, setOtpAutoSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const OTP_NAMES: Record<string, string> = { '1': 'Email', '2': 'Text message (SMS)', '3': 'Authenticator', '5': 'PIN' };

  const buildOtpMethods = (otpTypes: any, primary: any) => {
    const methods: { name: string; code: string }[] = [];
    if (Array.isArray(otpTypes)) {
      for (const c of otpTypes) {
        const code = String(c);
        methods.push({ name: OTP_NAMES[code] || `Channel ${code}`, code });
      }
    } else if (otpTypes && typeof otpTypes === 'object') {
      for (const [k, v] of Object.entries(otpTypes)) {
        methods.push({ name: k, code: String(v) });
      }
    }
    if (methods.length === 0) methods.push({ name: 'Text message (SMS)', code: '2' });
    setOtpMethods(methods);
    const primaryCode = primary ? String(primary) : null;
    setPrimaryOtpType(primaryCode);
    const preferred = primaryCode && methods.some(m => m.code === primaryCode) ? primaryCode : methods[0].code;
    setSelectedOtpType(preferred);
  };

  const sendResend = (silent = false) => {
    if (resending || resendIn > 0) return;
    setResending(true);
    chrome.runtime.sendMessage(extensionId, {
      action: 'SUBMIT_MIB_RESEND',
      payload: { mibUsername: username.trim(), otpType: selectedOtpType }
    }, (response: any) => {
      setResending(false);
      if (response && response.success) {
        setResendIn(30);
        const timer = setInterval(() => setResendIn(prev => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        }), 1000);
      } else if (!silent) {
        setError(response?.error || 'Failed to resend OTP.');
      }
    });
  };

  // Mirror the new app's auto-send: send SMS once when SMS is the selected method.
  useEffect(() => {
    if (step === 'otp' && !otpAutoSent && selectedOtpType === '2') {
      setOtpAutoSent(true);
      sendResend(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedOtpType, otpAutoSent]);

  const selectedMethodName = otpMethods.find(m => m.code === selectedOtpType)?.name || OTP_NAMES[selectedOtpType] || '';
  const primaryMethodName = primaryOtpType
    ? (otpMethods.find(m => m.code === primaryOtpType)?.name || OTP_NAMES[primaryOtpType] || '')
    : '';

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

  // Gateway: If the account's MIB group already exists on the server (this terminal or a
  // sibling registered it before), offer the shared "Choose Profile" list instead of forcing
  // a fresh login. Only falls back to the login form when no registered keys exist yet.
  useEffect(() => {
    if (!accountId || !extensionId || !pairedHardwareId) return;

    let cancelled = false;
    const checkGroup = async () => {
      try {
        const resp: any = await new Promise((resolve) => {
          chrome.runtime.sendMessage(extensionId, {
            action: 'GET_MIB_PROFILES',
            payload: {
              terminalId,
              backendUrl,
              accountId,
              accountNumber,
              sanctumToken: localStorage.getItem('viri_token') || ''
            }
          }, resolve);
        });
        if (cancelled) return;
        if (resp?.ok && !resp.needsLogin && Array.isArray(resp.profiles) && resp.profiles.length > 0) {
          const profileList = resp.profiles.map((p: any) => ({
            profileId: p.profile_id || p.customerProfileId || '',
            profileType: p.profile_type || '0',
            profileName: p.profile_name || '',
            color: '#1a1a2e'
          }));
          setProfiles(profileList);
          // If only one profile exists, resume that account automatically (no picker tap needed).
          if (profileList.length === 1) {
            await resumeAndSelect(profileList[0], resp);
          } else {
            setResumeFlow(true);
            setUsername(resp.mib_username || '');
            setPassword(resp.mib_password || '');
            setStep('profile');
          }
        }
      } catch {
        if (cancelled) return;
        // Fall through to the normal login flow
      }
    };
    checkGroup();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, accountNumber, extensionId, terminalId, pairedHardwareId]);

  const resumeAndSelect = async (profile: any, resp: any) => {
    setLoading(true);
    setError(null);
    try {
      const timeoutId = setTimeout(() => {
        setLoading(false);
        setError('Profile selection timed out.');
      }, 45000);
      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage(extensionId, {
          action: 'SELECT_MIB_PROFILE_ON_SESSION',
          payload: {
            accountId,
            accountNumber,
            terminalId,
            backendUrl,
            profileId: profile.profileId,
            profileType: profile.profileType,
            mibUsername: resp?.mib_username || profile.profile_mib_username || '',
            mibPassword: resp?.mib_password || profile.profile_mib_password || '',
            sanctumToken: localStorage.getItem('viri_token') || ''
          }
        }, resolve);
      });
      clearTimeout(timeoutId);
      setLoading(false);
      if (response && response.success) {
        setUsername(resp?.mib_username || profile.profile_mib_username || '');
        setPassword(resp?.mib_password || profile.profile_mib_password || '');
        setStep('success');
      } else if (response && response.needsLogin) {
        // Server group exists but no stored password/keys for this terminal —
        // the cashier must sign in once here, then resume is seamless after.
        setResumeFlow(false);
        setStep('login');
        setError('This terminal needs one-time MIB sign-in before it can reuse the shared profiles.');
      } else {
        setError(response?.error || 'Profile selection failed on existing session.');
      }
    } catch (e: any) {
      setLoading(false);
      setError(`Extension error: ${e.message}`);
    }
  };

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
          sanctumToken: localStorage.getItem('viri_token') || '',
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
            buildOtpMethods(response.otpTypes, response.primaryOtpType);
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
          sanctumToken: localStorage.getItem('viri_token') || '',
          otpType: selectedOtpType   // extension maps SMS '2' → '3' verify workaround
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
    if (resumeFlow) {
      resumeAndSelect({ profileId, profileType }, { mib_username: username, mib_password: password });
      return;
    }
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
                  <span className="font-semibold text-emerald-950">Notice:</span> MIB uses your default OTP method (shown on the next screen). You may also receive a code by SMS automatically — only enter the code for the method you select below. Choose your method and resend if needed.
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
                      {selectedOtpType === '2' ? (
                        <p className="text-gray-600 text-sm">
                          Enter the 6-digit code sent by <strong>SMS</strong> to your registered phone number.
                        </p>
                      ) : selectedOtpType === '3' ? (
                        <p className="text-gray-600 text-sm">
                          Enter the 6-digit code from your <strong>MIB Authenticator</strong> app.
                        </p>
                      ) : (
                        <p className="text-gray-600 text-sm">
                          Enter the 6-digit code from your {selectedMethodName || 'selected'} method.
                        </p>
                      )}
                      {otpMethods.length > 1 && (
                        <p className="text-xs text-amber-600 mt-1">
                          {primaryOtpType === selectedOtpType
                            ? 'This is your default MIB method. You may also receive a code by another channel — only the code for the method selected above will verify.'
                            : `You switched from your default method (${primaryMethodName}). Make sure you have a code from the method selected above.`}
                        </p>
                      )}
                    </div>

                    {otpMethods.length > 1 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">OTP Method</label>
                        <select
                          value={selectedOtpType}
                          onChange={(e) => {
                            const next = e.target.value;
                            setSelectedOtpType(next);
                            // If switching to SMS, allow a fresh auto-send for that channel
                            if (next === '2') setOtpAutoSent(false);
                            setOtp('');
                          }}
                          disabled={loading}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-gray-900 disabled:opacity-60"
                        >
                          {otpMethods.map(m => (
                            <option key={m.code} value={m.code}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

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

                    <button
                      type="button"
                      onClick={() => sendResend(false)}
                      disabled={loading || resending || resendIn > 0}
                      className="w-full py-3 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      {resendIn > 0 ? `Resend OTP in ${resendIn}s` : resending ? 'Sending...' : 'Resend OTP'}
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
                  const name = p.profileName || p.name || p.customerProfileId || `Profile ${i + 1}`;
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
