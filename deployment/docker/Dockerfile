FROM node:18-alpine

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ git

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Create required directories
RUN mkdir -p temp cache/series logs

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 7000

# Start the addon
CMD ["node", "addon-fixed.js"]