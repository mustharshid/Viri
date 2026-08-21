import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../../landing.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Particle background for Auth page
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed. Check your credentials.');
      }

      localStorage.setItem('viri_token', data.access_token);

      if (data.user.role === 'superadmin') {
        navigate('/admin');
      } else {
        navigate('/company');
      }
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

      <main className="auth-page auth-page-compact">
        <div className="auth-card auth-card-compact">
          <Link to="/" aria-label="Viri home">
            <img src="/img/logo_en.png" alt="Viri" className="auth-logo" width="130" height="32" decoding="async" />
          </Link>

          <div className="auth-header">
            <h1>Welcome back</h1>
            <p>Log in to manage your Viri account.</p>
          </div>

          <form className="auth-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                className="form-input"
                type="email"
                id="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                className="form-input"
                type="password"
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}

            <button type="submit" disabled={loading} className="form-btn" style={{ opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </form>

          <p className="form-footer">
            Don't have an account? <Link to="/register">Register your company</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
