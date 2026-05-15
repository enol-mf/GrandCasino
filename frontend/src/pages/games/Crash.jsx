import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

const W = 700;
const H = 380;
const PAD_L = 52;
const PAD_B = 40;
const PAD_T = 36;
const PLOT_H = H - PAD_T - PAD_B;
const LOG_MAX = Math.log(20); // 20× sits at the top of the Y axis

function multToY(mult) {
  return PAD_T + PLOT_H * (1 - Math.min(1, Math.log(Math.max(1.001, mult)) / LOG_MAX));
}

function drawScene(ctx, points, phase) {
  ctx.fillStyle = '#080818';
  ctx.fillRect(0, 0, W, H);

  // Y-axis grid lines
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const gm of [1.5, 2, 3, 5, 10, 20]) {
    const y = multToY(gm);
    ctx.strokeStyle = '#ffffff10';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(W - 8, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff28';
    ctx.fillText(`${gm}×`, PAD_L - 4, y);
  }

  // Axes
  ctx.strokeStyle = '#ffffff20';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_L, PAD_T - 6);
  ctx.lineTo(PAD_L, H - PAD_B);
  ctx.lineTo(W - 4, H - PAD_B);
  ctx.stroke();

  if (points.length < 2) return;

  const crashed = phase === 'crashed';
  const c = crashed ? '#ef4444' : '#d4af37';
  const last = points[points.length - 1];
  const base = H - PAD_B;

  // Fill under curve
  ctx.beginPath();
  ctx.moveTo(PAD_L, base);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(last.x, base);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, PAD_T, 0, base);
  grad.addColorStop(0, c + '30');
  grad.addColorStop(1, c + '04');
  ctx.fillStyle = grad;
  ctx.fill();

  // Curve line
  ctx.strokeStyle = c;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.stroke();

  // Rocket / explosion
  ctx.save();
  ctx.font = '22px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ex = Math.min(last.x, W - 28);
  const ey = last.y;
  if (crashed) {
    ctx.fillText('💥', ex, ey - 14);
  } else if (points.length >= 2) {
    const prev = points[points.length - 2];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x) - Math.PI / 2;
    ctx.translate(ex, ey - 14);
    ctx.rotate(angle);
    ctx.fillText('🚀', 0, 0);
  }
  ctx.restore();
}

