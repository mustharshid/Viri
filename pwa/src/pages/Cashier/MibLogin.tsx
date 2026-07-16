import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';

export default function MibLogin() {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId');
  const terminalId = searchParams.get('terminalId');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'login' | 'otp' | 'success'>('login');

  const extensionId = localStorage.getItem('viri_extension_id') || '';
  const backendUrl = localStorage.getItem('viri_backend_url') || 
    (window.location.origin.includes('localhost') ? 'http://localhost:8000/api' : `${window.location.origin}/api`);

  useEffect(() => {
    if (!accountId || !terminalId) {
      setError('Missing required parameters (accountId or terminalId). Please launch this page from the Cashier Counter.');
    }
    if (!extensionId) {
      setError('Viri Extension is not linked. Please pair the cashier counter first.');
    }
  }, [accountId, terminalId, extensionId]);

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

    chrome.runtime.sendMessage(extensionId, {
      action: 'START_MIB_AUTH',
      payload: {
        username: username.trim(),
        password: password.trim(),
        terminalId: terminalId,
        bankAccountId: accountId,
        backendUrl: backendUrl,
        sanctumToken: localStorage.getItem('token') || '',
        hardwareId: terminalId
      }
    }, (response: any) => {
      setLoading(false);
      if (response && response.success) {
        if (response.requiresOtp) {
          setStep('otp');
        } else if (response.skipOtp) {
          setStep('success');
        }
      } else {
        setError(response?.error || 'Authentication failed. Please check your credentials.');
      }
    });
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 5) {
      setError('Please enter a valid OTP.');
      return;
    }
    
    setError(null);
    setLoading(true);

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
      setLoading(false);
      if (response && response.success) {
        setStep('success');
      } else {
        setError(response?.error || 'OTP Verification failed.');
      }
    });
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-center items-center p-4 font-sans text-gray-900">
      
      <div className="w-full max-w-md">
        {/* Header Graphics */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-4 text-gray-400 mb-6">
            <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl shadow-sm">
              <span className="font-bold text-xl tracking-tight text-gray-900">ViRi</span>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="h-[2px] w-8 bg-green-500 rounded-full"></div>
              <Lock size={18} className="text-green-500" />
              <div className="h-[2px] w-8 bg-green-500 rounded-full"></div>
            </div>

            <div className="bg-green-50 border border-green-100 p-3 rounded-xl shadow-sm">
              <span className="font-bold text-xl tracking-tight text-green-700">MIB</span>
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
              <form onSubmit={step === 'login' ? handleLoginSubmit : handleOtpSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MIB Username</label>
                  <input
                    type="text"
                    required
                    autoFocus={step === 'login'}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
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
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
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
                    className="w-full py-3.5 px-4 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium transition-colors flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-md shadow-gray-900/10"
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
                        className="w-full px-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all text-center text-2xl font-mono tracking-[0.5em] text-gray-900"
                        placeholder="000000"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        disabled={loading}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || otp.length < 5}
                      className="w-full py-3.5 px-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-green-600/20"
                    >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                      {loading ? 'Verifying...' : 'Verify Device'}
                    </button>
                  </div>
                )}
              </form>
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
          <p>Your passwords or usernames are never saved anywhere. We securely use tokens to authenticate users.</p>
        </div>
      </div>
    </div>
  );
}
