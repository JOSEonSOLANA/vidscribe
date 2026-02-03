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
