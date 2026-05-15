import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

const RACE_TYPES = [
  {
    id: 'horses', label: 'Caballos', icon: '🐎',
    names: ['Relámpago', 'Trueno', 'Ciclón', 'Vendaval', 'Tornado', 'Fuego', 'Tempestad',
            'Centella', 'Huracán', 'Torbellino', 'Galaxia', 'Meteoro', 'Cometa', 'Pegaso', 'Titán'],
  },
  {
    id: 'greyhounds', label: 'Galgos', icon: '🐕',
    names: ['Rayo', 'Flecha', 'Bala', 'Turbo', 'Misil', 'Cohete', 'Sonic', 'Flash',
            'Nitro', 'Veloz', 'Exprés', 'Saeta', 'Dardo', 'Látigo', 'Ráfaga'],
  },
  {
    id: 'snails', label: 'Caracoles', icon: '🐌',
    names: ['Turbo Jr.', 'Flash Lento', 'El Rápido', 'Usain', 'Velocidad', 'Nitroso',
            'Supersónico', 'Fórmula 1', 'El Cohete', 'Jet Set', 'Vroom', 'Speedy',
            'Rayo McQueen', 'Acelerador', 'El Crack'],
  },
];

function pickNames(pool) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
}

function generatePaths(winnerIdx) {
  const winnerFrames = 160 + Math.floor(Math.random() * 40);
  return Array.from({ length: 5 }, (_, i) => {
    const isWinner = i === winnerIdx;
    const totalFrames = isWinner
      ? winnerFrames
      : winnerFrames + 25 + Math.floor(Math.random() * 55);

    const path = [0];
    for (let f = 1; f <= totalFrames; f++) {
      const t = f / totalFrames;
      const smooth = t * t * (3 - 2 * t) * 100;
      const noise = (Math.random() - 0.5) * 4;
      path.push(Math.max(path[path.length - 1] - 0.5, Math.min(100, smooth + noise)));
    }
    path[totalFrames] = 100;
    return { path, totalFrames };
  });
}

export default function Racing() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const animRef  = useRef(null);
  const frameRef = useRef(0);
  const racerRefs = useRef([null, null, null, null, null]);

  const [raceType, setRaceType] = useState('horses');
  const [pick, setPick]   = useState(0);
  const [bet,  setBet]    = useState(10);
  const [phase, setPhase] = useState('setup');
  const [result, setResult] = useState(null);
  const [error,  setError]  = useState('');
  const [names,  setNames]  = useState(() => pickNames(RACE_TYPES[0].names));

  const currentType = RACE_TYPES.find(t => t.id === raceType);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const resetRacers = () => {
    racerRefs.current.forEach(el => { if (el) el.style.left = '0px'; });
  };

  const reset = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setResult(null);
    setPhase('setup');
    setNames(pickNames(currentType.names));
    frameRef.current = 0;
    resetRacers();
  };

  const changeType = (type) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const found = RACE_TYPES.find(t => t.id === type);
    setRaceType(type);
    setNames(pickNames(found.names));
    setResult(null);
    setPhase('setup');
    frameRef.current = 0;
    resetRacers();
  };

  const startRace = async () => {
    setError('');
    setResult(null);
    resetRacers();
    setPhase('racing');
    frameRef.current = 0;

    try {
      const data = await api.post('/games/racing/race', { bet, pick, raceType });
      const paths = generatePaths(data.winner);
      const maxFrames = Math.max(...paths.map(p => p.totalFrames));

      const animate = () => {
        frameRef.current++;
        const f = frameRef.current;

        // Manipulación directa del DOM — sin setState, sin re-renders
        paths.forEach((p, i) => {
          const pos = p.path[Math.min(f, p.totalFrames)];
          const el = racerRefs.current[i];
          if (el) el.style.left = `max(0px, calc(${pos}% - 24px))`;
        });

        if (f < maxFrames) {
          animRef.current = requestAnimationFrame(animate);
        } else {
          setResult(data);
          setPhase('done');
          refresh();
        }
      };

      animRef.current = requestAnimationFrame(animate);
    } catch (err) {
      setError(err.message);
      setPhase('setup');
    }
  };

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-sm" onClick={() => navigate('/lobby')}>← Lobby</button>
        <h1>Carreras</h1>
        <span className="balance-chip">{user?.balance?.toLocaleString()} fichas</span>
      </div>

      <div className="race-type-tabs">
        {RACE_TYPES.map(t => (
          <button
            key={t.id}
            className={`btn ${raceType === t.id ? 'btn-gold' : 'btn-secondary'}`}
            onClick={() => changeType(t.id)}
            disabled={phase === 'racing'}
          >{t.icon} {t.label}</button>
        ))}
      </div>

      <div className="race-track">
        <div className="race-lanes">
          {names.map((name, i) => (
            <div
              key={i}
              className={`race-lane${pick === i && phase !== 'done' ? ' race-lane-picked' : ''}${result?.winner === i ? ' race-lane-winner' : ''}`}
            >
              <span className="race-lane-name">{name}</span>
              <div className="race-road">
                <span
                  className="racer-icon"
                  ref={el => { racerRefs.current[i] = el; }}
                  style={{ left: '0px' }}
                >{currentType.icon}</span>
              </div>
            </div>
          ))}
        </div>
        <span className="finish-flag">🏁</span>
      </div>

      <div className="race-controls">
        <div className="roulette-section">
          <span className="roulette-label">¿A quién apuestas? <small className="roulette-payout">(paga 4:1)</small></span>
          <div className="race-pick-btns">
            {names.map((name, i) => (
              <button
                key={i}
                className={`btn ${pick === i ? 'btn-gold' : 'btn-secondary'}`}
                onClick={() => setPick(i)}
                disabled={phase === 'racing'}
              >{currentType.icon} {name}</button>
            ))}
          </div>
        </div>

        <div className="roulette-section">
          <span className="roulette-label">Apuesta</span>
          <div className="bet-controls">
            <button className="btn btn-sm" onClick={() => setBet(b => Math.max(1, b - 10))} disabled={phase === 'racing'}>−10</button>
            <input
              type="number" className="bet-input" min={1}
              value={bet}
              onChange={e => setBet(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={phase === 'racing'}
            />
            <button className="btn btn-sm" onClick={() => setBet(b => b + 10)} disabled={phase === 'racing'}>+10</button>
          </div>
          <div className="roulette-quick">
            {[10, 50, 100, 500].map(v => (
              <button key={v} className="btn btn-sm btn-secondary" onClick={() => setBet(v)} disabled={phase === 'racing'}>{v}</button>
            ))}
          </div>
        </div>

        <button
          className="btn btn-gold btn-lg"
          onClick={phase === 'done' ? reset : startRace}
          disabled={phase === 'racing' || bet < 1 || (phase === 'setup' && bet > (user?.balance ?? 0))}
        >
          {phase === 'racing' ? 'Corriendo...' : phase === 'done' ? 'Correr de nuevo' : '¡Que empiece la carrera!'}
        </button>

        {error && <div className="error-msg">{error}</div>}

        {result && phase === 'done' && (
          <div className={`result-banner ${result.won ? 'result-win' : 'result-lose'}`}>
            <strong>Ganador: {currentType.icon} {names[result.winner]}</strong>
            <br />
            {result.won
              ? `Ganaste ${result.payout.toLocaleString()} fichas`
              : `Perdiste ${bet.toLocaleString()} fichas`}
          </div>
        )}
      </div>
    </div>
  );
}
