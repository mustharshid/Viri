/* ============================================
   VIRI REDESIGN — Interactions & Animations
   ============================================ */

(function () {
  'use strict';

  // --- Particle Wave Background ---
  const canvas = document.getElementById('particle-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    let animationId = null;
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
      mouseRadiusSq: 14400, // Precalculated 120 * 120
      mouseInfluence: 0.3,
    };

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      CONFIG.cols = Math.ceil(width / CONFIG.gap) + 2;
      CONFIG.rows = Math.ceil(height / CONFIG.gap) + 2;
      initParticles();
    }

    function initParticles() {
      particles = [];
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

    function animate(time) {
      if (reducedMotion) {
        drawStatic();
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const mouseActive = (mouse.x > -1000);
      const activeParticles = [];

      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${CONFIG.baseAlpha})`;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const waveX = Math.sin(p.baseX * 0.003 + time * CONFIG.waveSpeed) * CONFIG.waveAmplitude;
        const waveY = Math.cos(p.baseY * 0.004 + time * CONFIG.waveSpeed * 0.7) * CONFIG.waveAmplitude * 0.6;

        let isNearMouse = false;
        let dist = 999999;
        let dx = 0, dy = 0;

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
          p.dist = dist;
          activeParticles.push(p);
        } else {
          p.x = p.baseX + waveX;
          p.y = p.baseY + waveY;
          // Set subpath cursor to prevent connected lines between arc points
          ctx.moveTo(p.x + CONFIG.particleSize, p.y);
          ctx.arc(p.x, p.y, CONFIG.particleSize, 0, Math.PI * 2);
        }
      }
      ctx.fill();

      // Batch draw active mouse particles with dynamic alpha in second pass
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

    window.addEventListener('resize', () => {
      resize();
      if (reducedMotion) drawStatic();
    });

    document.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });

    document.addEventListener('mouseleave', () => {
      mouse.x = -1000;
      mouse.y = -1000;
    });
  }

  // --- Navigation Scroll Effect ---
  const nav = document.querySelector('.nav');
  if (nav) {
    let isScrolled = false;
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      const shouldBeScrolled = scrollY > 20;
      if (shouldBeScrolled !== isScrolled) {
        isScrolled = shouldBeScrolled;
        nav.classList.toggle('scrolled', isScrolled);
      }
    }, { passive: true });
  }

  // --- Scroll Reveal ---
  const revealElements = document.querySelectorAll('.reveal');
  if (revealElements.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    revealElements.forEach((el) => observer.observe(el));
  }

  // --- Staggered Reveal for Grid Children ---
  const staggerContainers = document.querySelectorAll('[data-stagger]');
  if (staggerContainers.length > 0) {
    const staggerObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const children = entry.target.children;
            Array.from(children).forEach((child, i) => {
              child.classList.add('reveal', `reveal-delay-${i + 1}`);
              // Trigger reflow then add visible
              requestAnimationFrame(() => {
                child.classList.add('visible');
              });
            });
            staggerObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    staggerContainers.forEach((el) => staggerObserver.observe(el));
  }

  // --- Smooth Scroll for Anchor Links ---
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- 3D Depth-of-Field Carousel with Morphing Text ---
  const carousel = document.querySelector('[data-carousel]');
  if (carousel) {
    const cards = carousel.querySelectorAll('.carousel-card');
    const dots = carousel.querySelectorAll('.carousel-dot');
    const prevBtn = carousel.querySelector('[data-carousel-prev]');
    const nextBtn = carousel.querySelector('[data-carousel-next]');
    const morphText1 = carousel.querySelector('.morph-text-1');
    const morphText2 = carousel.querySelector('.morph-text-2');
    const morphSubtext1 = carousel.querySelector('.morph-subtext-1');
    const morphSubtext2 = carousel.querySelector('.morph-subtext-2');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const titles = [
      'Verification Panel',
      'Transaction Ledger',
      'Reports Suite',
      'Statement Generator',
    ];

    const subtitles = [
      'Search by target amount to find and verify specific payments across all connected accounts.',
      'Unified, real-time view of every transaction across all linked bank accounts.',
      'Turn transaction data into actionable business intelligence with one-click report generation.',
      'Generate official bank statements on demand — no waiting for the bank to process requests.',
    ];

    let current = 0;
    let morphBusy = false;
    let autoplayTimer = null;
    let isPaused = false;
    let isVisible = true;
    let morphAnimId = null;

    function morphTo(newTitle, newSubheading) {
      if (!morphText1 || !morphText2) return;

      const currentTitle = morphText2.textContent || morphText1.textContent || 'Verification Panel';
      const currentSubheading = (morphSubtext2 && morphSubtext2.textContent) || (morphSubtext1 && morphSubtext1.textContent) || subtitles[0];
      
      if (currentTitle === newTitle && currentSubheading === newSubheading) return;

      // 1. Cancel any active animation frame
      if (morphAnimId) {
        cancelAnimationFrame(morphAnimId);
        morphAnimId = null;
      }

      // Handle reduced motion gracefully by switching instantly
      if (reducedMotion) {
        morphText2.textContent = newTitle;
        morphText2.style.opacity = '1';
        morphText2.style.filter = 'none';
        morphText1.textContent = currentTitle;
        morphText1.style.opacity = '0';
        morphText1.style.filter = 'none';
        if (morphSubtext2) {
          morphSubtext2.textContent = newSubheading;
          morphSubtext2.style.opacity = '1';
          morphSubtext2.style.filter = 'none';
        }
        if (morphSubtext1) {
          morphSubtext1.textContent = currentSubheading;
          morphSubtext1.style.opacity = '0';
          morphSubtext1.style.filter = 'none';
        }
        return;
      }

      // 2. Align outgoing and incoming span contents
      morphText1.textContent = currentTitle;
      morphText2.textContent = newTitle;
      if (morphSubtext1) morphSubtext1.textContent = currentSubheading;
      if (morphSubtext2) morphSubtext2.textContent = newSubheading;

      // Initialize styles for start of animation
      morphText1.style.opacity = '1';
      morphText1.style.filter = 'blur(0px)';
      morphText2.style.opacity = '0';
      morphText2.style.filter = 'blur(8px)'; // Start with max blur to avoid visual layout jumps

      if (morphSubtext1) {
        morphSubtext1.style.opacity = '1';
        morphSubtext1.style.filter = 'blur(0px)';
      }
      if (morphSubtext2) {
        morphSubtext2.style.opacity = '0';
        morphSubtext2.style.filter = 'blur(4px)';
      }

      const duration = 800; // Snappy 800ms transition
      const startTime = performance.now();

      function update(time) {
        const elapsed = time - startTime;
        let fraction = Math.min(elapsed / duration, 1);

        // Safeguard fraction for mathematical limits
        if (fraction <= 0) fraction = 0.0001;

        // --- Animate Title Spans ---
        const blurVal2 = Math.min(8 / fraction - 8, 8); // Capped at 8px to prevent total text invisibility
        const opacityVal2 = Math.pow(fraction, 0.2); // Midpoint opacity is higher (~87%) so text doesn't disappear
        morphText2.style.filter = `blur(${blurVal2}px)`;
        morphText2.style.opacity = opacityVal2;

        const invertedFraction = 1 - fraction;
        const safeInvertedFraction = Math.max(invertedFraction, 0.0001);
        const blurVal1 = Math.min(8 / safeInvertedFraction - 8, 8);
        const opacityVal1 = Math.pow(safeInvertedFraction, 0.2);
        morphText1.style.filter = `blur(${blurVal1}px)`;
        morphText1.style.opacity = opacityVal1;

        // --- Animate Subheading Spans ---
        const blurValSub2 = Math.min(4 / fraction - 4, 4); // Capped at 4px for legibility
        const opacityValSub2 = Math.pow(fraction, 0.2);
        if (morphSubtext2) {
          morphSubtext2.style.filter = `blur(${blurValSub2}px)`;
          morphSubtext2.style.opacity = opacityValSub2;
        }

        const blurValSub1 = Math.min(4 / safeInvertedFraction - 4, 4);
        const opacityValSub1 = Math.pow(safeInvertedFraction, 0.2);
        if (morphSubtext1) {
          morphSubtext1.style.filter = `blur(${blurValSub1}px)`;
          morphSubtext1.style.opacity = opacityValSub1;
        }

        if (fraction < 1) {
          morphAnimId = requestAnimationFrame(update);
        } else {
          // Snap to final clean states
          morphText2.style.filter = 'none';
          morphText2.style.opacity = '1';
          morphText1.style.filter = 'none';
          morphText1.style.opacity = '0';

          if (morphSubtext2) {
            morphSubtext2.style.filter = 'none';
            morphSubtext2.style.opacity = '1';
          }
          if (morphSubtext1) {
            morphSubtext1.style.filter = 'none';
            morphSubtext1.style.opacity = '0';
          }
          morphAnimId = null;
        }
      }

      morphAnimId = requestAnimationFrame(update);
    }

    function showPanel(index) {
      const n = cards.length;
      cards.forEach((card, i) => {
        card.classList.remove('active', 'prev', 'next', 'far-prev', 'far-next');
        const diff = ((i - index) % n + n) % n;
        if (diff === 0) card.classList.add('active');
        else if (diff === 1) card.classList.add('next');
        else if (diff === 2) card.classList.add('far-next');
        else card.classList.add('prev');
      });
      dots.forEach((d, i) => {
        d.classList.toggle('active', i === index);
      });
      morphTo(titles[index], subtitles[index]);
      current = index;
    }

    function nextPanel() {
      showPanel((current + 1) % cards.length);
    }

    function prevPanel() {
      showPanel((current - 1 + cards.length) % cards.length);
    }

    function startAutoplay() {
      stopAutoplay();
      if (!reducedMotion && !isPaused && isVisible) {
        autoplayTimer = setInterval(nextPanel, 2500);
      }
    }

    function stopAutoplay() {
      if (autoplayTimer) {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    }

    // Dot clicks
    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.dataset.carouselDot, 10);
        showPanel(idx);
      });
    });

    // Arrow clicks
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        prevPanel();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        nextPanel();
      });
    }

    // Touch interactions: pause when touched, resume when touch ends
    carousel.addEventListener('touchstart', () => {
      isPaused = true;
      stopAutoplay();
    }, { passive: true });

    carousel.addEventListener('touchend', () => {
      isPaused = false;
      startAutoplay();
    }, { passive: true });

    carousel.addEventListener('touchcancel', () => {
      isPaused = false;
      startAutoplay();
    }, { passive: true });

    // Pause on hover
    carousel.addEventListener('mouseenter', () => {
      isPaused = true;
      stopAutoplay();
    });

    carousel.addEventListener('mouseleave', () => {
      isPaused = false;
      startAutoplay();
    });

    // Pause when offscreen
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisible = entry.isIntersecting;
          if (isVisible) {
            startAutoplay();
          } else {
            stopAutoplay();
          }
        });
      },
      { threshold: 0.1 }
    );
    visibilityObserver.observe(carousel);

    // Start
    if (!reducedMotion) {
      startAutoplay();
    }
  }

  // --- FAQ Accordion ---
  const faqItems = document.querySelectorAll('.faq-item');
  if (faqItems.length > 0) {
    faqItems.forEach(item => {
      const question = item.querySelector('.faq-question');
      const answer = item.querySelector('.faq-answer');
      const content = item.querySelector('.faq-answer-content');
      
      question.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        
        // Toggle clicked item (multiple open behavior)
        if (isActive) {
          // Collapse
          answer.style.maxHeight = '0px';
          item.classList.remove('active');
          question.setAttribute('aria-expanded', 'false');
        } else {
          // Expand - calculate actual content height
          const contentHeight = content.scrollHeight;
          answer.style.maxHeight = contentHeight + 'px';
          item.classList.add('active');
          question.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

})();
