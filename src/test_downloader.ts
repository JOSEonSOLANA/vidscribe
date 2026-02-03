import { VideoDownloader } from './downloader/VideoDownloader';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function testDownloader() {
    const downloader = new VideoDownloader();
    const testUrl = 'https://video.twimg.com/amplify_video/2018675388063375360/vid/avc1/640x360/L1Z_GJpBhw4uastY.mp4?tag=21';

    try {
        console.log('--- Testing VidScribe Downloader ---');
        const audioPath = await downloader.downloadAudio(testUrl);
        console.log(`Success! Audio saved at: ${audioPath}`);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testDownloader();
