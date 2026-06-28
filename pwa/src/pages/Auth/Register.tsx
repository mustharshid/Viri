import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Register() {
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          company_name: companyName,
          name,
          email,
          phone_number: phoneNumber,
          password,
          password_confirmation: passwordConfirmation
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed. Check your inputs.');
      }

      // Store token
      localStorage.setItem('viri_token', data.access_token);
      
      // Navigate to company dashboard
      navigate('/company');

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
          <h2 className="text-2xl font-bold">Create your company</h2>
          <p className="text-[var(--text-secondary)] mt-2">Start verifying bank transfers securely.</p>
        </div>

        <div className="glass-panel p-8">
          {error && <div className="p-3 mb-6 bg-red-900/30 border border-red-500/50 rounded text-red-200 text-sm">{error}</div>}
          
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="input-group">
              <label className="input-label">Company Name</label>
              <input type="text" required className="input-field" value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </div>

            <div className="input-group">
              <label className="input-label">Admin Name</label>
              <input type="text" required className="input-field" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="input-group">
              <label className="input-label">Admin Email</label>
              <input type="email" required className="input-field" value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            <div className="input-group">
              <label className="input-label">Admin Phone Number</label>
              <input type="text" required className="input-field" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <input type="password" required minLength={8} className="input-field" value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            <div className="input-group">
              <label className="input-label">Confirm Password</label>
              <input type="password" required minLength={8} className="input-field" value={passwordConfirmation} onChange={e => setPasswordConfirmation(e.target.value)} />
            </div>

            <button type="submit" disabled={loading} className={`btn btn-success w-full py-3 mt-4 justify-center ${loading ? 'opacity-70' : ''}`}>
              {loading ? 'Creating Account...' : 'Register Company'}
            </button>
          </form>

          <p className="text-center text-sm text-[var(--text-secondary)] mt-6">
            Already have an account? <Link to="/login" className="text-[var(--color-success)] hover:underline">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
