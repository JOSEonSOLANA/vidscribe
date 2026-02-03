import { AgentServer, TaskState, AgentSkill } from "@wardenprotocol/agent-kit";
import { app } from "./agent.js";
import { VidScribeStateType } from "./state.js";
import dotenv from 'dotenv';
import { createServer } from 'http';

// Global error handling for better debugging in the cloud
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

try {
    console.log('🎬 Starting VidScribe initialization...');
    dotenv.config();

    // Masked API Key check
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.warn('⚠️  WARNING: GROQ_API_KEY is not defined in environment variables!');
    } else {
        console.log(`✅ GROQ_API_KEY found (starts with: ${apiKey.substring(0, 4)}...)`);
    }

    const server = new AgentServer({
        agentCard: {
            name: "VidScribe",
            description: "Extracts audio from X/Twitter videos, transcribes using API, and summarizes using Groq.",
            url: process.env.AGENT_URL || "http://localhost:3000",
            capabilities: { streaming: true, multiTurn: false },
            skills: ["video-download", "transcription", "summarization", "content-ideas"] as unknown as AgentSkill[],
        },
        handler: async function* (context) {
            const userMessage = context.message.parts
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("\n");

            const urlMatch = userMessage.match(/https?:\/\/[^\s]+/);
            const url = urlMatch ? urlMatch[0] : null;

            if (!url) {
                yield {
                    state: "completed" as TaskState,
                    message: {
                        role: "agent",
                        parts: [{ type: "text", text: "Please provide a valid video URL (X/Twitter or public) to process." }],
                    },
                };
                return;
            }

            yield {
                state: "working" as TaskState,
                message: {
                    role: "agent",
                    parts: [{ type: "text", text: `### 📂 Process Status\n⏳ Starting VidScribe processing for: ${url}...` }],
                },
            };

            try {
                const stream = await app.stream({ url });
                let lastTranscription = "";
                let finalState: Partial<VidScribeStateType> = {};

                for await (const event of stream) {
                    if (event.download) {
                        const duration = event.download.duration || 0;
                        yield {
                            state: "working" as TaskState,
                            message: {
                                role: "agent",
                                parts: [{ type: "text", text: `### 📂 Process Status\n✅ Video downloaded (${Math.round(duration)}s).\n⏳ Starting high-speed API transcription...\n\n> [!TIP]\n> Using Groq Whisper API. Transcription usually takes **5-10 seconds**.` }],
                            },
                        };
                    }
                    if (event.transcribe) {
                        lastTranscription = event.transcribe.transcription || "";
                        yield {
                            state: "working" as TaskState,
                            message: {
                                role: "agent",
                                parts: [{ type: "text", text: `### 📝 Transcription Completed\n\n${lastTranscription}\n\n---\n⏳ Generating smart summary...` }],
                            },
                        };
                    }
                    if (event.summarize) {
                        finalState = event.summarize;
                    }
                }

                const responseText = `
### 🎥 Processing Finished

#### 📝 Full Transcription
${lastTranscription || "Not available."}

---

#### 📊 Executive Summary
${finalState.summary || "Summary could not be generated."}

#### 💡 Content Ideas
${finalState.contentIdeas ? (finalState.contentIdeas as string[]).map((idea: string, i: number) => `- ${idea}`).join('\n') : "No ideas generated."}

---
*Status: ${finalState.status || "Completed"}*
          `;

                yield {
                    state: "completed" as TaskState,
                    message: {
                        role: "agent",
                        parts: [{ type: "text", text: responseText.trim() }],
                    },
                };
            } catch (error: any) {
                yield {
                    state: "completed" as TaskState,
                    message: {
                        role: "agent",
                        parts: [{ type: "text", text: `Error processing video: ${error.message}` }],
                    },
                };
            }
        },
    });

    const port = Number(process.env.PORT) || 3000;
    const host = '0.0.0.0';

    const httpServer = createServer((req, res) => {
        console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.url}`);

        if (req.url === '/' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', service: 'VidScribe Agent', timestamp: new Date().toISOString() }));
            return;
        }

        // Handle LangGraph /ok endpoint explicitly if needed
        if (req.url === '/ok' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        return (server as any).handleRequest(req, res);
    });

    httpServer.listen(port, host, () => {
        const publicUrl = process.env.AGENT_URL || `http://${host}:${port}`;
        console.log(`🚀 VidScribe Agent Server running on ${host}:${port}`);
        console.log(`🔗 Public URL: ${publicUrl}`);
    });

} catch (initError: any) {
    console.error('❌ CRITICAL INITIALIZATION ERROR:', initError);
    process.exit(1);
}
