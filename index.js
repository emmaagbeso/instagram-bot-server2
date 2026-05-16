const express = require('express');
const app = express();
app.use(express.json());

// ============================================================
// CLIENT CONFIG — Add each client here
// ============================================================
const CLIENTS = {
  // Instagram Page ID → client config
  "YOUR_CLIENT1_PAGE_ID": {
    name: "Chicken Republic",
    platform: "instagram",
    flowise_url: "https://flowise-production-d6fa.up.railway.app",
    chatflow_id: "2cb7f561-35df-4b81-b3fa-e684ce2883db",
    session_prefix: "chicken_republic_",
    access_token: "YOUR_CLIENT1_PAGE_ACCESS_TOKEN"
  },
  // Add more clients below:
  // "ANOTHER_PAGE_ID": {
  //   name: "Client 2",
  //   platform: "instagram",  // or "whatsapp"
  //   flowise_url: "https://flowise-production-d6fa.up.railway.app",
  //   chatflow_id: "their-chatflow-id-here",
  //   session_prefix: "client2_",
  //   access_token: "THEIR_PAGE_ACCESS_TOKEN"
  // },
};

const VERIFY_TOKEN = "my_secret_verify_token"; // You choose this — any string

// ============================================================
// WEBHOOK VERIFICATION (Meta requires this)
// ============================================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============================================================
// RECEIVE MESSAGES FROM META
// ============================================================
app.post('/webhook', async (req, res) => {
  const body = req.body;
  res.sendStatus(200); // Always respond fast to Meta

  if (body.object !== 'instagram' && body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    const pageId = entry.id;
    const client = CLIENTS[pageId];
    if (!client) {
      console.log(`No client found for page ID: ${pageId}`);
      continue;
    }

    // Extract message
    const messaging = entry.messaging?.[0];
    if (!messaging || !messaging.message || messaging.message.is_echo) continue;

    const senderId = messaging.sender.id;
    const userMessage = messaging.message.text;
    if (!userMessage) continue;

    console.log(`[${client.name}] Message from ${senderId}: ${userMessage}`);

    try {
      // Call Flowise
      const botReply = await callFlowise(client, userMessage, senderId);
      console.log(`[${client.name}] Bot reply: ${botReply}`);

      // Send reply back
      await sendInstagramReply(client, senderId, botReply);
    } catch (err) {
      console.error(`[${client.name}] Error:`, err.message);
    }
  }
});

// ============================================================
// CALL FLOWISE
// ============================================================
async function callFlowise(client, message, userId) {
  const response = await fetch(`${client.flowise_url}/api/v1/prediction/${client.chatflow_id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: message,
      sessionId: client.session_prefix + userId
    })
  });

  if (!response.ok) throw new Error(`Flowise error: ${response.status}`);
  const data = await response.json();
  return data.text || "Sorry, I couldn't process that.";
}

// ============================================================
// SEND INSTAGRAM REPLY
// ============================================================
async function sendInstagramReply(client, recipientId, message) {
  const response = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${client.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Instagram reply error: ${err}`);
  }
}

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot server running on port ${PORT}`));
