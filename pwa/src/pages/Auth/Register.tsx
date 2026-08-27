import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import '../../landing.css';

export default function Register() {
  const [searchParams] = useSearchParams();
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>(searchParams.get('plan') || 'free');
  const [referralCode, setReferralCode] = useState(searchParams.get('ref') || '');
  const [referralDiscount, setReferralDiscount] = useState<any>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/public-plans')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPlans(data);
          const paramPlan = searchParams.get('plan');
          if (paramPlan && data.some((p: any) => p.tier_key === paramPlan)) {
            setSelectedPlan(paramPlan);
          }
        }
      })
      .catch(() => {});
  }, [searchParams]);

  useEffect(() => {
    const code = searchParams.get('ref');
    if (code) {
      setReferralCode(code);
      validateCode(code);
    }
  }, [searchParams]);

  const validateCode = async (code: string) => {
    if (!code.trim()) {
      setReferralDiscount(null);
      return;
    }
    try {
      const res = await fetch(`/api/ref/${encodeURIComponent(code.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setReferralDiscount(data);
      } else {
        setReferralDiscount(null);
      }
    } catch (e) {
      setReferralDiscount(null);
    }
  };

  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);

  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Particle background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let particles: Array<{ baseX: number; baseY: number; x: number; y: number; alpha: number }> = [];
    let animationId: number | null = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const CONFIG = {
      gap: 20,
      cols: 0,
      rows: 0,
      particleSize: 1.2,
      baseAlpha: 0.12,
      waveSpeed: 0.0008,
      waveAmplitude: 15,
    };

    function initParticles() {
      particles = [];
      CONFIG.cols = Math.ceil(width / CONFIG.gap) + 2;
      CONFIG.rows = Math.ceil(height / CONFIG.gap) + 2;
      const offsetX = (width - CONFIG.cols * CONFIG.gap) / 2;
      const offsetY = (height - CONFIG.rows * CONFIG.gap) / 2;

      for (let col = 0; col < CONFIG.cols; col++) {
        for (let row = 0; row < CONFIG.rows; row++) {
          particles.push({
            baseX: offsetX + col * CONFIG.gap,
            baseY: offsetY + row * CONFIG.gap,
            x: 0,
            y: 0,
            alpha: CONFIG.baseAlpha,
          });
        }
      }
    }

    function animate(time: number) {
      if (reducedMotion || !ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${CONFIG.baseAlpha})`;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const waveX = Math.sin(p.baseX * 0.003 + time * CONFIG.waveSpeed) * CONFIG.waveAmplitude;
        const waveY = Math.cos(p.baseY * 0.004 + time * CONFIG.waveSpeed * 0.7) * CONFIG.waveAmplitude * 0.6;
        p.x = p.baseX + waveX;
        p.y = p.baseY + waveY;
        ctx.moveTo(p.x + CONFIG.particleSize, p.y);
        ctx.arc(p.x, p.y, CONFIG.particleSize, 0, Math.PI * 2);
      }
      ctx.fill();
      animationId = requestAnimationFrame(animate);
    }

    initParticles();
    if (!reducedMotion) {
      animationId = requestAnimationFrame(animate);
    }

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initParticles();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
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
      setError('You must agree to the Terms of Service and Privacy Policy.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          company_name: companyName,
          name,
          email,
          phone_number: phoneNumber,
          password,
          password_confirmation: passwordConfirmation,
          subscription_tier: selectedPlan,
          referral_code: referralCode.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed. Check your inputs.');
      }

      localStorage.setItem('viri_token', data.access_token);
      navigate('/company');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedPlanObj = plans.find((p) => p.tier_key === selectedPlan);

  return (
    <div className="viri-landing-root">
      <canvas id="particle-canvas" ref={canvasRef}></canvas>

      <nav className="nav" role="navigation" aria-label="Main navigation">
        <Link to="/" className="nav-logo" aria-label="Viri home">
          <img src="/img/logo_en.png" alt="Viri" width="160" height="40" decoding="async" />
        </Link>
        <div className="nav-links">
          <Link to="/faq" className="nav-link">FAQ</Link>
          <Link to="/login" className="nav-signin">Sign in</Link>
          <Link to="/register" className="btn-primary">Get started</Link>
        </div>
      </nav>

      <main className="auth-page auth-page-compact">
        <div className="auth-card auth-card-compact auth-card-register">
          <Link to="/" aria-label="Viri home">
            <img src="/img/logo_en.png" alt="Viri" className="auth-logo" width="130" height="32" decoding="async" />
          </Link>

          <div className="auth-header">
            <h1>Create your company</h1>
            <p>Start verifying bank transfers securely.</p>
          </div>

          <form className="auth-form" onSubmit={handleRegister}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="company-name">Company Name</label>
                <input
                  className="form-input"
                  type="text"
                  id="company-name"
                  required
                  placeholder="e.g. Acme Maldives"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="admin-name">Admin Name</label>
                <input
                  className="form-input"
                  type="text"
                  id="admin-name"
                  required
                  placeholder="e.g. Ahmed Ali"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="admin-email">Email</label>
                <input
                  className="form-input"
                  type="email"
                  id="admin-email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="admin-phone">Phone</label>
                <input
                  className="form-input"
                  type="tel"
                  id="admin-phone"
                  required
                  placeholder="7700000"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
            </div>

            {/* Plan Selector */}
            <div className="form-group">
              <div className="flex items-center justify-between">
                <label className="form-label" htmlFor="plan-select">Subscription Plan</label>
                {selectedPlanObj && (
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    {selectedPlanObj.price === 0 ? 'Free Trial' : `MVR ${parseFloat(selectedPlanObj.price).toLocaleString()}/mo`}
                  </span>
                )}
              </div>
              <select
                id="plan-select"
                className="form-select"
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
              >
                {plans.length > 0 ? (
                  plans.map((p) => (
                    <option key={p.tier_key} value={p.tier_key}>
                      {p.name} — {p.price === 0 ? 'Free' : `MVR ${parseFloat(p.price).toLocaleString()}/mo`} ({p.max_terminals} {p.max_terminals === 1 ? 'Terminal' : 'Terminals'})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="free">Free Trial — MVR 0 (1 Terminal, 20 Checks)</option>
                    <option value="499">Starter Plan — MVR 499/mo (1 Terminal, 300 Checks)</option>
                    <option value="999">Growth Plan — MVR 999/mo (3 Terminals, Unlimited)</option>
                    <option value="1999">Enterprise Plan — MVR 1,999/mo (10 Terminals, Unlimited)</option>
                  </>
                )}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="password">Password</label>
                <input
                  className="form-input"
                  type="password"
                  id="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="confirm-password">Confirm</label>
                <input
                  className="form-input"
                  type="password"
                  id="confirm-password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                />
              </div>
            </div>

            {/* Referral / Partner Discount */}
            <div className="form-group">
              <div className="flex items-center justify-between">
                <label className="form-label" htmlFor="referral-code">Referral / Promo Code</label>
                {referralDiscount?.valid && (
                  <span className="text-[10px] font-bold text-emerald-400 font-mono">
                    ✓ {referralDiscount.discount_badge}
                  </span>
                )}
              </div>
              <input
                className={`form-input font-mono uppercase ${referralDiscount?.valid ? 'border-emerald-500 bg-emerald-950/20' : ''}`}
                type="text"
                id="referral-code"
                placeholder="OPTIONAL PROMO CODE"
                value={referralCode}
                onChange={(e) => {
                  const val = e.target.value;
                  setReferralCode(val);
                  validateCode(val);
                }}
              />
              {referralDiscount?.valid && (
                <p className="text-[10px] text-emerald-300 mt-0.5">
                  Referred by <strong>{referralDiscount.partner_name}</strong>. Discount applies to 1st invoice!
                </p>
              )}
            </div>

            <div className="form-checkbox-group">
              <input
                className="form-checkbox"
                type="checkbox"
                id="agree-terms"
                required
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
              />
              <label className="form-checkbox-label" htmlFor="agree-terms">
                I agree to the{' '}
                <button
                  type="button"
                  onClick={() => setActiveModal('terms')}
                  style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'underline', color: 'inherit', cursor: 'pointer' }}
                >
                  Terms
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => setActiveModal('privacy')}
                  style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'underline', color: 'inherit', cursor: 'pointer' }}
                >
                  Privacy Policy
                </button>.
              </label>
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}

            <button type="submit" disabled={loading} className="form-btn" style={{ opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Creating Account...' : 'Register Company'}
            </button>
          </form>

          <p className="form-footer">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </main>

      {/* Terms of Service Modal */}
      {activeModal === 'terms' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Terms of Service</h2>
              <button className="modal-close" onClick={() => setActiveModal(null)} aria-label="Close modal">&times;</button>
            </div>
            <div className="modal-body">
              <p className="modal-effective-date">Effective Date: 23rd July 2026</p>

              <h3>1. Acceptance of Terms</h3>
              <p>By accessing or using Viri, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you must not use the Service.</p>

              <h3>2. User Eligibility</h3>
              <p>To use Viri, you must be a registered business entity, or an individual authorised to act on behalf of a registered business entity, and have the authority to connect the relevant bank accounts to the Service.</p>

              <h3>3. Service Description</h3>
              <p>Viri is a business dashboard that aggregates data from connected bank accounts into a single view. The Service includes:</p>
              <ul>
                <li>A web based dashboard accessible as a Progressive Web App (PWA), usable on any device.</li>
                <li>A Chrome Extension that acts as a secure bridge between your browser and your bank's website.</li>
                <li>Instant verification tools, unified transaction ledgers, cash flow reports, and statement generation.</li>
              </ul>

              <h3>4. Account Security & Responsibilities</h3>
              <p>You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.</p>

              <h3>5. Intellectual Property</h3>
              <p>All rights, titles, and interests in and to the Viri application, website, and services belong exclusively to Viri and its licensors.</p>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {activeModal === 'privacy' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Privacy Policy</h2>
              <button className="modal-close" onClick={() => setActiveModal(null)} aria-label="Close modal">&times;</button>
            </div>
            <div className="modal-body">
              <p className="modal-effective-date">Effective Date: 23rd July 2026</p>

              <h3>1. Information We Collect</h3>
              <p>We collect registration information (Company Name, Admin Name, Email, Phone Number) and encrypted, hashed tokens required to display your bank transaction feeds.</p>

              <h3>2. How We Use Information</h3>
              <p>Your information is used strictly to provide, maintain, and secure the Viri service. We do not sell your personal data or transaction history to third parties.</p>

              <h3>3. Data Storage & Cryptography</h3>
              <p>Your banking passwords never touch Viri servers. They are scrambled via local one-way hashing directly inside your Chrome Extension.</p>

              <h3>4. Security</h3>
              <p>We implement industry-standard encryption protocols (HTTPS/TLS) and read-only access controls to safeguard your financial visibility.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
