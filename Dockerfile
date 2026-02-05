# Use official Node.js image
FROM node:20-slim

# Install system dependencies
# ffmpeg for audio extraction
# curl to download yt-dlp
# python3 is required by yt-dlp
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install/Update yt-dlp to /usr/local/bin (Force latest nightly for best bypass)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && yt-dlp --update-to nightly

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Ensure data directory exists
RUN mkdir -p data/downloads

# Expose port 3000 for the Warden Agent Server
EXPOSE 3000

# Start the agent server
CMD ["npm", "start"]
