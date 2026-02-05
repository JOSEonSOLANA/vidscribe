import { AgentServer, TaskState, AgentSkill } from "@wardenprotocol/agent-kit";
import { app } from "./agent.js";
import { VidScribeStateType } from "./state.js";
import dotenv from 'dotenv';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';

// Global error handling for better debugging in the cloud
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

try {
    console.log(`🚀 [v3.4.7] Starting VidScribe Agent Server at ${new Date().toISOString()}...`);
    dotenv.config();

    // --- YouTube Cookie Bypass Logic ---
    const rawCookies = process.env.YOUTUBE_COOKIES;
    if (rawCookies) {
        try {
            const dataDir = path.resolve(process.cwd(), 'data');
            const cookiesPath = path.join(dataDir, 'cookies.txt');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(cookiesPath, rawCookies);
            console.log('✅ [v3.4.7] YouTube Cookies injected successfully from environment variable.');
        } catch (cookieErr) {
            console.error('❌ Failed to write YouTube cookies:', cookieErr);
        }
    }
    // ------------------------------------

    // Masked API Key checks
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!groqKey) console.warn('⚠️ WARNING: GROQ_API_KEY is not defined!');
    if (!geminiKey) console.warn('⚠️ WARNING: GEMINI_API_KEY is not defined!');

    console.log(`✅ [v3.4.7] Keys verified (Groq: ${groqKey?.substring(0, 4)}..., Gemini: ${geminiKey?.substring(0, 4)}...)`);

    const server = new AgentServer({
        agentCard: {
            name: "VidScribe",
            description: "Advanced media extraction and summarization using Gemini Flash and Groq failover.",
            url: process.env.AGENT_URL || "http://localhost:3000",
            capabilities: { streaming: true, multiTurn: false },
            skills: ["media-extraction", "ai-transcription", "smart-summarization"] as unknown as AgentSkill[],
        },
        handler: async function* (context) {
            const userMessage = context.message.parts
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("\n");

            const urlMatch = userMessage.match(/https?:\/\/[^\s]+/);
            const url = urlMatch ? urlMatch[0] : null;

            let lastTranscription = "";
            let finalState: Partial<VidScribeStateType> = {};

            try {

                if (url) {
                    yield {
                        state: "working" as TaskState,
                        message: {
                            role: "agent",
                            parts: [{ type: "text", text: `### 📂 Process Status\n⏳ Starting VidScribe processing for: ${url}...` }],
                        },
                    };

                    const stream = await app.stream({ url });
                    for await (const event of stream) {
                        if (event.download) {
                            const duration = event.download.duration || 0;
                            let statusText = `### 📂 Process Status\n✅ Video downloaded (${Math.round(duration)}s).\n⏳ Starting high-speed API transcription...`;
                            if (duration > 600) {
                                statusText += `\n\n> [!TIP]\n> **Long video detected.** Audio has been optimized for duration.`;
                            }
                            yield {
                                state: "working" as TaskState,
                                message: {
                                    role: "agent",
                                    parts: [{ type: "text", text: statusText }],
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
                } else {
                    // Plane text branch
                    yield {
                        state: "working" as TaskState,
                        message: {
                            role: "agent",
                            parts: [{ type: "text", text: `### 📝 Input Detected: Plain Text\n⏳ Generating summary for your content...` }],
                        },
                    };

                    // Directly use the langgraph app with the text as transcription
                    const stream = await app.stream({ transcription: userMessage });
                    for await (const event of stream) {
                        if (event.summarize) {
                            finalState = event.summarize;
                        }
                    }
                    lastTranscription = userMessage; // For the "Source" section
                }

                let responseText = "";

                if (url) {
                    responseText = `
## 📂 SECTION 1: SOURCE CONTENT
---
${lastTranscription || "Not available."}

---

## 🎯 SECTION 2: EXECUTIVE SUMMARY
---
${finalState.summary || "Summary could not be generated."}

---

## 💡 SECTION 3: CONTENT IDEAS
---
${finalState.contentIdeas ? (finalState.contentIdeas as string[]).map((idea: string, i: number) => `- ${idea}`).join('\n') : "No ideas generated."}

---
*Status: ${finalState.status || "Completed"}*
*AI Engine: ${finalState.engineUsed || "Unknown"}*
`;
                } else {
                    responseText = `
## 🎯 EXECUTIVE SUMMARY
---
${finalState.summary || "Summary could not be generated."}

---

## 💡 CONTENT IDEAS
---
${finalState.contentIdeas ? (finalState.contentIdeas as string[]).map((idea: string, i: number) => `- ${idea}`).join('\n') : "No ideas generated."}

---
*Status: ${finalState.status || "Completed (Text Mode)"}*
*AI Engine: ${finalState.engineUsed || "Unknown"}*
`;
                }

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

    const CHAT_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VidScribe Agent | Cloud</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0c0d15;
            --card-bg: rgba(255, 255, 255, 0.05);
            --accent-primary: #64ffda;
            --accent-secondary: #7000ff;
            --text-primary: #ffffff;
            --text-secondary: #94a3b8;
            --glass-border: rgba(255, 255, 255, 0.1);
            --agent-msg-bg: rgba(112, 0, 255, 0.12);
            --user-msg-bg: rgba(255, 255, 255, 0.06);
            --divider-color: rgba(255, 255, 255, 0.1);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            height: 100vh;
            display: flex;
            justify-content: center;
            background-image: 
                radial-gradient(circle at 10% 10%, rgba(112, 0, 255, 0.15) 0%, transparent 40%),
                radial-gradient(circle at 90% 90%, rgba(100, 255, 218, 0.1) 0%, transparent 40%);
            overflow: hidden;
        }
        #app {
            width: 100%;
            max-width: 1200px;
            height: 100vh;
            display: flex;
            flex-direction: column;
            backdrop-filter: blur(40px);
            border-left: 1px solid var(--glass-border);
            border-right: 1px solid var(--glass-border);
            background: rgba(10, 11, 16, 0.6);
        }
        header {
            padding: 1.5rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--glass-border);
            background: rgba(10, 11, 16, 0.7);
        }
        .logo {
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: 'Outfit', sans-serif;
            font-weight: 600;
            font-size: 1.4rem;
            letter-spacing: -0.5px;
        }
        .logo-icon {
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, var(--accent-secondary), var(--accent-primary));
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #000;
            font-size: 1.2rem;
            box-shadow: 0 0 20px rgba(112, 0, 255, 0.3);
        }
        #chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 2.5rem;
            display: flex;
            flex-direction: column;
            gap: 2.5rem;
            scroll-behavior: smooth;
        }
        #chat-container::-webkit-scrollbar { width: 6px; }
        #chat-container::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 10px; }
        .message {
            max-width: 88%;
            padding: 1.5rem 1.75rem;
            border-radius: 24px;
            font-size: 1rem;
            line-height: 1.6;
            animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
        }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .agent-message { 
            align-self: flex-start; 
            background: var(--agent-msg-bg); 
            border: 1px solid rgba(112,0,255,0.2); 
            border-bottom-left-radius: 4px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .user-message { align-self: flex-end; background: var(--user-msg-bg); border: 1px solid var(--glass-border); border-bottom-right-radius: 4px; color: #e2e8f0; }
        .message-content h3 { color: var(--accent-primary); margin: 1.5rem 0 0.75rem; font-family: 'Outfit', sans-serif; font-size: 1.25rem; font-weight: 600; }
        .message-content h4 { color: #fff; margin: 1rem 0 0.5rem; font-family: 'Outfit', sans-serif; font-size: 1.05rem; font-weight: 600; opacity: 0.9; }
        .message-content h3:first-child { margin-top: 0; }
        .message-content strong { color: #fff; font-weight: 600; }
        .message-content blockquote { 
            border-left: 4px solid var(--accent-primary); 
            padding: 1rem 1.5rem; 
            margin: 1.5rem 0; 
            background: rgba(100, 255, 218, 0.08); 
            border-radius: 0 12px 12px 0;
            font-style: italic;
            color: #d1d5db;
        }
        .message-content hr { border: 0; border-top: 1px solid var(--divider-color); margin: 1.5rem 0; }
        .message-content ul { margin: 1rem 0; padding-left: 1.2rem; list-style: none; }
        .message-content li { margin-bottom: 0.75rem; position: relative; }
        .message-content li::before { content: "•"; color: var(--accent-primary); position: absolute; left: -1.2rem; font-weight: bold; }
        
        footer { padding: 2rem; background: rgba(10, 11, 16, 0.85); border-top: 1px solid var(--glass-border); backdrop-filter: blur(10px); }
        .input-area { 
            display: flex; 
            gap: 12px; 
            background: rgba(255,255,255,0.03); 
            padding: 10px; 
            border-radius: 18px; 
            border: 1px solid var(--glass-border);
            transition: all 0.3s ease;
        }
        .input-area:focus-within { border-color: var(--accent-secondary); box-shadow: 0 0 25px rgba(112, 0, 255, 0.2); background: rgba(255,255,255,0.05); }
        .input-area.disabled { opacity: 0.5; pointer-events: none; filter: grayscale(1); }
        .auth-area {
            display: flex;
            gap: 10px;
            margin-bottom: 12px;
            padding: 8px 12px;
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            border: 1px solid var(--glass-border);
            align-items: center;
        }
        .auth-area input {
            font-size: 0.8rem;
            padding: 4px 8px;
            color: var(--text-secondary);
        }
        .auth-label {
            font-size: 0.75rem;
            color: var(--accent-primary);
            text-transform: uppercase;
            font-weight: 600;
            white-space: nowrap;
        }
        input { flex: 1; background: transparent; border: none; color: white; padding: 12px 15px; outline: none; font-size: 1rem; }
        button { 
            background: linear-gradient(135deg, var(--accent-secondary), var(--accent-primary)); 
            border: none; 
            padding: 0 30px; 
            border-radius: 14px; 
            font-weight: 600; 
            cursor: pointer; 
            transition: all 0.3s ease;
            color: #000;
        }
        button:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(112, 0, 255, 0.4); }
        button:active { transform: translateY(0); }
        .loading-dots { display: flex; gap: 8px; padding: 12px 0; }
        .dot { width: 10px; height: 10px; background: var(--accent-primary); border-radius: 50%; animation: pulse 1.5s infinite; opacity: 0.5; }
        @keyframes pulse { 0%, 100% { transform: scale(0.8); opacity: 0.3; } 50% { transform: scale(1.2); opacity: 1; } }
    </style>
</head>
<body>
    <div id="app">
        <header>
            <div class="logo"><div class="logo-icon">V</div> VidScribe <span>Agent v3.4.7</span></div>
            <div style="font-size: 0.85rem; color: var(--accent-primary); background: rgba(100,255,218,0.1); padding: 5px 14px; border-radius: 20px; border: 1px solid rgba(100,255,218,0.2); font-weight: 500;">● Live v3.4.7</div>
        </header>
        <div id="chat-container">
            <div class="message agent-message">
                <div class="message-content">
                    <h3>Welcome to VidScribe! 🎬✍️</h3>
                    I'm ready to analyze your content. You can:
                    <ul>
                        <li>Paste a video link from <strong>YouTube</strong>, <strong>X (Twitter)</strong> or any public URL.</li>
                        <li>Paste a <strong>long text or article</strong> for instant summarization.</li>
                    </ul>
                    <blockquote>I'll extract the core value and generate a strategic summary for you.</blockquote>
                </div>
            </div>
        </div>
        <footer>
            <div class="auth-area">
                <span class="auth-label">Auth Key:</span>
                <input type="password" id="api-key-input" placeholder="Enter WARDEN_API_KEY..." autocomplete="off">
            </div>
            <form id="chat-form" class="input-area disabled" onsubmit="handleFormSubmit(event)">
                <input type="text" id="url-input" placeholder="Paste video link here..." autocomplete="off">
                <button type="submit" id="submit-btn">Analyze</button>
            </form>
        </footer>
    </div>
    <script>
        console.log('VidScribe v3.4 script loaded');
        const chatContainer = document.getElementById('chat-container');
        const urlInput = document.getElementById('url-input');
        const apiKeyInput = document.getElementById('api-key-input');
        const chatForm = document.getElementById('chat-form');
        const submitBtn = document.getElementById('submit-btn');

        function updateAuthState() {
            const hasKey = apiKeyInput.value.trim().length > 5;
            chatForm.classList.toggle('disabled', !hasKey);
            urlInput.disabled = !hasKey;
            submitBtn.disabled = !hasKey;
        }

        apiKeyInput.addEventListener('input', updateAuthState);

        // Load saved key
        apiKeyInput.value = localStorage.getItem('warden_api_key') || '';
        updateAuthState();

        function scrollToBottom() {
            chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
        }

        function addMessage(text, role, isLoading = false) {
            const div = document.createElement('div');
            div.className = 'message ' + role + '-message';
            if (isLoading) {
                div.innerHTML = '<div class="loading-dots"><div class="dot" style="animation-delay:0s"></div><div class="dot" style="animation-delay:0.2s"></div><div class="dot" style="animation-delay:0.4s"></div></div>';
            } else {
                updateContent(div, text);
            }
            chatContainer.appendChild(div);
            scrollToBottom();
            return div;
        }

        function updateContent(div, text) {
            // Safe and simple markdown-like parsing
            let html = text
                .replace(/### (.*)/g, '<h3>$1</h3>')
                .replace(/#### (.*)/g, '<h4>$1</h4>')
                .replace(/\\*\\*(.*)\\*\\*/g, '<strong>$1</strong>')
                .replace(/^> (.*)/gm, '<blockquote>$1</blockquote>')
                .replace(/^---$/gm, '<hr>')
                .replace(/^- (.*)/gm, '<li>$1</li>')
                .replace(/\\n/g, '<br>');
            
            div.innerHTML = '<div class="message-content">' + html + '</div>';
            scrollToBottom();
        }

        async function handleFormSubmit(e) {
            e.preventDefault();
            console.log('Form submitted');
            const url = urlInput.value.trim();
            if (!url) return;
            urlInput.value = '';
            
            addMessage(url, 'user');
            const agentDiv = addMessage('', 'agent', true);
            let first = true;

            const apiKey = apiKeyInput.value.trim();
            if (apiKey) localStorage.setItem('warden_api_key', apiKey);

            try {
                const response = await fetch('/', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'message/stream',
                        params: { message: { role: 'user', parts: [{ type: 'text', text: url }] } },
                        id: Date.now()
                    })
                });

                if (!response.body) throw new Error('Streaming not supported');
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                const result = data.result;
                                const text = (result?.status?.message?.parts?.[0]?.text) || (result?.message?.parts?.[0]?.text);
                                if (text) {
                                    if (first) { agentDiv.innerHTML = ''; first = false; }
                                    updateContent(agentDiv, text);
                                }
                            } catch(e) {}
                        }
                    }
                }
            } catch (err) {
                console.error('Fetch error:', err);
                agentDiv.innerHTML = '';
                updateContent(agentDiv, '<strong>Error:</strong> ' + err.message);
            }
        }
    </script>
    </body>
    </html>
        `;

    const httpServer = createServer((req, res) => {
        const method = req.method || 'GET';
        const url = req.url || '/';
        console.log(`📥 [v3.4.5] ${new Date().toISOString()} ${method} ${url}`);

        // Public Routes (No Auth Required)
        if ((url === '/' || url === '/chat') && (method === 'GET' || method === 'HEAD')) {
            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            if (method === 'HEAD') {
                res.end();
            } else {
                res.end(CHAT_HTML);
            }
            return;
        }

        if (url === '/ok' && (method === 'GET' || method === 'HEAD')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, version: '3.4.5' }));
            return;
        }

        // Security: Compliance with LangGraph Standard (x-api-key)
        // Public routes above have already returned, so this only applies to API calls
        const wardenKey = process.env.WARDEN_API_KEY;
        if (wardenKey) {
            const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
            if (authHeader !== wardenKey && authHeader !== `Bearer ${wardenKey}`) {
                console.warn(`🔒 Unauthorized access attempt blocked to ${url} (Invalid Key).`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized: Missing or invalid x-api-key' }));
                return;
            }
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
