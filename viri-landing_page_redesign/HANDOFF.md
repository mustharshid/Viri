# Viri Redesign — Developer Handoff

## Project Overview

This is the redesigned Viri landing site, built to replace the existing `local-clone` site. It is a static HTML/CSS/JS site with no build tools, no frameworks, and no backend. All files are ready to deploy as-is.

**Stack:** HTML5, vanilla CSS (custom properties), vanilla JS (ES6+), Google Fonts CDN

**Pages:**
| File | Purpose |
|---|---|
| `index.html` | Landing page — hero, carousel, tools grid, how it works, pricing, FAQ, CTA |
| `faq.html` | Full FAQ page — 6 categories, 20 questions, accordion |
| `login.html` | Email + password login form |
| `register.html` | 6-field registration form with ToS/Privacy Policy checkbox and modals |

---

## File Structure

```
viri-redesign/
├── css/
│   └── style.css              (62.9 KB, 3,284 lines)
├── js/
│   └── main.js                (16.6 KB, 514 lines)
├── img/
│   ├── favicon.png            (443 KB — see note below)
│   ├── logo_en.png            (511 KB)
│   ├── logo_dv_en.png         (833 KB)
│   ├── logo_bml.png           (unused)
│   └── logo_mib.png           (unused)
├── index.html
├── faq.html
├── login.html
├── register.html
└── HANDOFF.md                 (this file)
```

**Note:** `logo_bml.png` and `logo_mib.png` exist in `/img` but are not referenced anywhere in the HTML. They can be removed. `favicon.png` is oversized at 443 KB — consider optimizing to ~10-30 KB.

---

## Fonts

Loaded from Google Fonts on every page:
- **DM Serif Display** — all headings (Georgia serif is the fallback)
- **IBM Plex Mono** — all data/terminal text, labels, mono-styled elements

**Loading strategy:** `media="print" onload="this.media='all'"` pattern avoids render-blocking. A `<noscript>` fallback is included. Do not change this pattern without understanding the performance implication.

---

## Design Tokens (CSS Custom Properties)

All tokens are in `:root` at the top of `style.css`. Key ones:

### Colors
```css
--bg-primary: #08090d;        /* Page background */
--bg-surface: #0f1117;        /* Card backgrounds */
--bg-elevated: #161922;       /* Input fields */
--bg-card: rgba(15, 17, 23, 0.6);  /* Glassmorphism cards */

--accent: #10b981;            /* Emerald green — primary accent */
--accent-dim: #059669;        /* Darker green for hover states */
--accent-glow: rgba(16, 185, 129, 0.15);

--text-primary: #f0f2f5;
--text-secondary: #8b8fa3;
--text-muted: #5a5e73;

--border: rgba(255, 255, 255, 0.06);
--border-hover: rgba(255, 255, 255, 0.12);
```

### Typography Scale
```css
--section-pad: 120px;         /* 64px on mobile */
--container-max: 1200px;
--grid-gap: 24px;
```

### Motion
```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--duration-fast: 150ms;
--duration-normal: 300ms;
--duration-slow: 600ms;
```

### Z-Index
```css
--z-bg: 0;          /* Particle canvas */
--z-content: 1;     /* Page sections */
--z-nav: 50;        /* Sticky nav */
--z-overlay: 100;   /* Overlays */
/* Modal overlay uses hardcoded 9999 */
```

---

## The Carousel (Most Complex Component)

This is a **custom 3D depth-of-field carousel with morphing text**. No external libraries. Read this section carefully.

### Architecture
- **HTML:** `<section data-carousel>` in `index.html` (line 60)
- **JS controller:** `main.js` lines 226–484
- **CSS:** `style.css` lines 344–638 (states), 2757–2839 (mobile override)

### 4 Panels
1. **Verification Panel** — search transactions
2. **Transaction Ledger** — unified transaction view
3. **Reports Suite** — cash flow charts
4. **Statement Generator** — PDF generation

