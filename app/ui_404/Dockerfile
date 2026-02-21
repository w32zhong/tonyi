FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Accept generic build arguments
ARG REDIRECT_URL="/"
ARG REDIRECT_TIMEOUT="5"

# Make them available to Vite with the required VITE_ prefix
ENV VITE_REDIRECT_URL=$REDIRECT_URL
ENV VITE_REDIRECT_TIMEOUT=$REDIRECT_TIMEOUT

RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server.js .

EXPOSE 8080
CMD ["npm", "start"]
