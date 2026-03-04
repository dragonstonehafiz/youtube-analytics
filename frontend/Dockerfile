FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 5173

# Run the dev server
CMD ["npx", "vite", "--host", "0.0.0.0"]
