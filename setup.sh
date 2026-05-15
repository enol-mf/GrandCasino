#!/bin/bash
set -e

# ─────────────────────────────────────────────
#  GrandCasino — Script de instalación
#  Uso: bash setup.sh
# ─────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[AVISO]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       GrandCasino — Instalación          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Requisitos ─────────────────────────────
info "Comprobando requisitos..."

command -v docker >/dev/null 2>&1 || error "Docker no está instalado. Instálalo desde https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || error "Docker Compose v2 no está disponible. Actualiza Docker."

success "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
success "Docker Compose $(docker compose version --short)"

# ── 2. Archivo .env ───────────────────────────
if [ ! -f .env ]; then
    info "Creando archivo .env..."

    read -p "  Dominio o IP del servidor (ej: casino.example.com o 1.2.3.4): " DOMAIN
    [ -z "$DOMAIN" ] && error "El dominio no puede estar vacío."

    # Contraseñas aleatorias
    ROOT_PASS=$(openssl rand -hex 16)
    DB_PASS=$(openssl rand -hex 16)
    SESSION_SECRET=$(openssl rand -hex 32)

    # Detectar si es un dominio real (contiene punto y no es IP) para usar HTTPS
    if echo "$DOMAIN" | grep -qP '^\d+\.\d+\.\d+\.\d+$'; then
        FRONTEND_ORIGIN="http://$DOMAIN"
        USE_HTTPS=false
    else
        FRONTEND_ORIGIN="https://$DOMAIN"
        USE_HTTPS=true
    fi

    cat > .env <<EOF
MYSQL_ROOT_PASSWORD=${ROOT_PASS}
MYSQL_DATABASE=grandcasino
MYSQL_USER=casinouser
MYSQL_PASSWORD=${DB_PASS}
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
FRONTEND_ORIGIN=${FRONTEND_ORIGIN}
EOF

    success ".env creado con contraseñas aleatorias."
else
    warn ".env ya existe, se usará el existente."
    DOMAIN=$(grep FRONTEND_ORIGIN .env | cut -d= -f2 | sed 's|https\?://||')
    if echo "$DOMAIN" | grep -qP '^\d+\.\d+\.\d+\.\d+$'; then
        USE_HTTPS=false
    else
        USE_HTTPS=true
    fi
fi

# ── 3. Directorios necesarios ─────────────────
info "Creando directorios necesarios..."
mkdir -p certbot/www
success "certbot/www listo."

# ── 4. phpMyAdmin — contraseña de acceso ──────
if [ ! -f pma-htpasswd ]; then
    info "Configurando contraseña de phpMyAdmin (puerto 8081)..."

    if command -v htpasswd >/dev/null 2>&1; then
        read -p "  Usuario para phpMyAdmin [admin]: " PMA_USER
        PMA_USER=${PMA_USER:-admin}
        read -sp "  Contraseña para phpMyAdmin: " PMA_PASS
        echo ""
        [ -z "$PMA_PASS" ] && error "La contraseña no puede estar vacía."
        htpasswd -bc pma-htpasswd "$PMA_USER" "$PMA_PASS"
    else
        warn "htpasswd no encontrado. Instalando apache2-utils..."
        sudo apt-get install -y apache2-utils >/dev/null 2>&1
        read -p "  Usuario para phpMyAdmin [admin]: " PMA_USER
        PMA_USER=${PMA_USER:-admin}
        read -sp "  Contraseña para phpMyAdmin: " PMA_PASS
        echo ""
        [ -z "$PMA_PASS" ] && error "La contraseña no puede estar vacía."
        htpasswd -bc pma-htpasswd "$PMA_USER" "$PMA_PASS"
    fi
    success "pma-htpasswd creado."
else
    warn "pma-htpasswd ya existe, se mantiene."
fi

# ── 5. HTTPS con certbot (solo si hay dominio) ─
if [ "$USE_HTTPS" = true ]; then
    echo ""
    info "Dominio detectado: $DOMAIN"
    read -p "  ¿Quieres configurar HTTPS con Let's Encrypt? (s/n) [s]: " DO_HTTPS
    DO_HTTPS=${DO_HTTPS:-s}

    if [[ "$DO_HTTPS" =~ ^[sS]$ ]]; then
        if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
            success "Certificado para $DOMAIN ya existe, se reutiliza."
        else
            command -v certbot >/dev/null 2>&1 || {
                info "Instalando certbot..."
                sudo apt-get update -qq
                sudo apt-get install -y certbot >/dev/null 2>&1
            }

            read -p "  Email para notificaciones de renovación: " CERT_EMAIL
            [ -z "$CERT_EMAIL" ] && error "El email es obligatorio para Let's Encrypt."

            info "Levantando nginx temporalmente para el challenge ACME..."
            # Arrancar solo el frontend en modo HTTP para la verificación
            docker compose up -d frontend 2>/dev/null || true
            sleep 3

            info "Solicitando certificado para $DOMAIN..."
            sudo certbot certonly --webroot \
                --webroot-path "$(pwd)/certbot/www" \
                --non-interactive \
                --agree-tos \
                --email "$CERT_EMAIL" \
                -d "$DOMAIN"

            success "Certificado obtenido."

            # Hook para renovación automática
            sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
            sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'HOOK'
#!/bin/bash
cd /opt/grandcasino 2>/dev/null || cd ~/GrandCasinoWeb 2>/dev/null || true
docker compose exec frontend nginx -s reload 2>/dev/null || true
HOOK
            sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
            success "Hook de renovación automática configurado."
        fi
    else
        warn "Se omite HTTPS. El casino funcionará solo en HTTP."
        # Ajustar nginx.conf para no usar SSL
        USE_HTTPS=false
    fi
fi

# ── 6. Levantar los contenedores ──────────────
echo ""
info "Construyendo y levantando contenedores (puede tardar unos minutos)..."
docker compose up -d --build

# ── 7. Esperar a que el backend arranque ───────
info "Esperando a que el backend esté listo..."
TRIES=0
until docker compose exec backend wget -qO- http://localhost:3000/api/health >/dev/null 2>&1; do
    TRIES=$((TRIES+1))
    [ $TRIES -ge 30 ] && { warn "El backend tarda más de lo esperado. Comprueba: docker compose logs backend"; break; }
    sleep 3
done
[ $TRIES -lt 30 ] && success "Backend listo."

# ── 8. Resumen final ──────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║           Instalación completada         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

if [ "$USE_HTTPS" = true ]; then
    echo -e "  Casino:     ${GREEN}https://$DOMAIN${NC}"
else
    echo -e "  Casino:     ${GREEN}http://$DOMAIN${NC}"
fi
echo -e "  phpMyAdmin: ${GREEN}http://$DOMAIN:8081${NC}"
echo ""
echo -e "  Admin del casino: ${YELLOW}admin${NC} / ${YELLOW}Admin1234!${NC}"
echo ""
echo -e "  ${CYAN}Recuerda cambiar la contraseña del admin tras el primer login.${NC}"
echo ""
docker compose ps
