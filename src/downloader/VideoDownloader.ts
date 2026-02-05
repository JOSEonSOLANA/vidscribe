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
    * @param url The video URL (X/Twitter, YouTube or public URL)
    * @returns Path to the extracted audio file
    */
    async downloadAudio(url: string): Promise<string> {
        const timestamp = Date.now();
        const outputPath = path.join(this.outputDir, `audio_${timestamp}.%(ext)s`);

        console.log(`Starting download from: ${url}`);

        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

        const ffmpegLocArg = this.ffmpegPath ? `--ffmpeg-location "${this.ffmpegPath}"` : '';
        const userAgent = `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"`;
        const referer = isYouTube ? `"https://www.google.com/"` : url;

        // Base command
        let commandParts = [
            `"${this.ytDlpPath}"`,
            `--no-check-certificates`,
            `--no-part`,
            `--no-cache-dir`,
            `--user-agent ${userAgent}`,
            `--referer ${referer}`
        ];

        // Specific args for YouTube to bypass restrictions
        if (isYouTube) {
            commandParts.push(`--extractor-args "youtube:player_client=mweb,ios"`);
            commandParts.push(`--js-runtime node`);
            const cookiesPath = path.join(this.outputDir, '../cookies.txt');
            if (fs.existsSync(cookiesPath)) {
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
            console.log('yt-dlp output:', stdout);

            if (stderr) {
                console.warn('yt-dlp warning/error:', stderr);
            }

            const finalPath = path.join(this.outputDir, `audio_${timestamp}.mp3`);
            if (fs.existsSync(finalPath)) {
                return finalPath;
            } else {
                throw new Error('Failed to find the downloaded audio file.');
            }
        } catch (error) {
            console.error('Error downloading audio:', error);
            throw error;
        }
    }
}
