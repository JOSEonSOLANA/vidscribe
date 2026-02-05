import { VideoDownloader } from './src/downloader/VideoDownloader.js';
import path from 'path';
import fs from 'fs';

async function testYouTube() {
    const downloader = new VideoDownloader();
    const testUrl = 'https://www.youtube.com/watch?v=q6EoRBvdVPQ';

    console.log('🧪 Testing YouTube download for:', testUrl);

    try {
        const audioPath = await downloader.downloadAudio(testUrl);
        console.log('✅ Download SUCCESS! Audio path:', audioPath);

        if (fs.existsSync(audioPath)) {
            const stats = fs.statSync(audioPath);
            console.log(`- File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        }
    } catch (error) {
        console.error('❌ Download FAILED:', error);
    }
}

testYouTube();
