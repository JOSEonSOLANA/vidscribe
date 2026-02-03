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
            You are an elite content strategist. Analyze the following video transcription and generate a highly readable, visually structured Executive Summary.

            ### Guidelines:
            1. Use Emojis to categorize information.
            2. Use markdown headers (### and ####) for hierarchy.
            3. Group insights into logical sections.
            4. Include a "Strategic Takeaway" or "Actionable Idea".
            5. Use "---" for visual dividers where appropriate.

            Transcription:
            "${transcription}"

            Respond ONLY in JSON format with the following structure:
            {
              "summary": "### 🎯 Key Insights\\n- Insight 1\\n- Insight 2\\n\\n---\\n### 📊 Detailed Breakdown\\n#### Topic A\\n- Detail 1\\n- Detail 2\\n\\n#### Topic B\\n- Detail 3\\n\\n---\\n### 💡 Strategic Takeaway\\n> *One powerful actionable advice based on this content.*",
              "contentIdeas": ["🚀 **Twitter Thread:** [Idea description]", "💼 **LinkedIn Post:** [Idea description]", "🎥 **Short-form Video:** [Idea description]"]
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
