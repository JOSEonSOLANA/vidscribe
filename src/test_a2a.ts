import axios from 'axios';

async function testA2A() {
    try {
        const response = await axios.post('http://localhost:3000/', {
            jsonrpc: '2.0',
            method: 'message/send',
            params: {
                message: {
                    role: 'user',
                    parts: [{ type: 'text', text: 'https://video.twimg.com/amplify_video/2017536665691082753/vid/avc1/1920x1080/TDtTxN0Tuk9HOLbY.mp4?tag=21' }]
                }
            },
            id: 1
        });
        console.log('A2A Response:', JSON.stringify(response.data, null, 2));
    } catch (error: any) {
        console.error('A2A Error:', error.response?.data || error.message);
    }
}

testA2A();
