# Use official Node.js image
FROM node:20-slim

# Install system dependencies
# ffmpeg for audio extraction
# curl to download yt-dlp/deno
# python3 is required by yt-dlp
# unzip for deno installation
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    python3 \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Deno (Required by yt-dlp for advanced YouTube extraction)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Install/Update yt-dlp to /usr/local/bin
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

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
