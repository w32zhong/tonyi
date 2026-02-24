FROM node:20-alpine

WORKDIR /app/nodejs

# Copy package files and install dependencies
COPY nodejs/package*.json ./
RUN npm install --omit=dev

# Copy middleware code
COPY nodejs/middleware.js .
COPY nodejs/test_server.js .

# Copy shared HTML templates from parent (assuming build context is app/auth/middleware)
COPY login.html ../
COPY private.html ../

EXPOSE 18000

CMD ["node", "test_server.js"]
