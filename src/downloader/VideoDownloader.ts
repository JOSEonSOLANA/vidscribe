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

        // Command to extract audio and convert to MP3 64kbps mono
        // This optimizes for long videos (YouTube) to stay under the 25MB API limit
        // --extractor-args "youtube:player_client=android,web_embedded" mimics mobile/embedded requests to bypass bot detection on cloud servers
        const ffmpegLocArg = this.ffmpegPath ? `--ffmpeg-location "${this.ffmpegPath}"` : '';
        const extractorArgs = `--extractor-args "youtube:player_client=android,web_embedded"`;
        const command = `"${this.ytDlpPath}" ${extractorArgs} -x --audio-format mp3 ${ffmpegLocArg} --postprocessor-args "ffmpeg:-ar 16000 -ac 1 -b:a 64k" --output "${outputPath}" "${url}"`;

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
