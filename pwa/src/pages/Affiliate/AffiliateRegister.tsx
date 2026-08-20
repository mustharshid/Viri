import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  DollarSign, TrendingUp, Sparkles, ArrowRight, RefreshCw, AlertCircle, Check 
} from 'lucide-react';

export default function AffiliateRegister() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [programHeadline, setProgramHeadline] = useState('Earn 15% to 25% recurring monthly commissions.');

  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/referrals/public-config')
      .then(res => res.json())
      .then(data => {
        if (data && data.program_headline) {
          setProgramHeadline(data.program_headline);
        }
      })
      .catch(() => {});
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== passwordConfirmation) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (!agreeTerms) {
      setError('You must agree to the Viri Partner Terms of Service.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/affiliate/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          phone_number: phoneNumber,
          password,
          password_confirmation: passwordConfirmation,
          custom_referral_code: customCode.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Registration failed. Please check your inputs.');
      }

      localStorage.setItem('viri_token', data.access_token);
      navigate('/affiliate');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090d] text-white flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* Navigation */}
      <nav className="h-16 border-b border-white/10 bg-black/40 backdrop-blur-xl sticky top-0 z-40 px-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src="/img/logo_en.png" alt="Viri" className="h-7 w-auto object-contain" />
        </Link>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <Link to="/login" className="text-zinc-400 hover:text-white transition-colors">Sign in</Link>
          <Link to="/register" className="text-zinc-400 hover:text-white transition-colors">Customer Signup</Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        {/* Glow Spheres */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch relative z-10">
          
          {/* Left Column: Perks & Value Proposition */}
          <div className="lg:col-span-5 flex flex-col justify-between rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-zinc-950/80 to-black p-8 backdrop-blur-xl shadow-2xl">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles size={14} /> Partner Program
              </div>

              <h1 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
                {programHeadline}
              </h1>

              <p className="text-zinc-400 text-sm leading-relaxed">
                Join our network of partners, accountants, POS installers, and agencies helping Maldivian businesses streamline bank transfer verification.
              </p>

              <div className="flex flex-col gap-4 mt-2">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                    <Check size={14} />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-white">Dual-Sided Incentive</h2>
                    <p className="text-[11px] text-zinc-400">Referred customers get discounts on their 1st invoice, maximizing conversion rates.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                    <TrendingUp size={14} />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-white">Dynamic Upgrade Scaling</h2>
                    <p className="text-[11px] text-zinc-400">When clients upgrade to larger plans, your monthly commission scales up automatically.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                    <DollarSign size={14} />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-white">Direct BML & MIB Payouts</h2>
                    <p className="text-[11px] text-zinc-400">Fast, reliable local bank payouts in Maldivian Rufiyaa (MVR) with zero transaction fees.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
              <span>Already a partner?</span>
              <Link to="/login" className="text-emerald-400 font-bold hover:underline flex items-center gap-1">
                Log in <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {/* Right Column: Registration Form */}
          <div className="lg:col-span-7 rounded-3xl border border-white/10 bg-zinc-950/80 p-8 backdrop-blur-xl shadow-2xl flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Create your Partner Account</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Instant approval. Your unique referral link will be ready immediately.
              </p>

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleRegister} className="mt-6 flex flex-col gap-4">
                
                {/* Personal Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-300">Your Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Ahmed Ali"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-300">Email Address</label>
                    <input
                      type="email"
                      placeholder="ahmed@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-300">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="e.g. 7771234"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-300">Custom Referral Code (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. AHMED20"
                      value={customCode}
                      onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                      className="px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white font-mono uppercase placeholder:text-zinc-600 focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Password Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-300">Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-300">Confirm Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={passwordConfirmation}
                      onChange={(e) => setPasswordConfirmation(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Terms Agreement */}
                <div className="flex items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="agree-partner-terms"
                    required
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="accent-emerald-500 mt-1 cursor-pointer"
                  />
                  <label htmlFor="agree-partner-terms" className="text-[11px] text-zinc-400 cursor-pointer">
                    I agree to the Viri Partner Program Terms, commission payout rules, and ethical promotion policy.
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {loading ? 'Creating Partner Account...' : 'Join Viri Partner Program'}
                </button>

                <p className="text-[11px] text-center text-zinc-500 mt-1">
                  💡 You can configure your BML or MIB payout bank account anytime inside your partner dashboard.
                </p>
              </form>
            </div>
          </div>

        </div>
      </main>

    </div>
  );
}
