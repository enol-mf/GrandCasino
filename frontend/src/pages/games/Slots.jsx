import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

const SYMBOLS = {
  cherry:  { icon: '🍒', label: 'Cereza' },
  lemon:   { icon: '🍋', label: 'Limón' },
  orange:  { icon: '🍊', label: 'Naranja' },
  bell:    { icon: '🔔', label: 'Campana' },
  star:    { icon: '⭐', label: 'Estrella' },
  diamond: { icon: '💎', label: 'Diamante' },
};
const ALL_SYMBOLS = Object.keys(SYMBOLS);
const PAYOUTS = [
  { sym: 'diamond', label: '💎 💎 💎', pay: '50×' },
  { sym: 'star',    label: '⭐ ⭐ ⭐', pay: '20×' },
  { sym: 'bell',    label: '🔔 🔔 🔔', pay: '10×' },
  { sym: 'orange',  label: '🍊 🍊 🍊', pay: '5×'  },
  { sym: 'lemon',   label: '🍋 🍋 🍋', pay: '3×'  },
  { sym: 'cherry',  label: '🍒 🍒 🍒', pay: '2×'  },
  { sym: null,      label: 'Par',        pay: '1.5×' },
];

export default function Slots() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const intervalsRef = useRef([null, null, null]);

  const [bet, setBet] = useState(10);
  const [reels, setReels] = useState(['cherry', 'cherry', 'cherry']);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const stopInterval = (idx) => {
    if (intervalsRef.current[idx]) {
      clearInterval(intervalsRef.current[idx]);
      intervalsRef.current[idx] = null;
    }
  };

  const spin = async () => {
    if (spinning) return;
    setError('');
    setResult(null);
    setSpinning(true);

    for (let i = 0; i < 3; i++) {
      intervalsRef.current[i] = setInterval(() => {
        setReels(prev => {
          const next = [...prev];
          next[i] = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
          return next;
        });
      }, 60);
    }

    try {
      const data = await api.post('/games/slots/spin', { bet });

      setTimeout(() => {
        stopInterval(0);
        setReels(prev => [data.reels[0], prev[1], prev[2]]);
      }, 700);
      setTimeout(() => {
        stopInterval(1);
        setReels(prev => [prev[0], data.reels[1], prev[2]]);
      }, 1200);
      setTimeout(() => {
        stopInterval(2);
        setReels(([, , ]) => [data.reels[0], data.reels[1], data.reels[2]]);
        setResult(data);
        setSpinning(false);
        refresh();
      }, 1700);
    } catch (err) {
      [0, 1, 2].forEach(stopInterval);
      setError(err.message);
      setSpinning(false);
    }
  };

  const allSame  = result && reels[0] === reels[1] && reels[1] === reels[2];
  const twoSame  = result && !allSame && (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]);

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-sm" onClick={() => navigate('/lobby')}>← Lobby</button>
        <h1>Tragaperras</h1>
        <span className="balance-chip">{user?.balance?.toLocaleString()} fichas</span>
      </div>

      <div className="slots-machine">
        <div className={`slots-reels${allSame ? ' slots-jackpot' : twoSame ? ' slots-partial' : ''}`}>
          {reels.map((sym, i) => (
            <div key={i} className={`slot-reel${spinning && !result ? ' slot-spinning' : ''}`}>
              <span className="slot-icon">{SYMBOLS[sym].icon}</span>
            </div>
          ))}
        </div>

        {result && (
          <div className={`result-banner ${allSame ? 'result-win' : twoSame ? 'result-push' : 'result-lose'}`}>
            {allSame
              ? `¡JACKPOT! ×${result.multiplier} → +${result.payout.toLocaleString()} fichas`
              : twoSame
              ? `Par → ×${result.multiplier} → +${result.payout.toLocaleString()} fichas`
              : `Sin suerte − ${bet.toLocaleString()} fichas`}
          </div>
        )}
      </div>

      <div className="slots-paytable">
        <span className="roulette-label">Tabla de premios</span>
        <div className="slots-paytable-grid">
          {PAYOUTS.map(({ sym, label, pay }) => (
            <div key={pay} className={`slots-pay-row${allSame && sym && reels[0] === sym ? ' slots-pay-active' : ''}`}>
              <span>{label}</span>
              <span className="gold">{pay}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bet-panel">
        <h2>Apuesta</h2>
        <div className="bet-controls">
          <button className="btn btn-sm" onClick={() => setBet(b => Math.max(1, b - 10))} disabled={spinning}>−10</button>
          <input
            type="number" className="bet-input" min={1}
            value={bet}
            onChange={e => setBet(Math.max(1, parseInt(e.target.value) || 1))}
            disabled={spinning}
          />
          <button className="btn btn-sm" onClick={() => setBet(b => b + 10)} disabled={spinning}>+10</button>
        </div>
        <div className="roulette-quick">
          {[10, 50, 100, 500].map(v => (
            <button key={v} className="btn btn-sm btn-secondary" onClick={() => setBet(v)} disabled={spinning}>{v}</button>
          ))}
        </div>
        <button
          className="btn btn-gold btn-lg"
          onClick={spin}
          disabled={spinning || bet < 1 || bet > (user?.balance ?? 0)}
        >{spinning ? 'Girando...' : '🎰  Girar'}</button>
        {error && <div className="error-msg">{error}</div>}
      </div>
    </div>
  );
}
