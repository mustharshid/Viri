import { Link } from 'react-router-dom';
import { Shield, Zap, Lock, ArrowRight, Activity, Terminal } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#f8fafc] overflow-hidden relative font-sans">
      
      {/* Background Decorative Blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#10b981] rounded-full mix-blend-screen filter blur-[150px] opacity-20 animate-pulse-glow"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#3b82f6] rounded-full mix-blend-screen filter blur-[150px] opacity-20 animate-pulse-glow" style={{ animationDelay: '2s' }}></div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 w-full flex justify-between items-center px-8 pt-1.5 pb-4 max-w-7xl mx-auto backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <img src="/logo_en.png" alt="Viri Logo" className="h-32 object-contain" />
        </div>
        <div className="flex gap-4 items-center">
          <Link to="/login" className="text-sm font-medium text-gray-300 hover:text-white transition-colors mr-4">Sign in</Link>
          <Link to="/register" className="btn bg-white text-black hover:bg-gray-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] rounded-full px-6 py-2.5 font-semibold text-sm">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-5 pb-32 flex flex-col items-center text-center">
        
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm mb-5 animate-fade-in backdrop-blur-md">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10b981]"></span>
          </span>
          <span className="text-gray-300">Zero-Knowledge Ledger Architecture Live</span>
        </div>
        
        <img src="/logo_dv_en.png" alt="Viri logo" className="h-[134px] md:h-[173px] object-contain mb-3 animate-fade-in" style={{ animationDelay: '0.05s' }} />
        <h1 className="text-6xl md:text-8xl font-heading font-extrabold tracking-tight mb-8 animate-fade-in leading-[1.1]" style={{ animationDelay: '0.1s' }}>
          Secure verifications. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] via-[#34d399] to-[#3b82f6]">
            Lightning fast.
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto mb-12 animate-fade-in font-light leading-relaxed" style={{ animationDelay: '0.2s' }}>
          Viri connects your cashier terminal directly to the bank ledger. Stop relying on SMS receipts and start verifying transfers instantly with military-grade cryptography.
        </p>

        <div className="flex flex-col sm:flex-row justify-center gap-4 animate-fade-in w-full sm:w-auto" style={{ animationDelay: '0.3s' }}>
          <Link to="/register" className="btn bg-[#10b981] hover:bg-[#059669] text-white text-lg py-4 px-8 rounded-full shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2 group">
            Start free trial 
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <a href="#pricing" className="btn bg-white/5 hover:bg-white/10 border border-white/10 text-white text-lg py-4 px-8 rounded-full backdrop-blur-md transition-all flex items-center justify-center">
            View pricing
          </a>
        </div>

        {/* Floating Mockup / Visual Element */}
        <div className="mt-24 w-full max-w-5xl relative animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent z-10 h-full"></div>
          <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-float">
            <div className="bg-black/50 border-b border-white/5 p-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              <div className="mx-auto text-xs text-gray-500 font-mono flex items-center gap-2"><Lock size={12}/> viri.thinksafe.mv/cashier</div>
            </div>
            <div className="p-8 bg-[#0a0a0a] grid md:grid-cols-2 gap-8 text-left relative">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
              <div className="space-y-6 relative z-10">
                <div className="flex justify-between items-center border-b border-white/10 pb-4">
                  <div className="text-gray-400 font-mono">Terminal ID: <span className="text-white">term_8x92a...</span></div>
                  <div className="text-[#10b981] flex items-center gap-2 text-sm"><Activity size={16}/> Connected</div>
                </div>
                <div className="bg-[#111] border border-white/5 p-6 rounded-xl">
                  <h3 className="text-2xl font-bold mb-1">Verify Transfer</h3>
                  <p className="text-sm text-gray-500 mb-6">Waiting for incoming ledger entries...</p>
                  <div className="h-12 bg-white/5 rounded-lg border border-white/10 flex items-center px-4 w-full animate-pulse">
                    <span className="text-gray-600">Enter receipt amount...</span>
                  </div>
                  <button className="mt-4 w-full bg-[#10b981]/20 text-[#10b981] font-semibold py-3 rounded-lg flex items-center justify-center gap-2 border border-[#10b981]/30">
                    <Terminal size={18} /> Initialize Scanner
                  </button>
                </div>
              </div>
              <div className="bg-black/40 border border-white/5 rounded-xl p-6 relative z-10">
                <h4 className="text-sm font-mono text-gray-500 mb-4">RECENT ACTIVITY</h4>
                <div className="space-y-3">
                  {[1,2,3].map((i) => (
                    <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                          <CheckCircle size={16} className="text-green-500" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">Verified MVR 1,250</div>
                          <div className="text-xs text-gray-500">BML Transfer • Just now</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* Features Grid */}
      <section className="relative z-10 py-32 border-t border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6">Built for scale. Designed for security.</h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">The only enterprise-grade verification platform built specifically for the Maldives banking ecosystem.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Zap className="text-[#10b981]" size={32} />}
              title="Instant Verification"
              desc="No more waiting for SMS. The terminal verifies the transfer the second the money hits your account."
            />
            <FeatureCard 
              icon={<Lock className="text-[#3b82f6]" size={32} />}
              title="Zero-Knowledge"
              desc="Your bank passwords never leave your computer. The Viri Cloud never sees or stores your credentials."
            />
            <FeatureCard 
              icon={<Shield className="text-purple-500" size={32} />}
              title="Fraud Protection"
              desc="Eliminate fake receipt scams permanently. Our engine verifies the actual cryptographic bank ledger directly."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 py-32 max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6">Simple, transparent pricing.</h2>
          <p className="text-xl text-gray-400">Choose the plan that fits your business volume.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 items-center">
          
          <div className="glass-panel p-10 flex flex-col relative border-white/10 hover:border-white/20 transition-colors">
            <h3 className="text-2xl font-bold mb-2">Starter</h3>
            <p className="text-sm text-gray-400 mb-6">Perfect for small retail shops</p>
            <div className="text-5xl font-extrabold mb-8 font-heading">MVR 499<span className="text-xl font-normal text-gray-500">/mo</span></div>
            <ul className="space-y-4 mb-10 flex-1 text-gray-300">
              <li className="flex gap-3 items-center"><CheckCircle size={20} className="text-[#10b981]"/> Up to 300 Verifications</li>
              <li className="flex gap-3 items-center"><CheckCircle size={20} className="text-[#10b981]"/> 2 Bank Accounts</li>
              <li className="flex gap-3 items-center"><CheckCircle size={20} className="text-[#10b981]"/> Standard Support</li>
            </ul>
            <Link to="/register" className="btn bg-white/5 hover:bg-white/10 border border-white/10 w-full py-4 justify-center rounded-xl transition-all">Start free trial</Link>
          </div>

          <div className="glass-panel p-10 flex flex-col relative border-[#10b981]/30 shadow-[0_0_40px_rgba(16,185,129,0.15)] transform lg:scale-105 z-10 bg-[#10b981]/5 backdrop-blur-2xl">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-[#10b981] to-[#34d399] text-black text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">Most Popular</div>
            <h3 className="text-2xl font-bold mb-2">Growth</h3>
            <p className="text-sm text-gray-400 mb-6">For high volume restaurants & cafes</p>
            <div className="text-5xl font-extrabold mb-8 font-heading">MVR 999<span className="text-xl font-normal text-gray-500">/mo</span></div>
            <ul className="space-y-4 mb-10 flex-1 text-gray-200">
              <li className="flex gap-3 items-center"><CheckCircle size={20} className="text-[#10b981]"/> <strong>Unlimited</strong> Verifications</li>
              <li className="flex gap-3 items-center"><CheckCircle size={20} className="text-[#10b981]"/> 4 Bank Accounts</li>
              <li className="flex gap-3 items-center"><CheckCircle size={20} className="text-[#10b981]"/> Priority Support</li>
            </ul>
            <Link to="/register" className="btn bg-[#10b981] hover:bg-[#059669] text-white w-full py-4 justify-center rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all">Get Started Now</Link>
          </div>

          <div className="glass-panel p-10 flex flex-col relative border-white/10 hover:border-white/20 transition-colors">
            <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
            <p className="text-sm text-gray-400 mb-6">For multi-chain supermarkets</p>
            <div className="text-5xl font-extrabold mb-8 font-heading">MVR 1999<span className="text-xl font-normal text-gray-500">/mo</span></div>
            <ul className="space-y-4 mb-10 flex-1 text-gray-300">
              <li className="flex gap-3 items-center"><CheckCircle size={20} className="text-[#10b981]"/> <strong>Unlimited</strong> Verifications</li>
              <li className="flex gap-3 items-center"><CheckCircle size={20} className="text-[#10b981]"/> 20 Bank Accounts</li>
              <li className="flex gap-3 items-center"><CheckCircle size={20} className="text-[#10b981]"/> 24/7 Dedicated Support</li>
            </ul>
            <Link to="/register" className="btn bg-white/5 hover:bg-white/10 border border-white/10 w-full py-4 justify-center rounded-xl transition-all">Contact Sales</Link>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12 bg-black text-center text-gray-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo_en.png" alt="Viri Logo" className="h-24 object-contain" />
          </div>
          <p>© 2026 Viri Zero-Knowledge Architecture. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="glass-panel p-8 text-left border-white/5 hover:border-white/10 transition-colors bg-gradient-to-b from-white/[0.03] to-transparent group">
      <div className="mb-6 p-4 rounded-2xl bg-white/5 inline-block border border-white/5 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-2xl font-heading font-bold mb-3">{title}</h3>
      <p className="text-gray-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function CheckCircle({ size, className }: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  );
}
