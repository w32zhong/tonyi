FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Provide environment variables to be baked in at build-time by Vite
ARG AUTH_BASE_URL=/auth
ENV VITE_AUTH_BASE_URL=$AUTH_BASE_URL

# Copy source code and build
COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Install express for production server
COPY package*.json ./
RUN npm install --omit=dev

# Copy built artifacts and server script
COPY --from=builder /app/dist ./dist
COPY server.js ./

EXPOSE 8080

CMD ["npm", "start"]
