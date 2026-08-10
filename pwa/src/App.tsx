import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import FaqPage from './pages/FaqPage';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import CompanyDashboard from './pages/Dashboard/CompanyDashboard';
import AdminDashboard from './pages/Dashboard/AdminDashboard';
import CashierApp from './pages/Cashier/CashierApp';
import MibLogin from './pages/Cashier/MibLogin';

import AffiliatePortal from './pages/Affiliate/AffiliatePortal';
import AffiliateRegister from './pages/Affiliate/AffiliateRegister';
import { useParams } from 'react-router-dom';

function RefRedirect() {
  const { code } = useParams();
  return <Navigate to={`/register?ref=${code}`} replace />;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/ref/:code" element={<RefRedirect />} />
        
        {/* Affiliate Portal & Registration */}
        <Route path="/affiliate/register" element={<AffiliateRegister />} />
        <Route path="/affiliate/join" element={<AffiliateRegister />} />
        <Route path="/affiliate/*" element={<AffiliatePortal />} />
        
        {/* Protected Routes */}
        <Route path="/company/*" element={<CompanyDashboard />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
        
        <Route path="/cashier" element={<CashierApp />} />
        <Route path="/cashier/mib-login" element={<MibLogin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
