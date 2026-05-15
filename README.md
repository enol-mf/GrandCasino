# GrandCasino

A full-stack casino web app with Blackjack, Roulette, Slots, Plinko, Racing, and Crash. Built with Node.js + Express, React 18 + Vite, and MySQL 8, fully dockerized.

## Requirements

- Docker 24+
- Docker Compose v2

## Quick Start (WSL / Linux)

```bash
cp .env.example .env
# Edit .env with your values
docker compose up --build
```

Open [http://localhost](http://localhost).

The first build takes a few minutes. MySQL health checks ensure the backend waits for the DB to be ready.

## Automated Setup (Linux server)

```bash
bash setup.sh
```

The script handles `.env` generation with random passwords, phpMyAdmin auth, optional Let's Encrypt SSL, and starts all containers.

## Default Credentials

| Role  | Username | Password    | Starting Balance |
|-------|----------|-------------|-----------------|
| Admin | `admin`  | `Admin1234!` | 10,000 chips    |

The admin account is created automatically by the backend on first startup.

## Demo Promo Codes

| Code         | Chips | Max Uses   | Expires     |
|--------------|-------|------------|-------------|
| `WELCOME500` | 500   | Unlimited  | Never       |
| `BONUS100`   | 100   | 1 per user | Never       |
| `GRAND2024`  | 250   | 10 total   | 2027-12-31  |

## Dev Mode (Vite hot-reload + dockerized backend/db)

```bash
# Start only backend and db via Docker
docker compose up db backend

# In another terminal, run frontend locally
cd frontend
npm install
npm run dev
```

Frontend dev server proxies `/api` to `http://localhost:3000` (via `vite.config.js`).

## Project Structure

```
GrandCasino/
├── docker-compose.yml
├── .env.example
├── pma-nginx.conf          # nginx Basic Auth proxy for phpMyAdmin
├── setup.sh                # Automated server setup script
├── backend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── server.js          # Express app, session, rate limiting, seeding
│   │   ├── db.js              # mysql2 connection pool
│   │   ├── middleware/auth.js # requireAuth, requireAdmin
│   │   ├── routes/
│   │   │   ├── auth.js        # register, login, logout, me
│   │   │   ├── balance.js     # GET /api/balance
│   │   │   ├── games.js       # blackjack, plinko, roulette, slots, racing, crash
│   │   │   ├── promo.js       # POST /api/promo/redeem
│   │   │   └── admin.js       # promo codes CRUD + user management
│   │   └── utils/deck.js      # Deck creation, shuffle, hand value
│   └── db/init.sql            # Schema + promo seed data
└── frontend/
    ├── Dockerfile             # Multi-stage: node build → nginx serve
    ├── nginx.conf             # SPA fallback + /api proxy + HTTPS
    ├── src/
    │   ├── api/client.js      # fetch wrapper with credentials:include
    │   ├── context/AuthContext.jsx
    │   ├── components/        # Navbar, Card, ProtectedRoute, AdminRoute
    │   ├── pages/             # Login, Register, Lobby, Admin, games/*
    │   └── styles/global.css
    └── public/cards/          # 54 PNG card images
```

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/register` | Create account |
| POST | `/api/login` | Log in |
| POST | `/api/logout` | Log out |
| GET  | `/api/me` | Current user + balance |

### Balance
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/balance` | Get current balance |

### Games
| Method | Path | Body |
|--------|------|------|
| POST | `/api/games/blackjack/start` | `{ bet }` |
| POST | `/api/games/blackjack/action` | `{ action: "hit"\|"stand"\|"double" }` |
| POST | `/api/games/plinko/drop` | `{ bet }` |
| POST | `/api/games/roulette/spin` | `{ bet, type, value }` |
| POST | `/api/games/slots/spin` | `{ bet }` |
| POST | `/api/games/racing/bet` | `{ bet, horse }` |
| POST | `/api/games/crash/start` | `{ bet }` |
| GET  | `/api/games/crash/state` | — |
| POST | `/api/games/crash/cashout` | — |

### Promo
| Method | Path | Body |
|--------|------|------|
| POST | `/api/promo/redeem` | `{ code }` |

### Admin (requires is_admin)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/promo` | List all codes |
| POST | `/api/admin/promo` | Create code |
| PATCH | `/api/admin/promo/:id/toggle` | Enable/disable |
| DELETE | `/api/admin/promo/:id` | Delete |
| GET | `/api/admin/users` | List all users |
| PATCH | `/api/admin/users/:id/balance` | Edit user balance |

## Key Decisions

- **Admin seeding**: Done in backend startup via bcrypt (not SQL) to avoid pre-computed hash issues.
- **Game state on server**: All game logic (blackjack hand, crash point, plinko path) lives in `req.session` so the client cannot manipulate outcomes.
- **Crash fairness**: The crash point is generated server-side before the round starts using a house-edge formula `(1 - 0.05) / random`. The client only polls the current multiplier.
- **Plinko multiplier**: Decided on server using `crypto.randomInt`; the 8-row path determines the slot. Client only animates the provided path.
- **Card images**: Served from `public/cards/` so Vite doesn't fingerprint them (needed for dynamic filename construction).
- **`max_uses = 0`** means unlimited uses for a promo code.
- **CORS + sessions**: `credentials: true` on both ends; cookies use `sameSite: 'lax'` in dev and `secure: true` in production.
- **phpMyAdmin**: Protected by a separate nginx proxy with HTTP Basic Auth on port 8081. Not exposed directly.
