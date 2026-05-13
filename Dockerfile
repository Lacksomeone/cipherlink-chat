FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm install --production=false
RUN cd client && npm install
COPY . .
RUN cd client && npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/client/dist ./client/dist
COPY server.js ./
COPY lib/ ./lib/
EXPOSE 3001
CMD ["node", "server.js"]
