import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY not found in .env');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey.trim());

    try {
        console.log('Listing available models for your API key...');
        const models = ['gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3-flash-preview'];

        for (const modelName of models) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("test");
                console.log(`✅ Model "${modelName}" is WORKING.`);
            } catch (e: any) {
                console.log(`❌ Model "${modelName}" failed: ${e.message}`);
            }
        }
    } catch (error: any) {
        console.error('Error listing models:', error);
    }
}

listModels();
