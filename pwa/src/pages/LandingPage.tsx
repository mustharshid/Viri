import { Link } from 'react-router-dom';
import { Shield, Zap, Lock } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Navbar */}
      <nav className="w-full flex justify-between items-center p-6 max-w-6xl mx-auto">
        <div className="text-2xl font-bold tracking-wider">VIRI<span className="text-[var(--color-success)]">.</span></div>
        <div className="flex gap-4">
          <Link to="/login" className="btn btn-outline">Log in</Link>
          <Link to="/register" className="btn btn-success">Get Started</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 pt-20 pb-32 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-color)] text-sm mb-8 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse"></span>
          Zero-Knowledge Verification Engine
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          Verify Bank Transfers <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-success)] to-emerald-300">Instantly & Securely.</span>
        </h1>
        
        <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          Stop checking your phone for SMS receipts. Viri securely connects to BML and MIB to instantly verify customer transfers directly at your cashier terminal.
        </p>

        <div className="flex justify-center gap-4 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <Link to="/register" className="btn btn-success text-lg py-4 px-8">Start Free Trial</Link>
          <a href="#pricing" className="btn btn-outline text-lg py-4 px-8">View Pricing</a>
        </div>
      </main>

      {/* Features */}
      <section className="bg-[var(--bg-surface)] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="glass-panel text-left p-8">
              <Zap className="text-[var(--color-success)] mb-4" size={32} />
              <h3 className="text-xl font-bold mb-2">Instant Verification</h3>
              <p className="text-[var(--text-secondary)]">No more waiting for SMS. The terminal verifies the transfer the second the money hits your account.</p>
            </div>
            <div className="glass-panel text-left p-8">
              <Lock className="text-[var(--color-success)] mb-4" size={32} />
              <h3 className="text-xl font-bold mb-2">Zero-Knowledge</h3>
              <p className="text-[var(--text-secondary)]">Your bank passwords never leave your computer. The Viri Cloud never sees your credentials.</p>
            </div>
            <div className="glass-panel text-left p-8">
              <Shield className="text-[var(--color-success)] mb-4" size={32} />
              <h3 className="text-xl font-bold mb-2">Fraud Protection</h3>
              <p className="text-[var(--text-secondary)]">Eliminate fake receipt scams permanently. Our engine verifies the actual cryptographic bank ledger.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-[var(--text-secondary)]">Choose the plan that fits your business volume.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          
          <div className="glass-panel p-8 flex flex-col relative">
            <h3 className="text-2xl font-bold mb-2">Starter</h3>
            <div className="text-4xl font-extrabold mb-6">MVR 499<span className="text-lg font-normal text-[var(--text-secondary)]">/mo</span></div>
            <ul className="space-y-4 mb-8 flex-1 text-[var(--text-secondary)]">
              <li className="flex gap-2 items-center"><CheckCircle size={18} className="text-[var(--color-success)]"/> Up to 300 Verifications</li>
              <li className="flex gap-2 items-center"><CheckCircle size={18} className="text-[var(--color-success)]"/> 2 Bank Accounts</li>
              <li className="flex gap-2 items-center"><CheckCircle size={18} className="text-[var(--color-success)]"/> Standard Support</li>
            </ul>
            <Link to="/register" className="btn btn-outline w-full py-3 justify-center">Get Started</Link>
          </div>

          <div className="glass-panel p-8 flex flex-col relative border-[var(--color-success)] shadow-[0_0_30px_rgba(34,197,94,0.1)]">
            <div className="absolute top-0 right-8 transform -translate-y-1/2 bg-[var(--color-success)] text-black text-xs font-bold px-3 py-1 rounded-full">MOST POPULAR</div>
            <h3 className="text-2xl font-bold mb-2">Growth</h3>
            <div className="text-4xl font-extrabold mb-6">MVR 999<span className="text-lg font-normal text-[var(--text-secondary)]">/mo</span></div>
            <ul className="space-y-4 mb-8 flex-1 text-[var(--text-secondary)]">
              <li className="flex gap-2 items-center"><CheckCircle size={18} className="text-[var(--color-success)]"/> <strong>Unlimited</strong> Verifications</li>
              <li className="flex gap-2 items-center"><CheckCircle size={18} className="text-[var(--color-success)]"/> 4 Bank Accounts</li>
              <li className="flex gap-2 items-center"><CheckCircle size={18} className="text-[var(--color-success)]"/> Priority Support</li>
            </ul>
            <Link to="/register" className="btn btn-success w-full py-3 justify-center text-black">Get Started</Link>
          </div>

          <div className="glass-panel p-8 flex flex-col relative">
            <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
            <div className="text-4xl font-extrabold mb-6">MVR 1999<span className="text-lg font-normal text-[var(--text-secondary)]">/mo</span></div>
            <ul className="space-y-4 mb-8 flex-1 text-[var(--text-secondary)]">
              <li className="flex gap-2 items-center"><CheckCircle size={18} className="text-[var(--color-success)]"/> <strong>Unlimited</strong> Verifications</li>
              <li className="flex gap-2 items-center"><CheckCircle size={18} className="text-[var(--color-success)]"/> 20 Bank Accounts</li>
              <li className="flex gap-2 items-center"><CheckCircle size={18} className="text-[var(--color-success)]"/> 24/7 Dedicated Support</li>
            </ul>
            <Link to="/register" className="btn btn-outline w-full py-3 justify-center">Get Started</Link>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border-color)] py-8 text-center text-[var(--text-secondary)]">
        <p>© 2026 Viri Zero-Knowledge Architecture. All rights reserved.</p>
      </footer>
    </div>
  );
}

// Inline CheckCircle component to avoid extra imports if missed
function CheckCircle({ size, className }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  );
}