export default function Crash() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const pointsRef = useRef([]);
  const phaseRef = useRef('setup'); // 'setup' | 'flying' | 'crashed'
  const startedAtRef = useRef(null);
  const pollRef = useRef(null);
  const cashedOutRef = useRef(false);
  const betRef = useRef(50);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  const [bet, setBet] = useState(50);
  const [uiPhase, setUiPhase] = useState('setup'); // 'setup' | 'flying' | 'done'
  const [liveMult, setLiveMult] = useState(1.00);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { betRef.current = bet; }, [bet]);

  // Permanent RAF draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = () => {
      if (phaseRef.current === 'flying' && startedAtRef.current) {
        const ms = Date.now() - startedAtRef.current;
        const mult = Math.max(1.00, Math.round((1 + ms / 4000) * 100) / 100);
        setLiveMult(mult);
        const x = PAD_L + ms / 100; // 10 px per second
        const y = multToY(mult);
        const last = pointsRef.current[pointsRef.current.length - 1];
        if (!last || x - last.x >= 0.8) pointsRef.current.push({ x, y });
      }
      drawScene(ctx, pointsRef.current, phaseRef.current);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const doCashout = async () => {
    if (cashedOutRef.current) return;
    cashedOutRef.current = true;
    stopPoll();
    try {
      const data = await api.post('/games/crash/cashout');
      phaseRef.current = 'crashed';
      setUiPhase('done');
      setLiveMult(data.multiplier);
      const r = { won: data.won, multiplier: data.multiplier, winnings: data.winnings };
      setResult(r);
      setHistory(prev => [r, ...prev].slice(0, 12));
      await refreshRef.current();
    } catch (err) {
      cashedOutRef.current = false;
      setError(err.message);
    }
  };

  // Spacebar to cashout during flight
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && !e.repeat && phaseRef.current === 'flying') {
        e.preventDefault();
        doCashout();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopPoll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = async () => {
    setError('');
    setLoading(true);
    try {
      await api.post('/games/crash/start', { bet: betRef.current });
      await refreshRef.current();

      pointsRef.current = [{ x: PAD_L, y: H - PAD_B }];
      phaseRef.current = 'flying';
      cashedOutRef.current = false;
      startedAtRef.current = Date.now();
      setLiveMult(1.00);
      setResult(null);
      setUiPhase('flying');

      pollRef.current = setInterval(async () => {
        if (cashedOutRef.current) { stopPoll(); return; }
        try {
          const data = await api.get('/games/crash/state');
          if (data.crashed && !cashedOutRef.current) doCashout();
        } catch {}
      }, 200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    phaseRef.current = 'setup';
    pointsRef.current = [];
    startedAtRef.current = null;
    setUiPhase('setup');
    setLiveMult(1.00);
    setResult(null);
    setError('');
  };

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-sm btn-outline" onClick={() => navigate('/lobby')}>← Lobby</button>
        <h1>Crash</h1>
        <span className="balance-chip">{user?.balance?.toLocaleString()} fichas</span>
      </div>

      <div className="crash-canvas-wrap">
        <canvas ref={canvasRef} width={W} height={H} className="crash-canvas" />
        {uiPhase === 'flying' && (
          <div className="crash-live-mult">{liveMult.toFixed(2)}×</div>
        )}
        {uiPhase === 'done' && result && (
          <div className={`crash-result-overlay ${result.won ? 'crash-won' : 'crash-lost'}`}>
            {result.won
              ? `¡Cobrado a ${result.multiplier.toFixed(2)}×!  +${result.winnings.toLocaleString()} fichas`
              : `Crashed a ${result.multiplier.toFixed(2)}×`}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="crash-history">
          {history.map((h, i) => (
            <span key={i} className={`crash-chip ${h.won ? 'crash-chip-win' : 'crash-chip-lose'}`}>
              {h.multiplier.toFixed(2)}×
            </span>
          ))}
        </div>
      )}

      {uiPhase !== 'flying' ? (
        <div className="crash-controls">
          <div className="bet-controls">
            <button className="btn btn-sm btn-outline" onClick={() => setBet(b => Math.max(1, b - 25))}>−25</button>
            <input type="number" className="bet-input" min={1} value={bet}
              onChange={e => setBet(Math.max(1, parseInt(e.target.value) || 1))} />
            <button className="btn btn-sm btn-outline" onClick={() => setBet(b => Math.min(user?.balance || b, b + 25))}>+25</button>
          </div>
          <div className="roulette-quick">
            {[10, 50, 100, 500].map(v => (
              <button key={v} className="btn btn-sm btn-secondary" onClick={() => setBet(v)}>{v}</button>
            ))}
          </div>
          {error && <div className="error-msg">{error}</div>}
          {uiPhase === 'done' ? (
            <button className="btn btn-primary btn-lg" onClick={reset}>Otra partida</button>
          ) : (
            <button className="btn btn-gold btn-lg" onClick={startGame}
              disabled={loading || bet < 1 || bet > (user?.balance || 0)}>
              {loading ? 'Iniciando...' : 'Jugar'}
            </button>
          )}
        </div>
      ) : (
        <div className="crash-controls">
          <div className="crash-bet-info">Apuesta: <strong>{bet.toLocaleString()}</strong></div>
          <button className="btn btn-gold btn-lg" onClick={doCashout}>
            Cobrar ({Math.floor(bet * liveMult).toLocaleString()} fichas)
          </button>
          <p className="plinko-hint">Pulsa <kbd>Espacio</kbd> para cobrar</p>
          {error && <div className="error-msg">{error}</div>}
        </div>
      )}
    </div>
  );
}
