import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const SEGMENT = 360 / WHEEL_ORDER.length;

function segColor(n) {
  if (n === 0) return '#005500';
  return RED_NUMBERS.has(n) ? '#8b1a1a' : '#1a1a1a';
}

function drawWheel(canvas, rotDeg) {
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const R = Math.min(cx, cy) - 6;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
  ctx.fillStyle = '#7a5c1e';
  ctx.fill();

  // Segments
  WHEEL_ORDER.forEach((num, i) => {
    const a0 = ((i * SEGMENT + rotDeg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * SEGMENT + rotDeg - 90) * Math.PI) / 180;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.fillStyle = segColor(num);
    ctx.fill();
    ctx.strokeStyle = '#7a5c1e';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    const mid = a0 + (a1 - a0) / 2;
    const tr = R * 0.8;
    ctx.save();
    ctx.translate(cx + tr * Math.cos(mid), cy + tr * Math.sin(mid));
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, 0, 0);
    ctx.restore();
  });

  // Center hub
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = '#7a5c1e';
  ctx.fill();
  ctx.strokeStyle = '#a07828';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Ball marker (fixed at top)
  ctx.beginPath();
  ctx.arc(cx, cy - R + 10, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#f0f0f0';
  ctx.fill();
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.stroke();
}

const BET_TYPES = [
  { type: 'color',  label: 'Color',        options: [{ value: 'red', label: 'Rojo' }, { value: 'black', label: 'Negro' }], payout: '1:1' },
  { type: 'parity', label: 'Par / Impar',  options: [{ value: 'even', label: 'Par' }, { value: 'odd', label: 'Impar' }],   payout: '1:1' },
  { type: 'half',   label: '1-18 / 19-36', options: [{ value: 'low', label: '1–18' }, { value: 'high', label: '19–36' }], payout: '1:1' },
  { type: 'dozen',  label: 'Docena',        options: [{ value: '1st', label: '1–12' }, { value: '2nd', label: '13–24' }, { value: '3rd', label: '25–36' }], payout: '2:1' },
  { type: 'number', label: 'Número',        options: [],                                                                    payout: '35:1' },
];

export default function Roulette() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const rotRef = useRef(0);

  const [bet, setBet] = useState(10);
  const [betType, setBetType] = useState('color');
  const [betValue, setBetValue] = useState('red');
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (canvasRef.current) drawWheel(canvasRef.current, rotRef.current);
  }, []);

  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  const spin = async () => {
    if (spinning) return;
    setError('');
    setResult(null);
    setSpinning(true);

    try {
      const data = await api.post('/games/roulette/spin', { bet, betType, betValue });

      const winIdx = WHEEL_ORDER.indexOf(data.winning);
      const targetRot = (360 - (winIdx + 0.5) * SEGMENT + 360) % 360;
      const current = rotRef.current % 360;
      let delta = (targetRot - current + 360) % 360;
      if (delta < 45) delta += 360;
      const totalSpin = 5 * 360 + delta;
      const startRot = rotRef.current;
      const duration = 4000;
      const startTime = performance.now();

      const animate = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        rotRef.current = startRot + totalSpin * eased;
        if (canvasRef.current) drawWheel(canvasRef.current, rotRef.current);

        if (t < 1) {
          animRef.current = requestAnimationFrame(animate);
        } else {
          rotRef.current = (startRot + totalSpin) % 360;
          setResult(data);
          setSpinning(false);
          refresh();
        }
      };

      animRef.current = requestAnimationFrame(animate);
    } catch (err) {
      setError(err.message);
      setSpinning(false);
    }
  };

  const currentType = BET_TYPES.find(b => b.type === betType);
  const isRed = result && RED_NUMBERS.has(result.winning);

  const selectBetType = (type) => {
    const found = BET_TYPES.find(b => b.type === type);
    setBetType(type);
    setBetValue(found.options[0]?.value ?? '0');
  };

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-sm" onClick={() => navigate('/lobby')}>← Lobby</button>
        <h1>Ruleta Europea</h1>
        <span className="balance-chip">{user?.balance?.toLocaleString()} fichas</span>
      </div>

      <div className="roulette-layout">
        <canvas ref={canvasRef} width={320} height={320} className="roulette-canvas" />

        <div className="roulette-controls">
          <div className="roulette-section">
            <span className="roulette-label">Apuesta</span>
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
          </div>

          <div className="roulette-section">
            <span className="roulette-label">Tipo de apuesta</span>
            <div className="roulette-type-btns">
              {BET_TYPES.map(b => (
                <button key={b.type}
                  className={`btn btn-sm ${betType === b.type ? 'btn-gold' : ''}`}
                  onClick={() => selectBetType(b.type)}
                  disabled={spinning}
                >{b.label}</button>
              ))}
            </div>
          </div>

          <div className="roulette-section">
            <span className="roulette-label">
              Selección <small className="roulette-payout">({currentType?.payout})</small>
            </span>
            {betType === 'number' ? (
              <input
                type="number" className="bet-input" min={0} max={36}
                value={betValue}
                onChange={e => setBetValue(String(Math.min(36, Math.max(0, parseInt(e.target.value) || 0))))}
                disabled={spinning}
              />
            ) : (
              <div className="roulette-options">
                {currentType?.options.map(o => (
                  <button key={o.value}
                    className={`btn btn-sm roulette-opt-${o.value}${betValue === o.value ? ' roulette-opt-active' : ''}`}
                    onClick={() => setBetValue(o.value)}
                    disabled={spinning}
                  >{o.label}</button>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn btn-gold btn-lg"
            onClick={spin}
            disabled={spinning || bet < 1 || bet > (user?.balance ?? 0)}
          >{spinning ? 'Girando...' : 'Girar'}</button>

          {error && <div className="error-msg">{error}</div>}

          {result && !spinning && (
            <div className={`result-banner ${result.won ? 'result-win' : 'result-lose'}`}>
              <div className="roulette-result-row">
                <span className={`roulette-num-badge ${result.winning === 0 ? 'num-green' : isRed ? 'num-red' : 'num-black'}`}>
                  {result.winning}
                </span>
                <span>
                  {result.won
                    ? `Ganaste ${result.payout.toLocaleString()} fichas`
                    : `Perdiste ${bet.toLocaleString()} fichas`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
