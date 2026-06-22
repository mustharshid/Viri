import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, LogOut } from 'lucide-react';

export default function AdminDashboard() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('viri_token');
      if (!token) throw new Error('Not logged in');

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      };

      const userRes = await fetch('/api/me', { headers });
      if (!userRes.ok) throw new Error('Unauthorized');
      const userData = await userRes.json();
      
      if (userData.user.role !== 'superadmin') {
        throw new Error('Not an admin');
      }

      const compRes = await fetch('/api/admin/companies', { headers });
      setCompanies(await compRes.json());

    } catch (err) {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('viri_token');
    if (token) {
      await fetch('/api/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }});
    }
    localStorage.removeItem('viri_token');
    navigate('/login');
  };

  const updateCompany = async (id: number, status: string, tier: string) => {
    const token = localStorage.getItem('viri_token');
    await fetch(`/api/admin/companies/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, subscription_tier: tier })
    });
    fetchData();
  };

  if (loading) return <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <img src="/logo_en.png" alt="Viri Logo" className="h-8 object-contain" />
              <span className="text-[var(--text-secondary)] text-lg font-normal border-l border-zinc-700 pl-3">Superadmin Portal</span>
            </h1>
            <p className="text-[var(--text-secondary)]">Manage tenant subscriptions and approvals</p>
          </div>
          <button onClick={handleLogout} className="btn btn-outline flex items-center gap-2">
            <LogOut size={16} /> Logout
          </button>
        </header>

        <div className="glass-panel p-6 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-[var(--text-secondary)]">
                <th className="py-3 px-4">Company Name</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Subscription Tier</th>
                <th className="py-3 px-4">Verifications (Used)</th>
                <th className="py-3 px-4">Terminals</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(company => (
                <tr key={company.id} className="border-b border-[var(--border-color)] last:border-0 hover:bg-white/5">
                  <td className="py-4 px-4 font-bold">{company.name}</td>
                  <td className="py-4 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${company.status === 'active' ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
                      {company.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <select 
                      className="input-field py-1 px-2 h-auto text-sm"
                      value={company.subscription_tier}
                      onChange={(e) => updateCompany(company.id, company.status, e.target.value)}
                    >
                      <option value="free">Free</option>
                      <option value="499">MVR 499</option>
                      <option value="999">MVR 999</option>
                      <option value="1999">MVR 1999</option>
                    </select>
                  </td>
                  <td className="py-4 px-4 font-mono text-sm">{company.verifications_count}</td>
                  <td className="py-4 px-4 font-mono text-sm">{company.terminals?.length || 0}</td>
                  <td className="py-4 px-4">
                    {company.status === 'pending' ? (
                      <button 
                        onClick={() => updateCompany(company.id, 'active', company.subscription_tier)}
                        className="btn btn-success text-xs py-1 px-3 flex items-center gap-1"
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                    ) : (
                      <button 
                        onClick={() => updateCompany(company.id, 'pending', company.subscription_tier)}
                        className="btn btn-outline text-xs py-1 px-3 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                      >
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {companies.length === 0 && <div className="text-center py-8 text-[var(--text-secondary)]">No companies registered yet.</div>}
        </div>

      </div>
    </div>
  );
}