### 3D Positioning (CSS classes)
Each card moves through 5 states:
- **`.active`** — center, `scale(1)`, no blur, z-index 3, green accent glow
- **`.prev`** — `translateX(-52%)`, `scale(0.72)`, `rotateY(8deg)`, blur(6px)
- **`.next`** — `translateX(52%)`, `scale(0.72)`, `rotateY(-8deg)`, blur(6px)
- **`.far-prev`** — `translateX(-100%)`, `scale(0.5)`, `rotateY(15deg)`, blur(12px)
- **`.far-next`** — `translateX(100%)`, `scale(0.5)`, `rotateY(-15deg)`, blur(12px)

The viewport uses `perspective: 1200px`. Cards are absolutely positioned, centered via `left:50%; margin-left:-340px` (max-width 680px).

### Morphing Text (The Gooey Effect)

This is the most unusual part. Two text spans overlap and morph using an SVG filter:

**The SVG filter** (in `index.html`, lines 848–859):
```xml
<filter id="threshold">
  <feColorMatrix type="matrix"
    values="1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 255 -140" />
</filter>
```

**How it works:**
1. Two `<span>` elements (`.morph-text-1` and `.morph-text-2`) are positioned on top of each other
2. The outgoing text blurs from `blur(0)` to `blur(8px)` while fading out
3. The incoming text blurs from `blur(8px)` to `blur(0)` while fading in
4. The SVG `feColorMatrix` applies an alpha threshold: any pixel with alpha below a cutoff becomes fully transparent
5. At the crossover point, the blur causes the two text shapes to merge briefly, and the threshold filter turns that merge into a gooey/liquid morph

**The animation** is driven by `requestAnimationFrame` in `main.js` (`morphTo` function, lines 260–376):
- Duration: 800ms
- Blur: inverse-square easing
- Opacity: `Math.pow(fraction, 0.2)` — this creates a midpoint-heavy crossfade where both texts are visible simultaneously for longer, maximizing the morph effect

**The same pattern applies to subheadings** (`.morph-subtext-1` / `.morph-subtext-2`) with a 4px max blur.

### Autoplay
- 2,500ms interval
- Pauses on hover, touch, and when the carousel scrolls offscreen (via `IntersectionObserver`)
- Disabled entirely when `prefers-reduced-motion: reduce` is active

### Active Card Glow
`@keyframes card-glow-breathe` — 6-second infinite pulse on the active card's `::before` pseudo-element using `box-shadow: 0 0 80px var(--accent-glow)`.

### Mobile (≤768px)
- SVG threshold filter is **disabled** (`filter: none !important`) — morphing doesn't work well at mobile sizes
- All cards collapse to stacked positioning (not 3D)
- Track height forced to 580px
- Only the active card is visible; others are `opacity: 0; visibility: hidden`

### Controls
- Arrow buttons: 48×48px circular, glassmorphism backdrop-filter
- Dot indicators: 8px circles, active dot expands to 10px with green glow
- Dot-grid background behind the carousel section using `radial-gradient`

---

## Particle Canvas Background

- Full-screen `<canvas id="particle-canvas">` with `position: fixed`
- Grid-based particles (18px gap, 1.2px size)
- Wave displacement using `sin`/`cos`
- Mouse interaction: 120px push radius with squared-distance optimization
- Two-pass rendering: batch draw for static particles, individual draw for mouse-affected ones
- Hidden entirely when `prefers-reduced-motion: reduce`

---

## Scroll Reveal System

- `IntersectionObserver` at threshold 0.1
- `.reveal` elements get `.visible` class when they enter viewport
- `.reveal-delay-N` classes add 100ms incremental delays
- `[data-stagger]` containers dynamically add reveal classes to children
- Passive scroll listeners for nav background toggle (threshold: 20px)

---

## FAQ Page

- 6 categories, 20 questions total
- Accordion: toggle `.active` class, `max-height` transition with `scrollHeight` measurement
- Multiple items can be open simultaneously
- `aria-expanded` attribute toggled for accessibility
- Chevron SVG rotates 180° on `.active`
- Transition: `max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)`

---

## Auth Pages & Modals

