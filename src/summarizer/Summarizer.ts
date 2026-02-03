import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

export interface SummaryResult {
    summary: string;
    contentIdeas: string[];
}

export class Summarizer {
    private groq: Groq;

    constructor() {
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not found in .env');
        }
        this.groq = new Groq({
            apiKey: process.env.GROQ_API_KEY,
        });
    }

    /**
     * Generates a summary and content ideas from a transcription using Groq.
     * @param transcription Full text from the video
     * @returns Object with summary and content ideas
     */
    async summarize(transcription: string): Promise<SummaryResult> {
        console.log('Starting summarization with Groq...');

        try {
            const prompt = `
            You are a content creation expert. Based on the following video transcription, generate:
            1. A brief summary in bullet points (maximum 5).
            2. Three creative ideas for social media posts (X threads, LinkedIn posts, etc.).

            Transcription:
            "${transcription}"

            Respond ONLY in JSON format with the following structure:
            {
              "summary": "summary text",
              "contentIdeas": ["idea 1", "idea 2", "idea 3"]
            }
            `;

            const completion = await this.groq.chat.completions.create({
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                model: 'llama-3.3-70b-versatile',
                response_format: { type: 'json_object' },
                temperature: 0.7,
            });

            const content = completion.choices[0]?.message?.content;
            if (!content) {
                throw new Error('No content returned from Groq');
            }

            const result = JSON.parse(content);
            return {
                summary: result.summary || 'Summary could not be generated.',
                contentIdeas: result.contentIdeas || [],
            };
        } catch (error) {
            console.error('Error during summarization:', error);
            throw error;
        }
    }
}
