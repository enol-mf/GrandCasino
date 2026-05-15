#!/bin/bash
# Uso: ./deploy.sh usuario@ip-del-servidor
# Sube los archivos y arranca en producción

set -e

REMOTE=$1
REMOTE_DIR=/opt/grandcasino

if [ -z "$REMOTE" ]; then
  echo "Uso: ./deploy.sh usuario@ip"
  exit 1
fi

echo "Subiendo archivos a $REMOTE:$REMOTE_DIR ..."
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude '*.env' \
  . "$REMOTE:$REMOTE_DIR"

echo "Arrancando en el servidor..."
ssh "$REMOTE" "
  cd $REMOTE_DIR
  if [ ! -f .env ]; then
    cp .env.example .env
    echo ''
    echo 'AVISO: se ha creado .env desde .env.example.'
    echo 'Edítalo antes de continuar: nano $REMOTE_DIR/.env'
    exit 1
  fi
  docker compose -f docker-compose.prod.yml up -d --build
  docker compose -f docker-compose.prod.yml ps
"

echo "Listo."
