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
            You are an elite content strategist for social media. Analyze the following video transcription and generate a professional, high-impact output.

            ### OUTPUT STRUCTURE:
            Your response must be a JSON object with two main fields:
            1. "summary": A high-impact "Executive Summary" optimized for Twitter/X. 
               - Start with a powerful hook.
               - Use 3-5 punchy bullet points.
               - End with a strategic "Actionable Takeaway".
               - Format it so it can be COPIED and PASTED directly into X.
            2. "contentIdeas": 3 specific, creative post ideas (X Thread, LinkedIn, etc.).

            ### Transcription:
            "${transcription}"

            Respond ONLY in JSON format:
            {
              "summary": "🚀 [HOOK]\\n\\n- [INSIGHT 1]\\n- [INSIGHT 2]\\n- [INSIGHT 3]\\n\\n💡 [STRATEGIC TAKEAWAY]",
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
