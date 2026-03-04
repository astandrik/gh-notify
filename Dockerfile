FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ src/

RUN mkdir -p data

VOLUME /app/data

CMD ["node", "src/index.js"]
