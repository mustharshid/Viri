import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

const CAROUSEL_TITLES = [
  'Verification Panel',
  'Transaction Ledger',
  'Reports Suite',
  'Statement Generator',
];

const CAROUSEL_SUBTITLES = [
  'Search by target amount to find and verify specific payments across all connected accounts.',
  'Unified, real-time view of every transaction across all linked bank accounts.',
  'Turn transaction data into actionable business intelligence with one-click report generation.',
  'Generate official bank statements on demand — no waiting for the bank to process requests.',
];

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentPanel, setCurrentPanel] = useState(0);
  const [isNavScrolled, setIsNavScrolled] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Morphing text state
  const [text1, setText1] = useState(CAROUSEL_TITLES[0]);
  const [text2, setText2] = useState(CAROUSEL_TITLES[0]);
  const [subtext1, setSubtext1] = useState(CAROUSEL_SUBTITLES[0]);
  const [subtext2, setSubtext2] = useState(CAROUSEL_SUBTITLES[0]);

  const text1Ref = useRef<HTMLSpanElement>(null);
  const text2Ref = useRef<HTMLSpanElement>(null);
  const subtext1Ref = useRef<HTMLSpanElement>(null);
  const subtext2Ref = useRef<HTMLSpanElement>(null);
  const morphAnimIdRef = useRef<number | null>(null);

  // --- Scroll listener for nav ---
  useEffect(() => {
    const handleScroll = () => {
      setIsNavScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // --- Particle Canvas Animation ---
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

  // --- Morphing Text Animation ---
  const triggerMorph = (newIndex: number) => {
    const newTitle = CAROUSEL_TITLES[newIndex];
    const newSub = CAROUSEL_SUBTITLES[newIndex];

    const elText1 = text1Ref.current;
    const elText2 = text2Ref.current;
    const elSub1 = subtext1Ref.current;
    const elSub2 = subtext2Ref.current;

    if (!elText1 || !elText2) {
      setText2(newTitle);
      setSubtext2(newSub);
      return;
    }

    if (morphAnimIdRef.current) {
      cancelAnimationFrame(morphAnimIdRef.current);
      morphAnimIdRef.current = null;
    }

    const curTitle = elText2.textContent || text2;
    const curSub = (elSub2 && elSub2.textContent) || subtext2;

    setText1(curTitle);
    setText2(newTitle);
    setSubtext1(curSub);
    setSubtext2(newSub);

    elText1.style.opacity = '1';
    elText1.style.filter = 'blur(0px)';
    elText2.style.opacity = '0';
    elText2.style.filter = 'blur(8px)';

    if (elSub1) {
      elSub1.style.opacity = '1';
      elSub1.style.filter = 'blur(0px)';
    }
    if (elSub2) {
      elSub2.style.opacity = '0';
      elSub2.style.filter = 'blur(4px)';
    }

    const duration = 800;
    const startTime = performance.now();

    function update(time: number) {
      const elapsed = time - startTime;
      let fraction = Math.min(elapsed / duration, 1);
      if (fraction <= 0) fraction = 0.0001;

      const blurVal2 = Math.min(8 / fraction - 8, 8);
      const opacityVal2 = Math.pow(fraction, 0.2);
      elText2!.style.filter = `blur(${blurVal2}px)`;
      elText2!.style.opacity = `${opacityVal2}`;

      const invertedFraction = 1 - fraction;
      const safeInvertedFraction = Math.max(invertedFraction, 0.0001);
      const blurVal1 = Math.min(8 / safeInvertedFraction - 8, 8);
      const opacityVal1 = Math.pow(safeInvertedFraction, 0.2);
      elText1!.style.filter = `blur(${blurVal1}px)`;
      elText1!.style.opacity = `${opacityVal1}`;

      const blurValSub2 = Math.min(4 / fraction - 4, 4);
      const opacityValSub2 = Math.pow(fraction, 0.2);
      if (elSub2) {
        elSub2.style.filter = `blur(${blurValSub2}px)`;
        elSub2.style.opacity = `${opacityValSub2}`;
      }

      const blurValSub1 = Math.min(4 / safeInvertedFraction - 4, 4);
      const opacityValSub1 = Math.pow(safeInvertedFraction, 0.2);
      if (elSub1) {
        elSub1.style.filter = `blur(${blurValSub1}px)`;
        elSub1.style.opacity = `${opacityValSub1}`;
      }

      if (fraction < 1) {
        morphAnimIdRef.current = requestAnimationFrame(update);
      } else {
        elText2!.style.filter = 'none';
        elText2!.style.opacity = '1';
        elText1!.style.filter = 'none';
        elText1!.style.opacity = '0';

        if (elSub2) {
          elSub2.style.filter = 'none';
          elSub2.style.opacity = '1';
        }
        if (elSub1) {
          elSub1.style.filter = 'none';
          elSub1.style.opacity = '0';
        }
        morphAnimIdRef.current = null;
      }
    }

    morphAnimIdRef.current = requestAnimationFrame(update);
  };

  const setPanel = (index: number) => {
    const nextIdx = (index + 4) % 4;
    setCurrentPanel(nextIdx);
    triggerMorph(nextIdx);
  };

  // --- Autoplay Carousel ---
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setPanel(currentPanel + 1);
    }, 2500);
    return () => clearInterval(interval);
  }, [currentPanel, isPaused]);

  // Determine card positioning class
  const getCardClass = (index: number) => {
    const n = 4;
    const diff = ((index - currentPanel) % n + n) % n;
    if (diff === 0) return 'active';
    if (diff === 1) return 'next';
    if (diff === 2) return 'far-next';
    return 'prev';
  };

  return (
    <div className="viri-landing-root">
      {/* Particle Canvas */}
      <canvas id="particle-canvas" ref={canvasRef}></canvas>

      {/* SVG Threshold Filter for Gooey Morphing Text */}
      <svg id="filters" style={{ display: 'none' }}>
        <defs>
          <filter id="threshold">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 255 -140"
            />
          </filter>
        </defs>
      </svg>

      {/* Navigation */}
      <nav className={`nav ${isNavScrolled ? 'scrolled' : ''}`} role="navigation" aria-label="Main navigation">
        <Link to="/" className="nav-logo" aria-label="Viri home">
          <img src="/img/logo_en.png" alt="Viri" width="160" height="40" decoding="async" fetchPriority="high" />
        </Link>
        <div className="nav-links">
          <Link to="/faq" className="nav-link">FAQ</Link>
          <Link to="/affiliate/register" className="nav-link" style={{ color: '#10B981', fontWeight: 600 }}>Partners</Link>
          <Link to="/login" className="nav-signin">Sign in</Link>
          <Link to="/register" className="btn-primary">Get started</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero" id="hero">
        <img src="/img/logo_dv_en.png" alt="Viri" className="hero-logo" width="200" height="auto" decoding="async" fetchPriority="high" />

        <h1 className="display-xl hero-title">
          One dashboard.<br />All your accounts. Full visibility.
        </h1>

        <p className="body-md hero-subtitle">
          Connect accounts from both banks. Unified ledger, instant verification,
          on-demand statements. Built for Maldivian businesses.
        </p>

        <div className="hero-actions">
          <Link to="/register" className="btn-primary hero-btn" style={{ color: '#041d13' }}>
            Try Pro for free
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* 3D Depth-of-Field Carousel */}
        <section
          className="carousel-section"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          <div className="carousel-external-title">
            <div className="carousel-external-heading morph-heading">
              <span ref={text1Ref} className="morph-text morph-text-1">{text1}</span>
              <span ref={text2Ref} className="morph-text morph-text-2">{text2}</span>
            </div>
            <div className="carousel-external-subheading morph-subheading">
              <span ref={subtext1Ref} className="morph-subtext morph-subtext-1">{subtext1}</span>
              <span ref={subtext2Ref} className="morph-subtext morph-subtext-2">{subtext2}</span>
            </div>
          </div>

          <div className="carousel-viewport">
            <div className="carousel-track">
              {/* Panel 0: Verification Panel */}
              <div className={`carousel-card ${getCardClass(0)}`}>
                <div className="terminal-header">
                  <span className="terminal-dot red"></span>
                  <span className="terminal-dot yellow"></span>
                  <span className="terminal-dot green"></span>
                  <span className="terminal-title">viri — verification panel</span>
                </div>
                <div className="terminal-body">
                  <div className="verify-grid">
                    <div className="verify-form">
                      <div className="verify-input-group">
                        <label>Target Amount (MVR)</label>
                        <input type="text" className="verify-input" value="25,000.00" readOnly />
                      </div>
                      <div className="panel-section">
                        <div className="panel-section-title">Receiving Account</div>
                        <div className="verify-accounts">
                          <div className="verify-account">
                            <div className="verify-account-icon mib">M</div>
                            <div className="verify-account-info">
                              <div className="verify-account-name">Aisha Mohamed</div>
                              <div className="verify-account-num">90101101137792000</div>
                            </div>
                            <span className="verify-account-badge usd">USD</span>
                          </div>
                          <div className="verify-account selected">
                            <div className="verify-account-icon bml">4</div>
                            <div className="verify-account-info">
                              <div className="verify-account-name">Aisha Mohamed</div>
                              <div className="verify-account-num">7701111524001</div>
                            </div>
                            <span className="verify-account-badge mvr">MVR</span>
                          </div>
                          <div className="verify-account">
                            <div className="verify-account-icon bml">4</div>
                            <div className="verify-account-info">
                              <div className="verify-account-name">Aisha Mohamed</div>
                              <div className="verify-account-num">770000076915</div>
                            </div>
                            <span className="verify-account-badge saving">SAVING</span>
                          </div>
                        </div>
                      </div>
                      <button className="verify-btn verify-btn-primary">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.34-4.34" />
                        </svg>
                        Verify Transfer
                      </button>
                      <button className="verify-btn verify-btn-outline">View History</button>
                    </div>
                    <div className="verify-results">
                      <div className="verify-last-credit">
                        <div className="verify-last-credit-header">
                          <span className="verify-last-credit-amount">MVR 25,000.00</span>
                        </div>
                        <div className="verify-last-credit-meta">Date: Jul 16, 09:08</div>
                        <div className="verify-last-credit-meta">Transfer Credit — OCEANVIEW RESORTS...</div>
                      </div>
                      <div className="panel-section">
                        <div className="panel-section-title">Recent Transactions — BML 7701111524001</div>
                        <div className="verify-tx-table">
                          <div className="verify-tx-header">
                            <span>Date & Time</span>
                            <span>Description</span>
                            <span style={{ textAlign: 'right' }}>Amount</span>
                          </div>
                          <div className="verify-tx-row">
                            <span className="verify-tx-date">Jul 16, 09:08</span>
                            <span className="verify-tx-desc">Transfer Credit — OCEANVIEW RESORTS PVT LTD</span>
                            <span className="verify-tx-amount credit">+25,000.00</span>
                          </div>
                          <div className="verify-tx-row">
                            <span className="verify-tx-date">Jul 16, 09:02</span>
                            <span className="verify-tx-desc">Transfer Credit — AHMED RASHID</span>
                            <span className="verify-tx-amount credit">+1,500.00</span>
                          </div>
                          <div className="verify-tx-row">
                            <span className="verify-tx-date">Jul 16, 08:45</span>
                            <span className="verify-tx-desc">Transfer Debit — AHMED RASHID</span>
                            <span className="verify-tx-amount debit">-350.00</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel 1: Transaction Ledger */}
              <div className={`carousel-card ${getCardClass(1)}`}>
                <div className="terminal-header">
                  <span className="terminal-dot red"></span>
                  <span className="terminal-dot yellow"></span>
                  <span className="terminal-dot green"></span>
                  <span className="terminal-title">viri — transaction ledger</span>
                </div>
                <div className="terminal-body">
                  <div className="ledger-header">
                    <div className="ledger-title">Daily Entries <span>(15)</span></div>
                    <div className="ledger-filters">
                      <button className="ledger-filter-pill active">All</button>
                      <button className="ledger-filter-pill">Inwards</button>
                      <button className="ledger-filter-pill">Outwards</button>
                      <div className="ledger-search">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.34-4.34" />
                        </svg>
                        Search...
                      </div>
                    </div>
                  </div>
                  <div className="ledger-sync-bar">
                    <span className="ledger-sync-label">Sync Progress</span>
                    <div className="ledger-sync-track"><div className="ledger-sync-fill"></div></div>
                    <span className="ledger-sync-status">100% Success</span>
                    <span>Since last sync: 2m 14s ago</span>
                  </div>
                  <div className="ledger-table">
                    <div className="ledger-table-header">
                      <span></span>
                      <span>Date & Time</span>
                      <span>Description</span>
                      <span>Details / Meta</span>
                      <span style={{ textAlign: 'right' }}>Amount (MVR)</span>
                    </div>
                    <div className="ledger-table-row">
                      <div className="ledger-status-icon credit">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="m5 12 7-7 7 7" /></svg>
                      </div>
                      <span className="ledger-date">Jul 16, 09:08</span>
                      <span className="ledger-desc">Transfer Credit — OCEANVIEW RESORTS</span>
                      <span className="ledger-details">Ref: 380 — ID: 1-147931648-380-55170</span>
                      <span className="ledger-amount credit">+25,000.00</span>
                    </div>
                    <div className="ledger-table-row">
                      <div className="ledger-status-icon debit">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="m19 12-7 7-7-7" /></svg>
                      </div>
                      <span className="ledger-date">Jul 15, 16:42</span>
                      <span className="ledger-desc">IB Acc to Acc</span>
                      <span className="ledger-details">Ref: 85234102 — ID: 1-147222895-85234102-1</span>
                      <span className="ledger-amount debit">-5,000.00</span>
                    </div>
                    <div className="ledger-table-row">
                      <div className="ledger-status-icon credit">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="m5 12 7-7 7 7" /></svg>
                      </div>
                      <span className="ledger-date">Jul 15, 11:30</span>
                      <span className="ledger-desc">Cash Deposit ATM</span>
                      <span className="ledger-details">Ref: 78871720 — ID: 1-744820714-78871720-1</span>
                      <span className="ledger-amount credit">+12,500.00</span>
                    </div>
                  </div>
                  <div className="ledger-footer">
                    <span>Show 25 rows</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="ledger-footer-btn accent">Save Report</button>
                      <button className="ledger-footer-btn">Force Sync</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel 2: Reports Suite */}
              <div className={`carousel-card ${getCardClass(2)}`}>
                <div className="terminal-header">
                  <span className="terminal-dot red"></span>
                  <span className="terminal-dot yellow"></span>
                  <span className="terminal-dot green"></span>
                  <span className="terminal-title">viri — reports suite</span>
                </div>
                <div className="terminal-body">
                  <div className="reports-grid">
                    <div className="reports-sidebar">
                      <div className="reports-sidebar-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
                        Reports
                      </div>
                      <div className="reports-nav-item active">Cash Flow Summary</div>
                      <div className="reports-nav-item">Period Comparison</div>
                      <div className="reports-nav-item">Activity by Account</div>
                      <div className="reports-nav-item">Trend Analysis</div>
                    </div>
                    <div className="reports-content">
                      <div className="reports-content-header">
                        <span className="reports-content-title">Cash Flow Summary</span>
                        <span className="reports-date-range">Jul 1 — Jul 16, 2026</span>
                      </div>
                      <div className="reports-stats">
                        <div className="reports-stat">
                          <div className="reports-stat-label">Total Inflow</div>
                          <div className="reports-stat-value inflow">MVR 425,300.00</div>
                        </div>
                        <div className="reports-stat">
                          <div className="reports-stat-label">Total Outflow</div>
                          <div className="reports-stat-value outflow">MVR 349,200.00</div>
                        </div>
                      </div>
                      <div className="reports-net">
                        <div className="reports-net-label">Net Cash Flow</div>
                        <div className="reports-net-value">MVR 76,100.00</div>
                      </div>
                      <div className="reports-chart">
                        <div className="reports-bar positive" style={{ height: '45%' }}></div>
                        <div className="reports-bar negative" style={{ height: '30%' }}></div>
                        <div className="reports-bar positive" style={{ height: '70%' }}></div>
                        <div className="reports-bar positive" style={{ height: '55%' }}></div>
                        <div className="reports-bar negative" style={{ height: '40%' }}></div>
                        <div className="reports-bar positive" style={{ height: '85%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel 3: Statement Generator */}
              <div className={`carousel-card ${getCardClass(3)}`}>
                <div className="terminal-header">
                  <span className="terminal-dot red"></span>
                  <span className="terminal-dot yellow"></span>
                  <span className="terminal-dot green"></span>
                  <span className="terminal-title">viri — statement generator</span>
                </div>
                <div className="terminal-body">
                  <div className="statement-form">
                    <div className="statement-form-header">
                      <div className="statement-form-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                      </div>
                      <div>
                        <div className="statement-form-title">Generate Statement</div>
                        <div className="statement-form-subtitle">Select account and date range to generate a PDF statement.</div>
                      </div>
                    </div>
                    <div className="statement-fields">
                      <div className="statement-field">
                        <label>Bank Account</label>
                        <select className="statement-select">
                          <option>BML ••4821 — Aisha Mohamed</option>
                          <option>MIB ••2000 — Aisha Mohamed</option>
                        </select>
                      </div>
                      <div className="statement-field">
                        <label>From Date</label>
                        <input type="text" className="statement-date" value="01-07-2026" readOnly />
                      </div>
                      <button className="statement-generate-btn">Generate</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* External Controls */}
          <div className="carousel-external-controls">
            <button className="carousel-arrow" onClick={() => setPanel(currentPanel - 1)} aria-label="Previous panel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div className="carousel-dots">
              {[0, 1, 2, 3].map((i) => (
                <button
                  key={i}
                  className={`carousel-dot ${currentPanel === i ? 'active' : ''}`}
                  onClick={() => setPanel(i)}
                  aria-label={CAROUSEL_TITLES[i]}
                ></button>
              ))}
            </div>
            <button className="carousel-arrow" onClick={() => setPanel(currentPanel + 1)} aria-label="Next panel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
        </section>
      </section>

      {/* Tool Suite Section */}
      <section className="tools-section" id="tools">
        <div className="container">
          <div className="tools-header">
            <p className="label">The Viri Tool Suite</p>
            <h2 className="display-lg">Complete financial operations toolkit</h2>
            <p className="body-md">Not just a viewer, a complete toolkit for managing your finances across every connected bank.</p>
          </div>

          <div className="tools-grid">
            {/* Card 1: Verification Panel (Featured) */}
            <div className="tool-card featured">
              <div>
                <div className="tool-card-header">
                  <div className="tool-card-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.34-4.34" /><path d="m9 12 2 2 4-4" /></svg>
                  </div>
                  <h3 className="tool-card-title">Verification Panel</h3>
                </div>
                <ul className="tool-card-list">
                  <li>Search for transactions by target amount, to find exact matches instantly</li>
                  <li>Preview the 3 most recent relevant transactions at a glance</li>
                  <li>General-purpose quick look-up for daily verification tasks</li>
                </ul>
              </div>
              <div className="tool-card-preview">
                <div className="mini-search">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.34-4.34" /></svg>
                  <span>128,500</span>
                </div>
                <div className="mini-result">
                  <span className="mini-result-text">Azure Resorts — Invoice #1042</span>
                  <span className="mini-result-amount">+ 128,500</span>
                </div>
                <div className="mini-result">
                  <span className="mini-result-text">Azure Resorts — Invoice #1038</span>
                  <span className="mini-result-amount">+ 128,500</span>
                </div>
              </div>
            </div>

            {/* Card 2: Transaction Ledger */}
            <div className="tool-card card-ledger">
              <div className="tool-card-header">
                <div className="tool-card-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
                </div>
                <h3 className="tool-card-title">Unified Transaction Ledger</h3>
              </div>
              <div className="tool-card-section">
                <h4 className="tool-card-section-title">Unified Account Ledger</h4>
                <ul className="tool-card-list">
                  <li>Filter and view transactions of any single linked account dynamically</li>
                  <li>Isolate entries for individual account reconciliations</li>
                </ul>
                <div className="tool-card-preview">
                  <div className="mini-ledger-row">
                    <span className="mini-ledger-label">BML ••4821 — Supplier Payment</span>
                    <span className="mini-ledger-value debit">- 45,200</span>
                  </div>
                  <div className="mini-ledger-row">
                    <span className="mini-ledger-label">BML ••4821 — Payroll</span>
                    <span className="mini-ledger-value debit">- 387,000</span>
                  </div>
                  <div className="mini-ledger-row">
                    <span className="mini-ledger-label">BML ••4821 — Cash Deposit ATM</span>
                    <span className="mini-ledger-value credit">+ 12,500</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Reports Suite */}
            <div className="tool-card card-reports">
              <div className="tool-card-header">
                <div className="tool-card-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
                </div>
                <h3 className="tool-card-title">Reports Suite</h3>
              </div>
              <ul className="tool-card-list">
                <li>Cash flow summary, overall inflow vs. outflow for any period</li>
                <li>Period comparison, this month against last, or year-over-year</li>
                <li>Trend analysis and transaction volume reports</li>
                <li>Export as PDF Summary or raw Excel/CSV</li>
              </ul>
              <div className="tool-card-preview">
                <div className="mini-chart">
                  <div className="mini-bar" style={{ height: '40%' }}></div>
                  <div className="mini-bar" style={{ height: '65%' }}></div>
                  <div className="mini-bar" style={{ height: '55%' }}></div>
                  <div className="mini-bar" style={{ height: '80%' }}></div>
                  <div className="mini-bar" style={{ height: '70%' }}></div>
                  <div className="mini-bar" style={{ height: '90%' }}></div>
                  <div className="mini-bar" style={{ height: '75%' }}></div>
                  <div className="mini-bar" style={{ height: '60%' }}></div>
                  <div className="mini-bar" style={{ height: '85%' }}></div>
                  <div className="mini-bar" style={{ height: '95%' }}></div>
                  <div className="mini-bar" style={{ height: '70%' }}></div>
                  <div className="mini-bar" style={{ height: '50%' }}></div>
                </div>
              </div>
            </div>

            {/* Card 4: Statement Generator */}
            <div className="tool-card card-statement">
              <div className="tool-card-header">
                <div className="tool-card-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                </div>
                <h3 className="tool-card-title">Statement Generator</h3>
              </div>
              <ul className="tool-card-list">
                <li>Generate statements for any date range</li>
                <li>Available for all connected accounts</li>
                <li>Download instantly as PDF, ready for audits or submissions</li>
              </ul>
              <div className="tool-card-preview">
                <div className="mini-statement">
                  <div className="mini-statement-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                  </div>
                  <div className="mini-statement-info">
                    <div className="mini-statement-title">BML Statement — Nov 2025</div>
                    <div className="mini-statement-meta">Account ••4821 • PDF • 2.4 MB</div>
                  </div>
                  <span className="mini-statement-badge">Download</span>
                </div>
              </div>
            </div>

            {/* Card 5: Terminal Permissions */}
            <div className="tool-card card-permissions">
              <div className="tool-card-header">
                <div className="tool-card-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /></svg>
                </div>
                <h3 className="tool-card-title">Terminal Permissions</h3>
              </div>
              <ul className="tool-card-list">
                <li>Set per-terminal access controls and security PINs</li>
                <li>Toggle cashier capabilities — ledger, reports, statements</li>
                <li>Control data visibility and diagnostic log sharing</li>
              </ul>
              <div className="tool-card-preview permissions-preview">
                <div className="perm-preview-header">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /></svg>
                  <span className="perm-preview-title">Configure Counter Permissions</span>
                  <span className="perm-preview-sub">Configure device credentials, permissions, and security PINs for this POS terminal</span>
                </div>
                <div className="perm-preview-cols">
                  <div className="perm-preview-col">
                    <div className="perm-preview-col-head">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      <span className="perm-preview-col-title">Counter Access & Security</span>
                    </div>
                    <span className="perm-preview-col-sub">Device credentials & security PINs</span>
                    <div className="perm-mini-field">
                      <span className="perm-mini-label">Counter Name</span>
                      <div className="perm-mini-input">aa</div>
                    </div>
                    <div className="perm-mini-field">
                      <span className="perm-mini-label">Settings Pin</span>
                      <div className="perm-mini-input dim">e.g. 123456</div>
                      <span className="perm-mini-help">6-digit PIN for access to counter settings menu.</span>
                    </div>
                  </div>
                  <div className="perm-preview-col">
                    <div className="perm-preview-col-head">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /></svg>
                      <span className="perm-preview-col-title">Counter Capabilities</span>
                    </div>
                    <span className="perm-preview-col-sub">Primary cashier tools & modules</span>
                    <div className="perm-mini-check">
                      <div className="perm-mini-box checked"></div>
                      <div className="perm-mini-check-text">
                        <span className="perm-mini-check-title">Verification Panel <span className="perm-mini-badge">Required</span></span>
                        <span className="perm-mini-check-desc">Allows cashier to verify incoming MVR bank transfer receipts.</span>
                      </div>
                    </div>
                    <div className="perm-mini-check">
                      <div className="perm-mini-box checked"></div>
                      <div className="perm-mini-check-text">
                        <span className="perm-mini-check-title">Transaction Ledger</span>
                        <span className="perm-mini-check-desc">Allows cashier to view account transaction statement history.</span>
                      </div>
                    </div>
                    <div className="perm-mini-check">
                      <div className="perm-mini-box checked"></div>
                      <div className="perm-mini-check-text">
                        <span className="perm-mini-check-title">View Analytics & Reports</span>
                        <span className="perm-mini-check-desc">Grants access to reporting charts and analytics panels.</span>
                      </div>
                    </div>
                    <div className="perm-mini-check">
                      <div className="perm-mini-box checked"></div>
                      <div className="perm-mini-check-text">
                        <span className="perm-mini-check-title">Bank Statements Generator</span>
                        <span className="perm-mini-check-desc">Allows cashier to generate and export bank account statements.</span>
                      </div>
                    </div>
                  </div>
                  <div className="perm-preview-col">
                    <div className="perm-preview-col-head">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                      <span className="perm-preview-col-title">Advanced Data Controls</span>
                    </div>
                    <span className="perm-preview-col-sub">Ledger details & diagnostic logging</span>
                    <div className="perm-mini-check">
                      <div className="perm-mini-box checked"></div>
                      <div className="perm-mini-check-text">
                        <span className="perm-mini-check-title">Show Account Balance</span>
                        <span className="perm-mini-check-desc">Display live bank account balances on the cashier terminal.</span>
                      </div>
                    </div>
                    <div className="perm-mini-check">
                      <div className="perm-mini-box checked"></div>
                      <div className="perm-mini-check-text">
                        <span className="perm-mini-check-title">Share Diagnostic Logs</span>
                        <span className="perm-mini-check-desc">Automatically send anonymized execution logs for superadmin troubleshooting.</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="perm-preview-footer">
                  <span className="perm-mini-btn">Cancel</span>
                  <span className="perm-mini-btn save">Save Changes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-section" id="how">
        <div className="container">
          <div className="how-header">
            <p className="label">How it works</p>
            <h2 className="display-lg">Three steps to full visibility</h2>
          </div>

          <div className="how-steps">
            <div className="how-step">
              <div className="how-step-number">01</div>
              <h3 className="how-step-title">Onboard</h3>
              <p className="how-step-desc">Create your company account and log into the admin dashboard. You'll be guided through a brief onboarding tour. Authenticate once; your session persists.</p>
            </div>
            <div className="how-step">
              <div className="how-step-number">02</div>
              <h3 className="how-step-title">Connect</h3>
              <p className="how-step-desc">Add your BML or MIB accounts via our secure Chrome extension. Authenticate once; your session persists even if you restart your browser.</p>
            </div>
            <div className="how-step">
              <div className="how-step-number">03</div>
              <h3 className="how-step-title">Analyse & Export</h3>
              <p className="how-step-desc">Use the unified ledger, verification panel, and comprehensive reports suite. Generate statements, export to Excel/CSV, all from one dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="security-section" id="security">
        <div className="container">
          <div className="security-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
          </div>
          <h2 className="display-lg security-title">Security First</h2>
          <p className="body-md security-desc">
            Your banking credentials never touch Viri's servers. We use direct, encrypted
            communication channels between your browser and your bank. Viri only stores
            read-only session tokens; we never store your passwords.
          </p>
        </div>
      </section>

      {/* Who It's For */}
      <section className="audience-section" id="audience">
        <div className="container">
          <div className="audience-header">
            <p className="label">Who is Viri for</p>
            <h2 className="display-lg">Built for how you work</h2>
          </div>

          <div className="audience-grid">
            <div className="audience-card">
              <div className="audience-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>
              </div>
              <h3 className="audience-card-title">Retail Chains</h3>
              <p className="audience-card-desc">Manage bank accounts across multiple store locations from one dashboard. Track payments, verify deposits, and generate daily reports without logging into each bank separately.</p>
            </div>

            <div className="audience-card">
              <div className="audience-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
              </div>
              <h3 className="audience-card-title">Growing Businesses</h3>
              <p className="audience-card-desc">Keep a close eye on cash flow across personal and business accounts. Download monthly transaction reports for accounting. No more manual data entry.</p>
            </div>

            <div className="audience-card">
              <div className="audience-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
              </div>
              <h3 className="audience-card-title">Finance & Operations Teams</h3>
              <p className="audience-card-desc">Give your team read-only access to bank data without sharing passwords. Generate reports on demand. Focus on numbers, not logins.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="pricing-section" id="pricing">
        <div className="container">
          <div className="pricing-header">
            <p className="label">Pricing</p>
            <h2 className="display-lg">Simple, transparent plans</h2>
            <p className="body-md">Start with what you need. Scale as you grow.</p>
          </div>

          <div className="pricing-grid">
            {/* Starter */}
            <div className="pricing-card">
              <div className="pricing-card-head">
                <h3 className="pricing-plan-name">Starter</h3>
                <p className="pricing-plan-desc">For small stores and sole traders getting started.</p>
              </div>
              <div className="pricing-amount">
                <span className="pricing-currency">MVR</span>
                <span className="pricing-value">349.00</span>
                <span className="pricing-period">/mo</span>
              </div>
              <ul className="pricing-features">
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  Verification Panel – Search transactions by amount, or preview most recent credits.
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  See balances and basic transaction lists.
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  Per terminal customisation of account balance and debit transaction view.
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  Shift &amp; transaction claim function and reports.
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  2 Bank Accounts Total
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  1 Terminal connection.
                </li>
              </ul>
              <Link to="/register" className="pricing-btn pricing-btn-outline">Get Started Now</Link>
            </div>

            {/* Pro (Featured) */}
            <div className="pricing-card featured">
              <div className="pricing-card-head">
                <h3 className="pricing-plan-name">Pro <span className="pricing-plan-badge">Most Popular</span> <span className="pricing-trial-pill">Free Trial Available</span></h3>
                <p className="pricing-plan-desc">For growing businesses that need full financial control.</p>
              </div>
              <div className="pricing-amount">
                <span className="pricing-currency">MVR</span>
                <span className="pricing-value">899.00</span>
                <span className="pricing-period">/mo</span>
              </div>
              <ul className="pricing-features">
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  Pro plan includes: everything in starter plan
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  Full Tool Suite Access – Verification Panel + Unified Ledger + Reports Suite + Statement Generator.
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  On-Demand Statement Generation. Export to PDF, Excel &amp; CSV.
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  4 Bank Accounts (modular – 100.00 per additional bank account).
                </li>
                <li>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  3 Terminals (modular – 200.00 per additional terminal).
                </li>
              </ul>
              <Link to="/register" className="pricing-btn pricing-btn-primary" style={{ color: '#041d13' }}>Try Pro for Free</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div className="footer-brand">
              <img src="/img/logo_en.png" alt="Viri" width="100" height="28" decoding="async" loading="lazy" />
              <span className="footer-tagline">Pioneering unified banking in the Maldives</span>
            </div>
            <div className="footer-links">
              <Link to="/faq">FAQ</Link>
              <Link to="/affiliate/register">Partner Program</Link>
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
