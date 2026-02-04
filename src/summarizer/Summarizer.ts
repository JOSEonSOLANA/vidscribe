import { Groq } from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

export interface SummaryResult {
    summary: string;
    contentIdeas: string[];
    status: string;
    engineUsed: string;
}

export class Summarizer {
    private groq: Groq;
    private genAI: GoogleGenerativeAI;

    constructor() {
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not found in .env');
        }
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not found in .env');
        }

        this.groq = new Groq({
            apiKey: process.env.GROQ_API_KEY.trim(),
        });

        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
    }

    /**
     * Generates a summary and content ideas from a transcription using Groq.
     * @param transcription Full text from the video
     * @returns Object with summary and content ideas
     */
    async summarize(transcription: string): Promise<SummaryResult> {
        const prompt = `
            You are an elite content analyst. Analyze the following content and generate a professional, direct, and high-quality summary.

            ### GUIDELINES:
            1. Language: Use professional English only.
            2. Formatting: Use clean, well-structured paragraphs.
            3. Style: Direct and factual. Avoid emojis, social media hooks, or "punchy" bullet points.
            4. Structure: Provide the main summary as a few cohesive paragraphs.

            ### Content:
            "${transcription}"

            Respond ONLY in JSON format:
            {
              "summary": "[Draft the professional summary here using cohesive paragraphs]",
              "contentIdeas": ["idea 1", "idea 2", "idea 3"]
            }
            `;

        console.log('Starting summarization (Primary: Gemini 2.0 Flash)...');

        try {
            // Phase 1: Try Gemini
            const model = this.genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            if (!text) throw new Error('Gemini returned empty content');

            const parsed = JSON.parse(text);
            return {
                summary: parsed.summary || 'Summary could not be generated.',
                contentIdeas: parsed.contentIdeas || [],
                status: 'Completed',
                engineUsed: 'Gemini 2.0 Flash'
            };

        } catch (error) {
            console.warn('⚠️ Gemini failed, switching to Groq failover...', error);

            // Phase 2: Groq Failover
            try {
                const chatCompletion = await this.groq.chat.completions.create({
                    messages: [{ role: 'user', content: prompt }],
                    model: 'llama-3.3-70b-versatile',
                    response_format: { type: 'json_object' },
                });

                const content = chatCompletion.choices[0]?.message?.content || '{}';
                const parsed = JSON.parse(content);

                return {
                    summary: parsed.summary || 'Summary could not be generated.',
                    contentIdeas: parsed.contentIdeas || [],
                    status: 'Completed (Groq Failover)',
                    engineUsed: 'Groq Llama 3.3'
                };
            } catch (groqError) {
                console.error('❌ Both engines failed:', groqError);
                throw groqError;
            }
        }
    }
}
