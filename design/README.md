# Viri Design System

This folder contains the visual design system for the Viri platform, including color palette, typography, dark mode, and micro‑animations.

## Palette
- **Background**: #0A0A0A (deep charcoal)
- **Surface**: #1E1E1E (dark gray)
- **Primary**: #00FFAA (emerald accent)
- **Secondary**: #FFAA00 (amber accent)
- **Text**: #F0F0F0 (off‑white)

## Typography
- **Font**: Inter (Google Fonts) – weight 400‑600.
- **Headings**: 1.5rem – 2.5rem, bold.
- **Body**: 1rem, regular.

## Dark Mode & Glassmorphism
- Use `backdrop-filter: blur(12px)` on surface cards with subtle opacity.
- CSS variables are defined in `style.css` for easy theming.

## Micro‑Animations
- Hover scale (1.02) on interactive cards.
- Fade‑in on page load (0.3s).
- Ripple effect on button clicks.
