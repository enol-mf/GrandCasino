import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import Card from '../../components/Card';

const ROUND_LABELS = [
  'Roja o negra',
  'Mayor o menor',
  'Dentro o fuera',
  'Elige el palo',
];


const ROUND_OPTIONS = [
  [{ label: 'Roja', value: 'red' }, { label: 'Negra', value: 'black' }],
  [{ label: 'Mayor', value: 'higher' }, { label: 'Menor', value: 'lower' }],
  [{ label: 'Dentro', value: 'inside' }, { label: 'Fuera', value: 'outside' }],
  [
    { label: 'Treboles', value: 'clubs' },
    { label: 'Diamantes', value: 'diamonds' },
    { label: 'Corazones', value: 'hearts' },
    { label: 'Picas', value: 'spades' },
  ],
];

export default function RideTheBus() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [bet, setBet] = useState(50);
  const [game, setGame] = useState(null);
  const [cards, setCards] = useState([]);
  const [round, setRound] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const startGame = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/games/ride-the-bus/start', { bet });
      setGame(data);
      setCards([]);
      setRound(0);
      setMultiplier(1);
      setResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const guess = async (value) => {
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/games/ride-the-bus/guess', { guess: value });
      setCards(prev => [...prev, data.card]);
      if (!data.correct) {
        setResult({ won: false, message: 'Fallaste. Pierdes la apuesta.' });
        await refresh();
      } else if (data.done && data.won) {
        setRound(4);
        setMultiplier(data.multiplier);
        setResult({ won: true, message: `Completaste las 4 rondas. x${data.multiplier}` });
        await refresh();
      } else {
        setRound(data.round);
        setMultiplier(data.multiplier);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cashout = async () => {
    setLoading(true);
    try {
      const data = await api.post('/games/ride-the-bus/cashout');
      setResult({ won: true, message: `Cobrado. Ganas ${data.winnings} fichas.` });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setGame(null);
    setCards([]);
    setRound(0);
    setMultiplier(1);
    setResult(null);
  };

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-sm btn-outline" onClick={() => navigate('/lobby')}>&larr; Volver</button>
        <h1>Ride the Bus</h1>
        <span className="balance-chip">{user?.balance?.toLocaleString()} fichas</span>
      </div>

      {!game ? (
        <div className="bet-panel">
          <h2>Apuesta</h2>
          <div className="bet-controls">
            <button className="btn btn-sm btn-outline" onClick={() => setBet(b => Math.max(1, b - 25))}>-25</button>
            <input type="number" className="bet-input" value={bet} min={1} max={user?.balance}
              onChange={e => setBet(Math.max(1, parseInt(e.target.value) || 1))} />
            <button className="btn btn-sm btn-outline" onClick={() => setBet(b => Math.min(user?.balance || b, b + 25))}>+25</button>
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn btn-primary btn-lg" onClick={startGame} disabled={loading || bet <= 0 || bet > (user?.balance || 0)}>
            {loading ? 'Iniciando...' : 'Empezar'}
          </button>
        </div>
      ) : (
        <div className="rtb-table">
          <div className="rtb-info">
            <div className="rtb-stat">Apuesta: <strong>{bet.toLocaleString()}</strong></div>
            <div className="rtb-stat">Multiplicador: <strong className="gold">x{multiplier}</strong></div>
            <div className="rtb-stat">A ganar: <strong>{Math.floor(bet * multiplier).toLocaleString()}</strong></div>
          </div>

          <div className="rtb-progress">
            {['R/N', 'M/m', 'D/F', 'Palo'].map((label, i) => (
              <div key={i} className={`rtb-step ${i < round ? 'done' : i === round && !result ? 'active' : ''}`}>
                {label}
              </div>
            ))}
          </div>

          <div className="rtb-cards">
            {cards.map((card, i) => <Card key={i} card={card} />)}
          </div>

          {result ? (
            <div className="game-result">
              <div className={`result-banner result-${result.won ? 'win' : 'lose'}`}>{result.message}</div>
              <button className="btn btn-primary" onClick={reset}>Otra partida</button>
            </div>
          ) : (
            <>
              <h3 className="rtb-question">{ROUND_LABELS[round]}</h3>
              <div className="rtb-options">
                {ROUND_OPTIONS[round]?.map(opt => (
                  <button key={opt.value} className="btn btn-primary" onClick={() => guess(opt.value)} disabled={loading}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {round > 0 && (
                <button className="btn btn-gold" onClick={cashout} disabled={loading}>
                  Cobrar ({Math.floor(bet * multiplier).toLocaleString()} fichas)
                </button>
              )}
              {error && <div className="error-msg">{error}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
