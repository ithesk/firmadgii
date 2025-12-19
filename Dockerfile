FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

RUN mkdir -p /app/logs /app/certificates

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
