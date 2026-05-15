import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

const ROWS = 14;
const BUCKETS = 15;
const W = 700;
const H = 600;
const PEG_R = 5;
const BALL_R = 8;
const GRAVITY = 0.36;
const BUCKET_H = 48;
const TOP_PAD = 60;
const PEG_AREA_H = H - TOP_PAD - BUCKET_H - 10;
const SPACING_X = W / (ROWS + 2);
const SPACING_Y = PEG_AREA_H / (ROWS + 1);

// RTP ≈ 94.7% — house edge ~5.3%, ~58% of drops lose chips
const MULTS = [50, 10, 5, 3, 2, 1, 0.5, 0.3, 0.5, 1, 2, 3, 5, 10, 50];

const BUCKET_COLORS = [
  '#ef4444','#f97316','#eab308','#84cc16','#22c55e',
  '#14b8a6','#818cf8','#a855f7',
  '#818cf8','#14b8a6','#22c55e','#84cc16','#eab308','#f97316','#ef4444',
];

const BALL_COLORS = ['#ffffff','#ffd700','#ff7eb3','#7efff5','#b8ff7e','#ff9a3c'];

const PEGS = (() => {
  const arr = [];
  for (let row = 0; row < ROWS; row++) {
    const count = row + 2;
    const startX = W / 2 - ((count - 1) / 2) * SPACING_X;
    for (let col = 0; col < count; col++) {
      arr.push({ x: startX + col * SPACING_X, y: TOP_PAD + (row + 1) * SPACING_Y, row, col });
    }
  }
  return arr;
})();

const PEGS_BY_ROW = Array.from({ length: ROWS }, (_, r) => PEGS.filter(p => p.row === r));

let globalColorIdx = 0;

function makeBall(serverData, bet) {
  const targets = [];
  let col = 0;
  for (let row = 0; row < ROWS; row++) {
    col += serverData.path[row];
    targets.push(PEGS_BY_ROW[row][col]);
  }
  return {
    x: W / 2 + (Math.random() - 0.5) * 6,
    y: TOP_PAD - BALL_R * 3,
    vx: (Math.random() - 0.5) * 0.8,
    vy: 2,
    targetRow: 0,
    targets,
    path: serverData.path,
    color: BALL_COLORS[globalColorIdx++ % BALL_COLORS.length],
    serverData: { ...serverData, bet },
    done: false,
    resultCollected: false,
    hitPegs: new Set(),
  };
}

function updateBall(ball) {
  if (ball.done) return;

  ball.vy += GRAVITY;

  // Gentle horizontal pull toward the target peg for this row
  if (ball.targetRow < ROWS) {
    const target = ball.targets[ball.targetRow];
    const dy = target.y - ball.y;
    if (dy > 0 && dy < SPACING_Y * 3.5) {
      ball.vx += (target.x - ball.x) * 0.02;
    }
    // Safety: if ball slipped past a peg without touching it, advance row
    if (ball.y > target.y + SPACING_Y * 0.7) ball.targetRow++;
  }

  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vx = Math.max(-9, Math.min(9, ball.vx));

  // Peg collisions — check current row and ±1 neighbors
  let hit = false;
  for (let rOff = -1; rOff <= 1 && !hit; rOff++) {
    const row = ball.targetRow + rOff;
    if (row < 0 || row >= ROWS) continue;
    for (const peg of PEGS_BY_ROW[row]) {
      if (hit) break;
      const key = `${peg.row}-${peg.col}`;
      if (ball.hitPegs.has(key)) continue;
      const dx = ball.x - peg.x;
      const dy = ball.y - peg.y;
      const dist2 = dx * dx + dy * dy;
      const minD = PEG_R + BALL_R;
      if (dist2 < minD * minD) {
        const dist = Math.sqrt(dist2) || 0.01;
        const nx = dx / dist, ny = dy / dist;
        ball.x += nx * (minD - dist + 1);
        ball.y += ny * (minD - dist + 1);
        const dot = ball.vx * nx + ball.vy * ny;
        ball.vx = (ball.vx - 2 * dot * nx) * 0.5;
        ball.vy = (ball.vy - 2 * dot * ny) * 0.65;
        if (peg.row === ball.targetRow) {
          ball.vx += (ball.path[ball.targetRow] === 1 ? 1 : -1) * 2.4;
          ball.vy = Math.max(ball.vy, 0.4);
          ball.targetRow++;
        }
        ball.hitPegs.add(key);
        hit = true;
      }
    }
  }

  if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * 0.6; }
  if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.6; }

  if (ball.y >= H - BUCKET_H - BALL_R) ball.done = true;
}

