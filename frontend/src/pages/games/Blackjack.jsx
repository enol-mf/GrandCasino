import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import Card from '../../components/Card';

const STATUS_LABELS = {
  blackjack:        'Blackjack. Ganaste.',
  dealer_blackjack: 'Blackjack del crupier. Perdiste.',
  push:             'Empate. Te devuelven la apuesta.',
  win:              'Ganaste.',
  lose:             'Perdiste.',
  bust:             'Te pasaste. Perdiste.',
};

export default function Blackjack() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [bet, setBet] = useState(50);
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const startGame = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/games/blackjack/start', { bet });
      setGame(data);
      if (data.done) await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const doAction = async (action) => {
    setError('');
    setActionLoading(true);
    try {
      const data = await api.post('/games/blackjack/action', { action });
      setGame(data);
      if (data.done) await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const reset = () => setGame(null);

  const canDouble = !game?.done && game?.canDouble && game?.playerHand?.length === 2;

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-sm btn-outline" onClick={() => navigate('/lobby')}>&larr; Volver</button>
        <h1>Blackjack</h1>
        <span className="balance-chip">{user?.balance?.toLocaleString()} fichas</span>
      </div>

      {!game ? (
        <div className="bet-panel">
          <h2>Apuesta</h2>
          <div className="bet-controls">
            <button className="btn btn-sm btn-outline" onClick={() => setBet(b => Math.max(1, b - 25))}>-25</button>
            <input
              type="number"
              className="bet-input"
              value={bet}
              min={1}
              max={user?.balance}
              onChange={e => setBet(Math.max(1, parseInt(e.target.value) || 1))}
            />
            <button className="btn btn-sm btn-outline" onClick={() => setBet(b => Math.min(user?.balance || b, b + 25))}>+25</button>
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn btn-primary btn-lg" onClick={startGame} disabled={loading || bet <= 0 || bet > (user?.balance || 0)}>
            {loading ? 'Repartiendo...' : 'Repartir'}
          </button>
        </div>
      ) : (
        <div className="bj-table">
          <div className="bj-section">
            <h3>Crupier {game.done ? `(${game.dealerValue})` : ''}</h3>
            <div className="hand">
              {game.dealerHand?.map((card, i) => <Card key={i} card={card} />)}
            </div>
          </div>

          <div className="bj-section">
            <h3>Tú ({game.playerValue})</h3>
            <div className="hand">
              {game.playerHand?.map((card, i) => <Card key={i} card={card} />)}
            </div>
          </div>

          {game.done ? (
            <div className="game-result">
              <div className={`result-banner result-${game.status}`}>
                {STATUS_LABELS[game.status] || game.status}
              </div>
              <p>Saldo: {game.balance?.toLocaleString()} fichas</p>
              <button className="btn btn-primary" onClick={reset}>Otra mano</button>
            </div>
          ) : (
            <div className="bj-actions">
              {error && <div className="error-msg">{error}</div>}
              <button className="btn btn-primary" onClick={() => doAction('hit')} disabled={actionLoading}>Pedir</button>
              <button className="btn btn-secondary" onClick={() => doAction('stand')} disabled={actionLoading}>Plantarse</button>
              {canDouble && (
                <button className="btn btn-gold" onClick={() => doAction('double')} disabled={actionLoading}>Doblar</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
