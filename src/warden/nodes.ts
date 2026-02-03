import { VideoDownloader } from '../downloader/VideoDownloader.js';
import { Transcriber } from '../transcriber/Transcriber.js';
import { Summarizer } from '../summarizer/Summarizer.js';
import { VidScribeStateType } from './state.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

// Initialize core classes
const downloader = new VideoDownloader();
const transcriber = new Transcriber(false); // Using Groq Whisper API (Cloud Ready)
const summarizer = new Summarizer();

/**
 * Node: Downloads the video and extracts audio
 */
export async function downloadNode(state: VidScribeStateType): Promise<Partial<VidScribeStateType>> {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] --- Node: Download START ---`);
    try {
        const audioPath = await downloader.downloadAudio(state.url);

        // Use local ffprobe from bin folder on Windows, or system path on Linux
        const isWin = process.platform === 'win32';
        const binDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin');
        const ffprobePath = isWin ? path.join(binDir, 'ffprobe.exe') : 'ffprobe';

        let duration = 0;
        try {
            const { stdout } = await promisify(exec)(`"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
            duration = parseFloat(stdout.trim());
        } catch (e) {
            console.warn('Could not get audio duration using local ffprobe:', e);
        }

        console.log(`[${new Date().toISOString()}] --- Node: Download END (Took ${(Date.now() - startTime) / 1000}s, Duration: ${duration}s) ---`);
        return { audioPath, duration, status: 'Audio extracted successfully' };
    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] --- Node: Download ERROR:`, error);
        return { status: `Download failed: ${error.message}` };
    }
}

/**
 * Node: Transcribes audio to text
 */
export async function transcribeNode(state: VidScribeStateType): Promise<Partial<VidScribeStateType>> {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] --- Node: Transcribe START ---`);
    if (!state.audioPath) {
        console.warn(`[${new Date().toISOString()}] --- Node: Transcribe SKIP (No audio path) ---`);
        return { status: 'No audio path to transcribe' };
    }

    try {
        const transcription = await transcriber.transcribe(state.audioPath);
        console.log(`[${new Date().toISOString()}] --- Node: Transcribe END (Took ${(Date.now() - startTime) / 1000}s, Length: ${transcription.length} chars) ---`);
        return { transcription, status: 'Transcription completed' };
    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] --- Node: Transcribe ERROR:`, error);
        return { status: `Transcription failed: ${error.message}` };
    }
}

/**
 * Node: Summarizes transcription and generates ideas
 */
export async function summarizeNode(state: VidScribeStateType): Promise<Partial<VidScribeStateType>> {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] --- Node: Summarize START ---`);
    if (!state.transcription) {
        console.warn(`[${new Date().toISOString()}] --- Node: Summarize SKIP (No transcription) ---`);
        return { status: 'No transcription to summarize' };
    }

    try {
        const result = await summarizer.summarize(state.transcription);
        console.log(`[${new Date().toISOString()}] --- Node: Summarize END (Took ${(Date.now() - startTime) / 1000}s) ---`);

        // TEMPORARY: Disable cleanup for debugging
        /*
        try {
            if (state.audioPath && fs.existsSync(state.audioPath)) {
                fs.unlinkSync(state.audioPath);
            }
        } catch (cleanupError) {
            console.warn('Cleanup warning:', cleanupError);
        }
        */

        return {
            summary: result.summary,
            contentIdeas: result.contentIdeas,
            status: result.status,
            engineUsed: result.engineUsed
        };
    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] --- Node: Summarize ERROR:`, error);
        return { status: `Summarization failed: ${error.message}` };
    }
}
