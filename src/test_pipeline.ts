import { VideoDownloader } from './downloader/VideoDownloader';
import { Transcriber } from './transcriber/Transcriber';
import { Summarizer } from './summarizer/Summarizer';
import dotenv from 'dotenv';

dotenv.config();

async function testFullPipeline() {
    const downloader = new VideoDownloader();
    const transcriber = new Transcriber(true); // true for local Whisper
    const summarizer = new Summarizer();
    const testUrl = 'https://video.twimg.com/amplify_video/2018675388063375360/vid/avc1/640x360/L1Z_GJpBhw4uastY.mp4?tag=21';

    try {
        console.log('--- Phase 1: Downloading & Extracting Audio ---');
        const audioPath = await downloader.downloadAudio(testUrl);
        console.log(`Audio ready at: ${audioPath}`);

        console.log('\n--- Phase 2: Transcribing Audio (Local) ---');
        const text = await transcriber.transcribe(audioPath);
        console.log('\nTranscription Result:');
        console.log('----------------------');
        console.log(text);
        console.log('----------------------');

        console.log('\n--- Phase 3: Summarizing (Groq) ---');
        const result = await summarizer.summarize(text);

        console.log('\nSummary:');
        console.log(result.summary);

        console.log('\nContent Ideas:');
        result.contentIdeas.forEach((idea, i) => console.log(`${i + 1}. ${idea}`));

    } catch (error) {
        console.error('Full pipeline test failed:', error);
    }
}

testFullPipeline();
