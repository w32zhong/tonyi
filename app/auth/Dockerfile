FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Explicitly set the environment to production
ENV NODE_ENV=production

# Install dependencies (production only to keep image small)
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose the port (matching the default in authd.js, though not yet written)
EXPOSE 19721

# Default command
CMD ["node", "authd.js"]