function drawScene(ctx, balls) {
  ctx.fillStyle = '#080818';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#ffffff18';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 7]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, TOP_PAD - BALL_R * 4);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const p of PEGS) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PEG_R, 0, Math.PI * 2);
    ctx.fillStyle = '#d4af37';
    ctx.fill();
  }

  const bw = W / BUCKETS;
  for (let i = 0; i < BUCKETS; i++) {
    const x = i * bw, y = H - BUCKET_H, c = BUCKET_COLORS[i];
    ctx.fillStyle = c + '28';
    ctx.fillRect(x + 1, y, bw - 2, BUCKET_H);
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y, bw - 2, BUCKET_H);
    ctx.fillStyle = c;
    ctx.font = `bold ${MULTS[i] >= 10 ? 10 : 12}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${MULTS[i]}×`, x + bw / 2, y + BUCKET_H * 0.62);
  }

  for (const ball of balls) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.shadowColor = ball.color;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export default function Plinko() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const ballsRef = useRef([]);
  const pendingRef = useRef([]); // results waiting to be flushed to state
  const betRef = useRef(50);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  const [bet, setBet] = useState(50);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [inflight, setInflight] = useState(0);

  useEffect(() => { betRef.current = bet; }, [bet]);

  // Single RAF loop for the lifetime of the component
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = () => {
      const balls = ballsRef.current;
      balls.forEach(b => updateBall(b));

      // Collect results from newly-done balls
      for (const b of balls) {
        if (b.done && !b.resultCollected) {
          b.resultCollected = true;
          pendingRef.current.push(b.serverData);
          refreshRef.current(); // update balance chip when ball lands
        }
      }

      // Remove collected balls
      ballsRef.current = balls.filter(b => !b.resultCollected);

      // Flush pending results to React state
      if (pendingRef.current.length > 0) {
        const batch = pendingRef.current.splice(0);
        setResults(prev => [...batch.reverse(), ...prev].slice(0, 12));
      }

      drawScene(ctx, ballsRef.current);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dropBall = useCallback(async () => {
    const currentBet = betRef.current;
    if (currentBet < 1) return;

    setError('');
    setInflight(n => n + 1);
    try {
      const data = await api.post('/games/plinko/drop', { bet: currentBet });
      // Refresh immediately so the balance chip reflects the deduction
      // and the next drop's server-side balance check won't fail
      await refreshRef.current();
      ballsRef.current.push(makeBall(data, currentBet));
    } catch (err) {
      setError(err.message);
    } finally {
      setInflight(n => n - 1);
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        dropBall();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dropBall]);

  const canDrop = bet >= 1 && bet <= (user?.balance ?? 0);

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-sm" onClick={() => navigate('/lobby')}>← Lobby</button>
        <h1>Plinko</h1>
        <span className="balance-chip">{user?.balance?.toLocaleString()} fichas</span>
      </div>

      <canvas ref={canvasRef} width={W} height={H} className="plinko-canvas" />

      <div className="plinko-bottom">
        <div className="plinko-bet-row">
          <div className="bet-controls">
            <button className="btn btn-sm" onClick={() => setBet(b => Math.max(1, b - 10))}>−10</button>
            <input
              type="number" className="bet-input" min={1}
              value={bet}
              onChange={e => setBet(Math.max(1, parseInt(e.target.value) || 1))}
            />
            <button className="btn btn-sm" onClick={() => setBet(b => b + 10)}>+10</button>
          </div>
          <div className="roulette-quick">
            {[10, 50, 100, 500].map(v => (
              <button key={v} className="btn btn-sm btn-secondary" onClick={() => setBet(v)}>{v}</button>
            ))}
          </div>
          <button
            className="btn btn-gold btn-lg"
            onClick={dropBall}
            disabled={!canDrop || inflight > 0}
          >
            {inflight > 0 ? 'Lanzando…' : 'Soltar bola'}
          </button>
        </div>

        <p className="plinko-hint">Pulsa <kbd>Espacio</kbd> para lanzar otra bola</p>

        {error && <div className="error-msg">{error}</div>}

        {results.length > 0 && (
          <div className="plinko-results">
            {results.map((r, i) => {
              const net = r.payout - r.bet;
              return (
                <span key={i} className={`plinko-chip ${net >= 0 ? 'plinko-chip-win' : 'plinko-chip-lose'}`}>
                  {r.multiplier}× {net >= 0 ? `+${net.toLocaleString()}` : net.toLocaleString()}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
