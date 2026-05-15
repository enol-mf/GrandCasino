import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Lobby from './pages/Lobby';
import Admin from './pages/Admin';
import Blackjack from './pages/games/Blackjack';
import RideTheBus from './pages/games/RideTheBus';
import Plinko from './pages/games/Plinko';
import Roulette from './pages/games/Roulette';
import Slots from './pages/games/Slots';
import Racing from './pages/games/Racing';
import Crash from './pages/games/Crash';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  return (
    <>
      {user && <Navbar />}
      <Routes>
        <Route path="/" element={<Navigate to={user ? '/lobby' : '/login'} replace />} />
        <Route path="/login" element={user ? <Navigate to="/lobby" replace /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/lobby" replace /> : <Register />} />
        <Route path="/lobby" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
        <Route path="/games/blackjack" element={<ProtectedRoute><Blackjack /></ProtectedRoute>} />
<Route path="/games/plinko" element={<ProtectedRoute><Plinko /></ProtectedRoute>} />
        <Route path="/games/roulette" element={<ProtectedRoute><Roulette /></ProtectedRoute>} />
        <Route path="/games/slots" element={<ProtectedRoute><Slots /></ProtectedRoute>} />
        <Route path="/games/racing" element={<ProtectedRoute><Racing /></ProtectedRoute>} />
        <Route path="/games/crash" element={<ProtectedRoute><Crash /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
