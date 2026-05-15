import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const GAMES = [
  {
    id: 'blackjack',
    name: 'Blackjack',
    path: '/games/blackjack',
    description: 'Planta o pide carta. Gana al crupier sin pasarte de 21. Blackjack paga 3:2.',
  },
  {
    id: 'crash',
    name: 'Crash',
    path: '/games/crash',
    description: 'El cohete sube. Cobra antes de que explote. Cuanto más esperes, más ganas.',
  },
  {
    id: 'plinko',
    name: 'Plinko',
    path: '/games/plinko',
    description: 'Suelta la bola y deja que rebote entre los clavos. Multiplica tu apuesta.',
  },
  {
    id: 'roulette',
    name: 'Ruleta',
    path: '/games/roulette',
    description: 'Apuesta a un número, color o docena. La ruleta europea paga hasta 35:1.',
  },
  {
    id: 'slots',
    name: 'Tragaperras',
    path: '/games/slots',
    description: 'Tres rodillos, seis símbolos. Alinea tres iguales y gana hasta 50× tu apuesta.',
  },
  {
    id: 'racing',
    name: 'Carreras',
    path: '/games/racing',
    description: 'Caballos, galgos o caracoles. Elige tu corredor favorito y apuesta 4:1.',
  },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Lobby() {
  const { user, refresh } = useAuth();
  const [code, setCode] = useState('');
  const [promoMsg, setPromoMsg] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    api.get('/leaderboard').then(setLeaderboard).catch(() => {});
  }, []);

  const redeemCode = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setPromoMsg('');
    setPromoError('');
    setPromoLoading(true);
    try {
      const data = await api.post('/promo/redeem', { code: code.trim() });
      setPromoMsg(`Canjeado. +${data.reward_chips} fichas. Saldo: ${data.balance.toLocaleString()}`);
      setCode('');
      await refresh();
    } catch (err) {
      setPromoError(err.message);
    } finally {
      setPromoLoading(false);
    }
  };

  return (
    <div className="lobby-page">
      <div className="lobby-header">
        <h1>Hola, {user?.username}</h1>
        <div className="lobby-balance">
          <span className="balance-label">Saldo</span>
          <span className="balance-amount">{user?.balance?.toLocaleString()} fichas</span>
        </div>
      </div>

      <div className="games-grid">
        {GAMES.map(game => (
          <Link to={game.path} key={game.id} className="game-card">
            <h3>{game.name}</h3>
            <p>{game.description}</p>
            <span className="play-btn">Jugar</span>
          </Link>
        ))}
      </div>

      <div className="leaderboard">
        <h3 className="leaderboard-title">Ranking de jugadores</h3>
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>Fichas</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row, i) => (
              <tr key={row.username} className={row.username === user?.username ? 'leaderboard-me' : ''}>
                <td className="leaderboard-rank">
                  {i < 3 ? MEDALS[i] : i + 1}
                </td>
                <td className={row.username === user?.username ? 'gold' : ''}>{row.username}</td>
                <td className="leaderboard-balance">{row.balance.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="promo-section">
        <h3>Canjear código</h3>
        <form className="promo-form" onSubmit={redeemCode}>
          <input
            type="text"
            placeholder="Introduce el código"
            value={code}
            onChange={e => setCode(e.target.value)}
            className="promo-input"
          />
          <button type="submit" className="btn btn-primary" disabled={promoLoading}>
            {promoLoading ? 'Canjeando...' : 'Canjear'}
          </button>
        </form>
        {promoMsg && <div className="success-msg">{promoMsg}</div>}
        {promoError && <div className="error-msg">{promoError}</div>}
      </div>
    </div>
  );
}
