FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ src/

RUN mkdir -p data

VOLUME /app/data

CMD ["npx", "tsx", "src/index.ts"]
