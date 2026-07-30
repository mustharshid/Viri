import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

interface FaqItem {
  id: string;
  question: string;
  answer: React.ReactNode;
}

interface FaqCategory {
  title: string;
  items: FaqItem[];
}

export default function FaqPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggleItem = (id: string) => {
    setOpenItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Particle Canvas Background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let particles: Array<{ baseX: number; baseY: number; x: number; y: number; alpha: number }> = [];
    let animationId: number | null = null;
    let mouse = { x: -1000, y: -1000 };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const CONFIG = {
      gap: 18,
      cols: 0,
      rows: 0,
      particleSize: 1.2,
      baseAlpha: 0.12,
      waveSpeed: 0.0008,
      waveAmplitude: 20,
      mouseRadius: 120,
      mouseRadiusSq: 14400,
      mouseInfluence: 0.3,
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

    function resize() {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initParticles();
    }

    function animate(time: number) {
      if (reducedMotion || !ctx) {
        drawStatic();
        return;
      }

      ctx.clearRect(0, 0, width, height);
      const mouseActive = mouse.x > -1000;
      const activeParticles: any[] = [];

      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${CONFIG.baseAlpha})`;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const waveX = Math.sin(p.baseX * 0.003 + time * CONFIG.waveSpeed) * CONFIG.waveAmplitude;
        const waveY = Math.cos(p.baseY * 0.004 + time * CONFIG.waveSpeed * 0.7) * CONFIG.waveAmplitude * 0.6;

        let isNearMouse = false;
        let dist = 999999;
        let dx = 0,
          dy = 0;

        if (mouseActive) {
          dx = mouse.x - p.baseX;
          dy = mouse.y - p.baseY;
          const distSq = dx * dx + dy * dy;
          if (distSq < CONFIG.mouseRadiusSq) {
            dist = Math.sqrt(distSq);
            isNearMouse = true;
          }
        }

        if (isNearMouse) {
          const mousePush = (1 - dist / CONFIG.mouseRadius) * CONFIG.mouseInfluence * CONFIG.waveAmplitude;
          const angle = Math.atan2(dy, dx);
          p.x = p.baseX + waveX + Math.cos(angle) * mousePush;
          p.y = p.baseY + waveY + Math.sin(angle) * mousePush;
          (p as any).dist = dist;
          activeParticles.push(p);
        } else {
          p.x = p.baseX + waveX;
          p.y = p.baseY + waveY;
          ctx.moveTo(p.x + CONFIG.particleSize, p.y);
          ctx.arc(p.x, p.y, CONFIG.particleSize, 0, Math.PI * 2);
        }
      }
      ctx.fill();

      for (let j = 0; j < activeParticles.length; j++) {
        const ap = activeParticles[j];
        const distFromMouse = ap.dist / CONFIG.mouseRadius;
        const alpha = CONFIG.baseAlpha + (1 - Math.min(distFromMouse, 1)) * 0.15;
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, CONFIG.particleSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }

      animationId = requestAnimationFrame(animate);
    }

    function drawStatic() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${CONFIG.baseAlpha})`;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx.moveTo(p.baseX + CONFIG.particleSize, p.baseY);
        ctx.arc(p.baseX, p.baseY, CONFIG.particleSize, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    resize();
    if (!reducedMotion) {
      animationId = requestAnimationFrame(animate);
    } else {
      drawStatic();
    }

    const handleResize = () => {
      resize();
      if (reducedMotion) drawStatic();
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const categories: FaqCategory[] = [
    {
      title: 'Security & Privacy',
      items: [
        {
          id: 'sec-1',
          question: 'Is Viri secure? Will my banking credentials be safe?',
          answer: (
            <p>
              <strong>Absolutely.</strong> Your banking credentials never touch Viri's servers. To ensure seamless functionality, the extension securely hashes and stores passwords strictly on your local device. Because we use a zero-knowledge architecture, Viri's servers only interact with read-only session tokens, meaning we have absolutely zero access to your passwords, and they stay entirely under your control.
            </p>
          ),
        },
        {
          id: 'sec-2',
          question: 'What exactly are "local hashing" and "read-only tokens," and how do they keep me safe?',
          answer: (
            <>
              <p>Think of these as a two-layer security shield that ensures you have full control over your data, while completely removing the risk of unauthorized account access.</p>
              <p>
                <strong>Local Hashing:</strong> When you type in your password, the Viri extension instantly scrambles it into a "hash"—a unique, mathematically irreversible string of random characters. This scrambling happens entirely on your own device before anything is saved. Because it is a one-way street, a hash cannot be converted back into your real password.
              </p>
              <p>
                <strong>Read-Only Session Tokens:</strong> When Viri communicates with your bank to pull your data, it uses a temporary digital pass called a token. This token is strictly "read-only." It gives Viri permission to securely display your account information, but it is mathematically impossible for the token to authorize transfers, move money, or change your account settings.
              </p>
            </>
          ),
        },
      ],
    },
    {
      title: 'Banks & Accounts',
      items: [
        {
          id: 'bank-1',
          question: 'Which banks does Viri support?',
          answer: <p>Currently, Viri supports the two primary banks used by Maldivian businesses (BML and MIB). We will add support for other banks if there is demand.</p>,
        },
        {
          id: 'bank-2',
          question: 'Can I connect/view both personal and business accounts?',
          answer: <p>Yes. Viri allows you to add both personal and business accounts from both banks, as well as sole proprietorships. All your balances and transactions appear in one unified dashboard, regardless of account type.</p>,
        },
        {
          id: 'bank-3',
          question: 'How many bank accounts can I connect?',
          answer: (
            <p>
              The Starter plan includes 2 accounts, and the Pro plan includes 4. The Pro plan allows you to purchase <strong>extra bank account slots</strong> modularly as your business grows.
            </p>
          ),
        },
      ],
    },
    {
      title: 'Setup & Access',
      items: [
        {
          id: 'setup-1',
          question: 'Do I need to install anything to use Viri?',
          answer: (
            <p>
              Yes. To connect your bank accounts, you'll need to install our lightweight <strong>Chrome Extension</strong> once on each terminal. It acts as a secure bridge between your browser and your bank. The extension is simple to install and you can forget about it afterward.
            </p>
          ),
        },
        {
          id: 'setup-2',
          question: 'How do I connect my bank account?',
          answer: <p>After creating your company account and completing onboarding, you'll be guided through a simple one‑time setup on the first terminal. The Chrome extension securely links your accounts to Viri, no repeated logins required.</p>,
        },
        {
          id: 'setup-3',
          question: 'Will my session expire? Do I need to keep logging in?',
          answer: (
            <p>
              No. Once you authenticate, <strong>your session persists</strong>, even if you restart your computer or close your browser. You're ready to go the moment you return to Viri.
            </p>
          ),
        },
        {
          id: 'setup-4',
          question: 'Do I need to install Viri?',
          answer: (
            <p>
              No. Viri is a <strong>Progressive Web App (PWA)</strong>. No installation required, as it works inside your browser. Optionally however, an installation option is available for those who desire it. It works on any device with a browser.
            </p>
          ),
        },
      ],
    },
    {
      title: 'Tools & Features',
      items: [
        {
          id: 'tool-1',
          question: 'What exactly does the Verification Panel do?',
          answer: (
            <p>
              The Verification Panel is designed for quick on‑the‑spot checks. You can search for transactions by <strong>target amount</strong> to instantly verify if a specific payment has arrived. It also displays a preview of the <strong>3 most recent relevant transactions</strong>, perfect for daily verification without diving into full ledgers.
            </p>
          ),
        },
        {
          id: 'tool-2',
          question: 'Can I see all my transactions in one place?',
          answer: (
            <p>
              Yes. The <strong>Unified Transaction Ledger</strong> combines transactions from all your linked accounts into a single dashboard. Switch between separate accounts. You can filter by date, bank, transaction type, or amount, reference number, and search for specific entries instantly. <em>(Available on the Pro plan.)</em>
            </p>
          ),
        },
        {
          id: 'tool-3',
          question: 'What kind of reports can I generate?',
          answer: (
            <>
              <p>Viri's Reports Suite includes:</p>
              <ul>
                <li><strong>Cash Flow Summary</strong> – overall inflow vs. outflow.</li>
                <li><strong>Period Comparison</strong> – compare months or years.</li>
                <li><strong>Activity by Account</strong> – breakdown per bank account.</li>
                <li><strong>Trend Analysis</strong> – identify spending or revenue patterns.</li>
                <li><strong>Transaction Volume</strong> – count of transactions over time.</li>
              </ul>
              <p>
                All reports can be exported as <strong>PDF Summaries</strong> or <strong>Excel/CSV</strong> files. <em>(Available on the Pro plan.)</em>
              </p>
            </>
          ),
        },
        {
          id: 'tool-4',
          question: 'Can I generate bank statements directly from Viri?',
          answer: (
            <p>
              Yes. The <strong>On‑Demand Statement Generator</strong> allows you to generate official statements directly from your bank for any date range, directly from your linked accounts. Download instantly as PDF or CSV. <em>(Available on the Pro plan.)</em>
            </p>
          ),
        },
      ],
    },
    {
      title: 'Team & Collaboration',
      items: [
        {
          id: 'team-1',
          question: 'Can I share Viri with my team?',
          answer: (
            <p>
              Yes. Viri is designed for a wide range of employees, from cashiers to finance and operations teams. This is the core concept behind our customizable terminals. You can give your team <strong>read‑only access</strong> to bank data without sharing passwords. They can generate reports and view transactions on demand.
            </p>
          ),
        },
        {
          id: 'team-2',
          question: 'Can I restrict what my team members see, like specific bank accounts or cash outflows?',
          answer: (
            <p>
              Absolutely. Viri gives you granular control over user permissions through our customizable terminals. You can easily enable or disable specific features, restrict visibility to certain bank accounts, or hide sensitive data like cash outflows and expenditures. This ensures your staff only sees the exact data required for their role, keeping the rest of your financial information completely private and secure.
            </p>
          ),
        },
        {
          id: 'team-3',
          question: 'Is Viri only for large businesses?',
          answer: <p>Not at all. Viri is built for businesses of all sizes, from retail chains with multiple locations to growing businesses that need better cash flow visibility. If you manage multiple accounts and want to save time, Viri is for you.</p>,
        },
      ],
    },
    {
      title: 'Pricing & Billing',
      items: [
        {
          id: 'price-1',
          question: 'Is Viri free? What are the pricing plans?',
          answer: (
            <>
              <p>Viri offers two paid tiers:</p>
              <ul>
                <li><strong>Starter</strong> – 499 MVR/month. Includes Verification Panel, 2 bank accounts, and 1 terminal.</li>
                <li><strong>Pro</strong> – 989 MVR/month. Includes the full tool suite (Ledger, Reports, Statement Generator), 4 bank accounts, 3 terminals, and priority support.</li>
              </ul>
              <p>The Pro plan is highly modular: you can add extra bank accounts or terminals as you scale.</p>
              <p><strong>We offer a free trial</strong> so you can experience the Pro plan before committing.</p>
            </>
          ),
        },
        {
          id: 'price-2',
          question: 'Can I upgrade from Starter to Pro later?',
          answer: <p>Yes – you can upgrade or downgrade at any time. Your data and connected accounts remain intact. Changes take effect on your next billing cycle.</p>,
        },
        {
          id: 'price-3',
          question: 'What happens if I exceed my bank account or terminal limit?',
          answer: <p>You'll receive a notification. You can either upgrade to Pro or purchase additional slots as add‑ons (+100 MVR per extra bank account, +80 MVR per extra terminal).</p>,
        },
        {
          id: 'price-4',
          question: 'How do I know when to pay?',
          answer: <p>Viri will notify you early via your terminals, reminding you when your payment is due. You'll have plenty of advance notice to ensure uninterrupted service.</p>,
        },
      ],
    },
  ];

  return (
    <div className="viri-landing-root">
      <canvas id="particle-canvas" ref={canvasRef}></canvas>

      <nav className="nav" role="navigation" aria-label="Main navigation">
        <Link to="/" className="nav-logo" aria-label="Viri home">
          <img src="/img/logo_en.png" alt="Viri" width="160" height="40" decoding="async" />
        </Link>
        <div className="nav-links">
          <Link to="/faq" className="nav-link active">FAQ</Link>
          <Link to="/login" className="nav-signin">Sign in</Link>
          <Link to="/register" className="btn-primary">Get started</Link>
        </div>
      </nav>

      <section className="faq-section">
        <div className="container">
          <div className="faq-header">
            <h1 className="display-lg">Frequently Asked Questions</h1>
            <p className="body-md">Everything you need to know about Viri</p>
          </div>

          <div className="faq-content">
            {categories.map((cat, catIdx) => (
              <div key={catIdx} className="faq-category">
                <h2 className="faq-category-title">{cat.title}</h2>

                {cat.items.map((item) => {
                  const isOpen = !!openItems[item.id];
                  return (
                    <div key={item.id} className={`faq-item ${isOpen ? 'active' : ''}`}>
                      <button
                        className="faq-question"
                        aria-expanded={isOpen}
                        onClick={() => toggleItem(item.id)}
                      >
                        <span>{item.question}</span>
                        <svg
                          className="faq-icon"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                      <div
                        className="faq-answer"
                        style={{
                          maxHeight: isOpen ? '1000px' : '0px',
                          transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                          overflow: 'hidden',
                        }}
                      >
                        <div className="faq-answer-content">{item.answer}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div className="footer-brand">
              <img src="/img/logo_en.png" alt="Viri" width="100" height="28" decoding="async" loading="lazy" />
              <span className="footer-tagline">Pioneering unified banking in the Maldives</span>
            </div>
            <div className="footer-links">
              <Link to="/faq">FAQ</Link>
              <Link to="/login">Sign in</Link>
              <Link to="/register">Get started</Link>
              <a href="#">Security</a>
            </div>
          </div>
          <p className="footer-copy">Built for Maldivian businesses. By Maldivian builders.</p>
        </div>
      </footer>
    </div>
  );
}