### Login (`login.html`)
- Simple email + password form
- Demo-only submit handler (no backend)
- Links to register page

### Register (`register.html`)
- 6 fields: Company Name, Admin Name, Admin Email, Admin Phone, Password, Confirm Password
- **Checkbox:** "I agree to the Terms of Service and Privacy Policy, and confirm I'm authorised to connect the accounts I'd like to link."
- Links to ToS/Privacy Policy modals
- Client-side validation: password match, checkbox checked

### Modal System
- Two modals: Terms of Service and Privacy Policy (full legal text inline)
- Open: click `.modal-link[data-modal]` → finds modal by ID, removes `hidden` attribute
- Close: X button, overlay click, or Escape key
- Body scroll locked when modal is open (`overflow: hidden`)
- CSS: `.modal-overlay[hidden] { display: none !important; }` — this override is important

---

## Responsive Breakpoints

### ≤1024px (Tablet)
- Tools grid collapses to single column
- How-it-works steps collapse to single column
- Pricing grid reduces gap, featured card loses scale

### ≤768px (Mobile)
- Section padding: 64px
- Nav logo shrinks, "Sign in" link hidden
- Carousel: 3D effect disabled, cards stacked, SVG filter off
- All grids single-column
- Footer stacks vertically
- Terminal body gets scroll (max-height 520px)

### `prefers-reduced-motion: reduce`
- All animations set to 0.01ms
- Particle canvas hidden
- Carousel morphs switch instantly (no blur)
- Autoplay disabled
- `.reveal` elements immediately visible

---

## Performance Optimizations

1. **Non-blocking font loading** — `media="print" onload` pattern
2. **No render-blocking JS** — single `main.js` at end of `<body>`
3. **Passive scroll listeners** — `{ passive: true }` on scroll events
4. **IntersectionObserver** — for scroll reveals and carousel visibility (no scroll event polling)
5. **Image attributes** — explicit `width`/`height` on all `<img>` (prevents layout shift), `decoding="async"` on all
6. **LCP optimization** — `fetchpriority="high"` + `loading="eager"` on nav and hero logos
7. **GPU acceleration** — `will-change: transform, opacity` on carousel cards
8. **Squared-distance optimization** — pre-calculated `mouseRadiusSq` in particle system
9. **Batch rendering** — particle canvas draws static particles in single `beginPath/fill`
10. **Reduced motion** — full support via `prefers-reduced-motion` media query

---

## Known Issues / Things to Watch

1. **`favicon.png` is 443 KB** — way too large for a favicon. Should be optimized to ~10-30 KB.
2. **`logo_dv_en.png` is 833 KB** — largest asset. Consider WebP conversion or responsive sizing.
3. **`logo_bml.png` and `logo_mib.png` are unused** — can be deleted.
4. **No backend** — all form submissions are demo-only (simulated with `setTimeout` + `alert()`).
5. **SVG filter for morphing** — the `#threshold` filter is defined in both `index.html` and `faq.html`. If you add more pages with the carousel, you'll need to include it again.
6. **Modal z-index** — hardcoded to `9999` rather than using the token system.
7. **Mobile carousel** — the 3D effect is completely disabled on mobile. The morphing text filter is also disabled. This is intentional — the effect doesn't work well at small sizes.
8. **No `<meta>` OG tags** — social sharing previews won't work without Open Graph tags.
9. **Cache busting** — `register.html` references `css/style.css?v=2`. If you deploy, strip the query string or use a proper cache-busting strategy.
10. **Contact email** — both ToS and Privacy Policy have `[Insert Contact Email]` as placeholder.

---

## Deployment

This is a static site. Deploy by copying the entire `viri-redesign/` directory to any static hosting provider (Netlify, Vercel, S3, etc.) or serve from any web server.

No build step required. No dependencies to install.

The server can be started locally with:
```bash
cd viri-redesign
python3 -m http.server 8888
```

For LAN access (testing on mobile):
```bash
python3 -m http.server 8888 --bind 0.0.0.0
```
Then access at `http://<your-local-ip>:8888`.
