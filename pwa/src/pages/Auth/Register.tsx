import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../../landing.css';

export default function Register() {
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      <main className="auth-page">
        <div className="auth-card">
          <Link to="/" aria-label="Viri home">
            <img src="/img/logo_en.png" alt="Viri" className="auth-logo" width="160" height="40" decoding="async" />
          </Link>

          <div className="auth-header">
            <h1>Create your company</h1>
            <p>Start verifying bank transfers securely.</p>
          </div>

          <form className="auth-form" onSubmit={handleRegister}>
            <div className="form-group">
              <label className="form-label" htmlFor="company-name">Company Name</label>
              <input
                className="form-input"
                type="text"
                id="company-name"
                required
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
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="admin-email">Admin Email</label>
              <input
                className="form-input"
                type="email"
                id="admin-email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="admin-phone">Admin Phone Number</label>
              <input
                className="form-input"
                type="tel"
                id="admin-phone"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                className="form-input"
                type="password"
                id="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">Confirm Password</label>
              <input
                className="form-input"
                type="password"
                id="confirm-password"
                required
                minLength={8}
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
              />
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
                  className="modal-link"
                  onClick={() => setActiveModal('terms')}
                  style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'underline', color: 'inherit', cursor: 'pointer' }}
                >
                  Terms of Service
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  className="modal-link"
                  onClick={() => setActiveModal('privacy')}
                  style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'underline', color: 'inherit', cursor: 'pointer' }}
                >
                  Privacy Policy
                </button>
                , and confirm I'm authorised to connect the accounts I'd like to link.
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
