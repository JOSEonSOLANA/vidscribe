import { AgentServer, TaskState, AgentSkill } from "@wardenprotocol/agent-kit";
import { app } from "./agent.js";
import { VidScribeStateType } from "./state.js";
import dotenv from 'dotenv';

try {
    dotenv.config();

    /**
     * VidScribe Warden Agent Server
     * Exposes the agent via A2A and LangGraph protocols.
     */
    const server = new AgentServer({
        agentCard: {
            name: "VidScribe",
            description: "Extracts audio from X/Twitter videos, transcribes locally, and summarizes using Groq.",
            url: process.env.AGENT_URL || "http://localhost:3000",
            capabilities: { streaming: true, multiTurn: false },
            skills: ["video-download", "transcription", "summarization", "content-ideas"] as unknown as AgentSkill[],
        },
        handler: async function* (context) {
            // Extract URL from user message
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
                // Run the LangGraph in streaming mode
                const stream = await app.stream({ url });
                let lastTranscription = "";
                let finalState: Partial<VidScribeStateType> = {};

                for await (const event of stream) {
                    // event is an object where keys are node names
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
    server.listen(port).then(() => {
        console.log(`🚀 VidScribe Agent Server running on http://localhost:${port}`);
    });
} catch (initError: any) {
    console.error('CRITICAL: Failed to initialize VidScribe Agent Server:');
    console.error(initError);
    process.exit(1);
}
