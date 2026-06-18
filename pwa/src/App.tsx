import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import CompanyDashboard from './pages/Dashboard/CompanyDashboard';
import AdminDashboard from './pages/Dashboard/AdminDashboard';
import CashierApp from './pages/Cashier/CashierApp';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Protected Routes would normally have an AuthGuard here */}
        <Route path="/company/*" element={<CompanyDashboard />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
        
        <Route path="/cashier" element={<CashierApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
