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
        console.log(`Starting Groq transcription for: ${audioPath}`);
        try {
            const response = await this.groq.audio.transcriptions.create({
                file: fs.createReadStream(audioPath),
                model: 'whisper-large-v3-turbo',
            });
            return response.text;
        } catch (error) {
            console.error('Error during Groq transcription:', error);
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
