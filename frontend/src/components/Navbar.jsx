import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/lobby" className="navbar-brand">Grand Casino</Link>
      <div className="navbar-links">
        {user?.is_admin && <Link to="/admin" className="admin-link">Admin</Link>}
      </div>
      <div className="navbar-right">
        <span className="balance-display">{user?.balance?.toLocaleString()} fichas</span>
        <span className="username">{user?.username}</span>
        <button className="btn btn-sm btn-outline" onClick={handleLogout}>Salir</button>
      </div>
    </nav>
  );
}
