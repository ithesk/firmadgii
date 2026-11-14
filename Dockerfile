FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Versiones exactas (package-lock.json): una reconstrucción no cambia las dependencias por sorpresa
RUN npm ci

COPY . .

RUN npm run build

RUN mkdir -p /app/logs /app/certificates

EXPOSE 3000

ENV NODE_ENV=production

# Docker marca el contenedor como no sano si la fila de la DGII no avanza (el propio servicio se reinicia solo)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -T 4 -O /dev/null http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/index.js"]
