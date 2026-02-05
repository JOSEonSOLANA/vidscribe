import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const execPromise = promisify(exec);
dotenv.config();

// ESM equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Transcriber {
    private groq?: Groq;
    private whisperPath: string;
    private modelPath: string;
    private ffmpegPath: string;
    private useLocal: boolean;

    constructor(useLocal: boolean = true) {
        this.useLocal = useLocal;
        this.whisperPath = path.resolve(__dirname, '../../bin/whisper-bin/Release/whisper-cli.exe');
        this.modelPath = path.resolve(__dirname, '../../bin/ggml-base.bin');
        this.ffmpegPath = path.resolve(__dirname, '../../bin/ffmpeg.exe');

        if (!useLocal) {
            if (!process.env.GROQ_API_KEY) {
                throw new Error('GROQ_API_KEY not found in .env');
            }
            this.groq = new Groq({
                apiKey: process.env.GROQ_API_KEY,
            });
        }
    }

    /**
     * Transcribes an audio file.
     * @param audioPath Path to the audio file (e.g., .mp3, .wav)
     * @returns The transcribed text
     */
    async transcribe(audioPath: string): Promise<string> {
        if (this.useLocal) {
            return this.transcribeLocal(audioPath);
        } else {
            return this.transcribeGroq(audioPath);
        }
    }

    private async transcribeGroq(audioPath: string): Promise<string> {
        if (!this.groq) throw new Error('Groq client not initialized');
        console.log(`[${new Date().toISOString()}] Starting Groq transcription for: ${audioPath}`);

        if (!fs.existsSync(audioPath)) {
            throw new Error(`Audio file not found at: ${audioPath}`);
        }
        const stats = fs.statSync(audioPath);
        console.log(`[${new Date().toISOString()}] Audio file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        try {
            const response = await this.groq.audio.transcriptions.create({
                file: fs.createReadStream(audioPath),
                model: 'whisper-large-v3-turbo',
            });
            console.log(`[${new Date().toISOString()}] Groq transcription success. Result length: ${response.text?.length || 0}`);
            return response.text;
        } catch (error: any) {
            console.error(`[${new Date().toISOString()}] Groq API Error:`, error.message || error);
            if (error.response) {
                console.error(`[${new Date().toISOString()}] Groq Response Data:`, error.response.data);
            }
            throw error;
        }
    }

    private async transcribeLocal(audioPath: string): Promise<string> {
        console.log(`Starting local transcription for: ${audioPath}`);

        // Output text to console and capture it
        const whisperCmd = `"${this.whisperPath}" -m "${this.modelPath}" -f "${audioPath}" -nt`;

        try {
            const { stdout, stderr } = await execPromise(whisperCmd);

            if (stderr && !stderr.includes('whisper_init_from_file')) {
                console.warn('Whisper stderr:', stderr);
            }

            return stdout.trim();
        } catch (error) {
            console.error('Error during local transcription:', error);
            throw error;
        }
    }
}
