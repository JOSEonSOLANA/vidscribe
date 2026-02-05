import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execPromise = promisify(exec);

// ESM equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class VideoDownloader {
    private ytDlpPath: string;
    private ffmpegPath: string;
    private outputDir: string;

    constructor() {
        const isWin = process.platform === 'win32';

        // On Windows, use the bundled binaries in bin/
        // On Linux/Docker, assume they are installed in the system PATH
        this.ytDlpPath = isWin
            ? path.resolve(__dirname, '../../bin/yt-dlp.exe')
            : 'yt-dlp';

        this.ffmpegPath = isWin
            ? path.resolve(__dirname, '../../bin')
            : ''; // ffmpeg-location is not needed on Linux if in PATH

        this.outputDir = path.resolve(__dirname, '../../data/downloads');

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
    * Downloads a video from a URL and extracts the audio as MP3.
    * Uses a multi-strategy bypass for YouTube on Cloud IPs (Render).
    * @param url The video URL
    * @returns Path to the extracted audio file
    */
    async downloadAudio(url: string): Promise<string> {
        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

        if (!isYouTube) {
            return await this.executeDownload(url, true); // Use cookies for non-YT by default
        }

        try {
            console.log('--- Attempt 1: YouTube Android Bypass (No Cookies) ---');
            return await this.executeDownload(url, false);
        } catch (error: any) {
            const errorMessage = error.message || '';
            if (errorMessage.includes('confirm you’re not a bot') || errorMessage.includes('Sign in')) {
                console.warn("⚠️ YouTube blocked 'android' client. Trying Fallback with Cookies...");
                try {
                    console.log('--- Attempt 2: YouTube Web Fallback (With Cookies) ---');
                    return await this.executeDownload(url, true);
                } catch (fallbackError: any) {
                    console.error('❌ Both YouTube bypass strategies failed.');
                    throw new Error(`YouTube Blocked: ${fallbackError.message}. If this persists on Render, please provide a YOUTUBE_PO_TOKEN in .env.`);
                }
            }
            throw error;
        }
    }

    private async executeDownload(url: string, useCookies: boolean): Promise<string> {
        const timestamp = Date.now();
        const outputPath = path.join(this.outputDir, `audio_${timestamp}.%(ext)s`);

        console.log(`Starting download from: ${url} (Cookies: ${useCookies})`);

        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        const ffmpegLocArg = this.ffmpegPath ? `--ffmpeg-location "${this.ffmpegPath}"` : '';
        const userAgent = `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"`;
        const referer = isYouTube ? `"https://www.google.com/"` : url;
        const poToken = process.env.YOUTUBE_PO_TOKEN;

        // Base command
        let commandParts = [
            `"${this.ytDlpPath}"`,
            `--no-check-certificates`,
            `--no-part`,
            `--no-cache-dir`,
            `--user-agent ${userAgent}`,
            `--referer ${referer}`
        ];

        // YouTube Security Logic
        if (isYouTube) {
            if (useCookies) {
                // When using cookies, we must skip android because yt-dlp would skip it anyway
                // and stick to clients that support cookies well (mweb, web)
                commandParts.push(`--extractor-args "youtube:player_client=mweb,web;player_skip=configs,hls,dash"`);
                const cookiesPath = path.join(this.outputDir, '../cookies.txt');
                if (fs.existsSync(cookiesPath)) {
                    commandParts.push(`--cookies "${cookiesPath}"`);
                }
            } else {
                // When NOT using cookies, android client is our best bet for bypass
                commandParts.push(`--extractor-args "youtube:player_client=android,web;player_skip=configs,hls,dash"`);
            }

            // Optional PO-Token support for manual override
            if (poToken) {
                console.log('💡 Using manually provided YOUTUBE_PO_TOKEN');
                commandParts.push(`--extractor-args "youtube:po_token=${poToken}"`);
            }

            // signature solving runtime (useful on Render)
            commandParts.push(`--js-runtime node`);
        } else {
            // Generic URL cookies
            const cookiesPath = path.join(this.outputDir, '../cookies.txt');
            if (useCookies && fs.existsSync(cookiesPath)) {
                commandParts.push(`--cookies "${cookiesPath}"`);
            }
        }

        // Common audio extraction args
        commandParts.push(`-f "ba/b" -x --audio-format mp3 --audio-quality 0`);
        commandParts.push(ffmpegLocArg);
        commandParts.push(`--postprocessor-args "ffmpeg:-ar 16000 -ac 1 -b:a 64k"`);
        commandParts.push(`--output "${outputPath}"`);
        commandParts.push(`"${url}"`);

        const command = commandParts.join(' ');

        try {
            const { stdout, stderr } = await execPromise(command);
            console.log('yt-dlp output summary:', stdout.substring(0, 500) + (stdout.length > 500 ? '...' : ''));

            if (stderr && stderr.includes('ERROR')) {
                // Check if it's a fatal error or just a warning
                if (!fs.existsSync(path.join(this.outputDir, `audio_${timestamp}.mp3`))) {
                    throw new Error(stderr);
                }
            }

            const finalPath = path.join(this.outputDir, `audio_${timestamp}.mp3`);
            if (fs.existsSync(finalPath)) {
                return finalPath;
            } else {
                throw new Error('Failed to find the downloaded audio file.');
            }
        } catch (error: any) {
            console.error('Download attempt failed:', error.message);
            throw error;
        }
    }
}
