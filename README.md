# GrandCasino

Una aplicación web de casino full-stack con Blackjack, Ruleta, Tragaperras, Plinko, Carreras y Crash. Construida con Node.js + Express, React 18 + Vite y MySQL 8, totalmente dockerizada.

## Requisitos

- Docker 24+
- Docker Compose v2

## Inicio rápido (WSL / Linux)

```bash
cp .env.example .env
# Edita .env con tus valores
docker compose up --build
```

Abre [http://localhost](http://localhost).

La primera build tarda unos minutos. Los health checks de MySQL aseguran que el backend espere a que la base de datos esté lista.

## Instalación automatizada (servidor Linux)

```bash
bash setup.sh
```

El script se encarga de generar el `.env` con contraseñas aleatorias, la autenticación de phpMyAdmin, SSL opcional con Let's Encrypt e inicia todos los contenedores.

## Credenciales por defecto

| Rol   | Usuario  | Contraseña   | Saldo inicial |
|-------|----------|--------------|---------------|
| Admin | `admin`  | `Admin1234!` | 10.000 fichas |

La cuenta de administrador se crea automáticamente por el backend en el primer arranque.

## Códigos promocionales de demo

| Código       | Fichas | Usos máximos   | Caducidad   |
|--------------|--------|----------------|-------------|
| `WELCOME500` | 500    | Ilimitados     | Nunca       |
| `BONUS100`   | 100    | 1 por usuario  | Nunca       |
| `GRAND2024`  | 250    | 10 en total    | 31-12-2027  |

## Modo desarrollo (hot-reload de Vite + backend/db en Docker)

```bash
# Arranca solo backend y db con Docker
docker compose up db backend

# En otra terminal, ejecuta el frontend localmente
cd frontend
npm install
npm run dev
```

El servidor de desarrollo del frontend redirige `/api` a `http://localhost:3000` (vía `vite.config.js`).

## Estructura del proyecto

​```
GrandCasino/
├── docker-compose.yml
├── .env.example
├── pma-nginx.conf          # Proxy nginx con Basic Auth para phpMyAdmin
├── setup.sh                # Script de instalación automatizada
├── backend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── server.js          # App Express, sesiones, rate limiting, seeding
│   │   ├── db.js              # Pool de conexiones mysql2
│   │   ├── middleware/auth.js # requireAuth, requireAdmin
│   │   ├── routes/
│   │   │   ├── auth.js        # registro, login, logout, me
│   │   │   ├── balance.js     # GET /api/balance
│   │   │   ├── games.js       # blackjack, plinko, ruleta, tragaperras, carreras, crash
│   │   │   ├── promo.js       # POST /api/promo/redeem
│   │   │   └── admin.js       # CRUD de códigos promo + gestión de usuarios
│   │   └── utils/deck.js      # Creación de baraja, mezcla, valor de la mano
│   └── db/init.sql            # Esquema + datos iniciales de promos
└── frontend/
    ├── Dockerfile             # Multi-stage: build con node → servir con nginx
    ├── nginx.conf             # Fallback SPA + proxy /api + HTTPS
    ├── src/
    │   ├── api/client.js      # Wrapper de fetch con credentials:include
    │   ├── context/AuthContext.jsx
    │   ├── components/        # Navbar, Card, ProtectedRoute, AdminRoute
    │   ├── pages/             # Login, Register, Lobby, Admin, games/*
    │   └── styles/global.css
    └── public/cards/          # 54 imágenes PNG de cartas
​```

## Endpoints de la API

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/register` | Crear cuenta |
| POST | `/api/login` | Iniciar sesión |
| POST | `/api/logout` | Cerrar sesión |
| GET  | `/api/me` | Usuario actual + saldo |

### Saldo
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/balance` | Obtener saldo actual |

### Juegos
| Método | Ruta | Body |
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

### Promociones
| Método | Ruta | Body |
|--------|------|------|
| POST | `/api/promo/redeem` | `{ code }` |

### Admin (requiere is_admin)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/admin/promo` | Listar todos los códigos |
| POST | `/api/admin/promo` | Crear código |
| PATCH | `/api/admin/promo/:id/toggle` | Activar/desactivar |
| DELETE | `/api/admin/promo/:id` | Eliminar |
| GET | `/api/admin/users` | Listar todos los usuarios |
| PATCH | `/api/admin/users/:id/balance` | Editar saldo de usuario |

## Decisiones clave

- **Seeding del admin**: se realiza en el arranque del backend mediante bcrypt (no en SQL) para evitar problemas con hashes precalculados.
- **Estado del juego en el servidor**: toda la lógica del juego (mano de blackjack, punto de crash, recorrido de plinko) vive en `req.session` para que el cliente no pueda manipular los resultados.
- **Equidad en Crash**: el punto de crash se genera en el servidor antes de iniciar la ronda usando una fórmula con ventaja para la casa `(1 - 0.05) / random`. El cliente solo consulta el multiplicador actual.
- **Multiplicador de Plinko**: se decide en el servidor usando `crypto.randomInt`; el recorrido de 8 filas determina la casilla. El cliente solo anima el recorrido proporcionado.
- **Imágenes de cartas**: se sirven desde `public/cards/` para que Vite no aplique fingerprinting (necesario para la construcción dinámica de nombres de archivo).
- **`max_uses = 0`** significa usos ilimitados para un código promocional.
- **CORS + sesiones**: `credentials: true` en ambos extremos; las cookies usan `sameSite: 'lax'` en desarrollo y `secure: true` en producción.
- **phpMyAdmin**: protegido por un proxy nginx separado con HTTP Basic Auth en el puerto 8081. No se expone directamente.
