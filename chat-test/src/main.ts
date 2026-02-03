import './style.css'
import axios from 'axios'

const AGENT_URL = 'http://localhost:3000'

const messagesContainer = document.getElementById('messages')!
const chatContainer = document.getElementById('chat-container')!
const chatForm = document.getElementById('chat-form') as HTMLFormElement
const urlInput = document.getElementById('url-input') as HTMLInputElement
const statusBadge = document.getElementById('server-status')!
const statusDot = statusBadge.querySelector('.status-dot')!

// Check server status
async function checkStatus() {
  try {
    const res = await axios.get(`${AGENT_URL}/ok`)
    if (res.data.ok) {
      statusDot.classList.add('online')
      statusBadge.childNodes[2].textContent = 'Agent Online'
    }
  } catch (err) {
    statusDot.classList.remove('online')
    statusBadge.childNodes[2].textContent = 'Agent Offline'
  }
}

checkStatus()
setInterval(checkStatus, 5000)

function addMessage(text: string, role: 'user' | 'agent', isLoading: boolean = false) {
  const messageDiv = document.createElement('div')
  messageDiv.className = `message ${role}-message`

  if (isLoading) {
    messageDiv.innerHTML = `
      <div class="loading-dots">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `
  } else {
    updateMessageContent(messageDiv, text)
  }

  messagesContainer.appendChild(messageDiv)
  chatContainer.scrollTop = chatContainer.scrollHeight
  return messageDiv
}

function updateMessageContent(messageDiv: HTMLDivElement, text: string) {
  const content = messageDiv.querySelector('.message-content') || document.createElement('div')
  content.className = 'message-content'

  // Basic markdown support for results
  const formattedText = text
    .replace(/### (.*)/g, '<h3>$1</h3>')
    .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')

  content.innerHTML = formattedText
  if (!messageDiv.contains(content)) {
    messageDiv.appendChild(content)
  }
  chatContainer.scrollTop = chatContainer.scrollHeight
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const url = urlInput.value.trim()
  if (!url) return

  urlInput.value = ''
  addMessage(url, 'user')

  const agentMsg = addMessage('', 'agent', true)

  try {
    // Using fetch for streaming support (A2A message/stream)
    const response = await fetch(`${AGENT_URL}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'message/stream',
        params: {
          message: {
            role: 'user',
            parts: [{ type: 'text', text: url }]
          }
        },
        id: Date.now()
      })
    })

    if (!response.body) throw new Error('No readable stream')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    // Clear loading dots on first event
    let firstEvent = true

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      // SSE format: data: {...}\n\n
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            const result = data.result

            // Warden A2A Status Update format: result.status.message.parts
            if (result && result.kind === 'status-update' && result.status?.message?.parts) {
              if (firstEvent) {
                agentMsg.innerHTML = ''
                firstEvent = false
              }
              const text = result.status.message.parts[0].text
              updateMessageContent(agentMsg, text)
            }
            // Also handle direct message parts if present in other result formats
            else if (result?.message?.parts) {
              if (firstEvent) {
                agentMsg.innerHTML = ''
                firstEvent = false
              }
              const text = result.message.parts[0].text
              updateMessageContent(agentMsg, text)
            }
          } catch (e) {
            console.error('Error parsing stream chunk', e)
          }
        }
      }
    }
  } catch (err: any) {
    agentMsg.innerHTML = ''
    updateMessageContent(agentMsg, `Error contacting agent: ${err.message}. Make sure the server is running on port 3000.`)
  }
})
