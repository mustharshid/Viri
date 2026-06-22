import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed. Check your credentials.');
      }

      // Store token
      localStorage.setItem('viri_token', data.access_token);
      
      // Redirect based on role
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
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-6 text-[var(--text-primary)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-4">
            <img src="/logo_en.png" alt="Viri Logo" className="h-40 mx-auto object-contain" />
          </Link>
          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="text-[var(--text-secondary)] mt-2">Log in to manage your Viri account.</p>
        </div>

        <div className="glass-panel p-8">
          {error && <div className="p-3 mb-6 bg-red-900/30 border border-red-500/50 rounded text-red-200 text-sm">{error}</div>}
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="input-group">
              <label className="input-label">Email</label>
              <input type="email" required className="input-field" value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <input type="password" required className="input-field" value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            <button type="submit" disabled={loading} className={`btn btn-success w-full py-3 mt-4 justify-center ${loading ? 'opacity-70' : ''}`}>
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </form>

          <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
            Don't have an account? <Link to="/register" className="text-[var(--color-success)] hover:underline">Register your company</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
