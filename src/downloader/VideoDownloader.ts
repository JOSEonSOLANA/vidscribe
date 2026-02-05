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
            console.log('--- Attempt 1: Cloud Bypass (Android / Mobile Headers) ---');
            return await this.executeDownload(url, false, 'android');
        } catch (error: any) {
            const errorMessage = error.message || '';
            const isBlock = errorMessage.includes('confirm you’re not a bot') || errorMessage.includes('Sign in') || errorMessage.includes('403');

            if (isBlock) {
                console.warn("⚠️ Cloud IP blocked Attempt 1. Trying Authorized Fallback (iOS/Cookies)...");
                try {
                    console.log('--- Attempt 2: Authorized Bypass (iOS / With Cookies) ---');
                    return await this.executeDownload(url, true, 'ios');
                } catch (fallbackError: any) {
                    console.warn('⚠️ Both mobile bypasses failed. Trying Desktop Fallback...');
                    try {
                        console.log('--- Attempt 3: Desktop Bypass (Web / With Cookies) ---');
                        return await this.executeDownload(url, true, 'web,mweb');
                    } catch (webError: any) {
                        console.warn('⚠️ Standard clients failed. Trying Fail-safe (TV)...');
                        try {
                            console.log('--- Attempt 4: Last Resort Fail-safe (TVHTML5) ---');
                            return await this.executeDownload(url, true, 'tvhtml5');
                        } catch (finalError: any) {
                            console.error('❌ All automated bypasses failed on Render.');
                            throw new Error(`YouTube Blocked: ${finalError.message}. FIX: Add 'YOUTUBE_PO_TOKEN' to Render env vars (Follow walkthrough.md guide).`);
                        }
                    }
                }
            }
            throw error;
        }
    }

    private async executeDownload(url: string, useCookies: boolean, clientGroup: string = 'web'): Promise<string> {
        const timestamp = Date.now();
        const outputPath = path.join(this.outputDir, `audio_${timestamp}.%(ext)s`);

        console.log(`Starting download from: ${url} (Client: ${clientGroup}, Cookies: ${useCookies})`);

        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        const ffmpegLocArg = this.ffmpegPath ? `--ffmpeg-location "${this.ffmpegPath}"` : '';

        // Match User Agent to Client Group for better spoofing
        let userAgent = `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"`;
        if (clientGroup === 'android') {
            userAgent = `"com.google.android.youtube/19.29.37 (Linux; U; Android 11; en_US; Pixel 4) gzip"`;
        } else if (clientGroup === 'ios') {
            userAgent = `"com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)"`;
        }

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
            // Apply client grouping
            commandParts.push(`--extractor-args "youtube:player_client=${clientGroup};player_skip=configs,hls,dash"`);

            if (useCookies) {
                const cookiesPath = path.join(this.outputDir, '../cookies.txt');
                if (fs.existsSync(cookiesPath)) {
                    commandParts.push(`--cookies "${cookiesPath}"`);
                }
            }

            // Optional PO-Token support for manual override (The ultimate fix for Render)
            if (poToken) {
                console.log('💡 Using manually provided YOUTUBE_PO_TOKEN');
                commandParts.push(`--extractor-args "youtube:po_token=${poToken}"`);
            }

            // signature solving runtime (essential for cloud environments)
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

            if (stderr && stderr.includes('ERROR') && !stderr.includes('title from initial data')) {
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
            console.error(`Method ${clientGroup} failed:`, error.message);
            throw error;
        }
    }
}
