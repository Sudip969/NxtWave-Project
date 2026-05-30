// Keep track of active SSE client connections per userId
const sseClients = {};

const subscribe = (req, res, next) => {
  const userId = req.user.id;

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Heartbeat to keep connection alive
  res.write(': sse connection active\n\n');

  const keepAliveInterval = setInterval(() => {
    res.write(': keepalive heartbeat\n\n');
  }, 30000); // 30s heartbeat

  // Store the connection
  if (!sseClients[userId]) {
    sseClients[userId] = [];
  }
  sseClients[userId].push(res);
  console.log(`User ${userId} subscribed to real-time notification stream. Total clients: ${sseClients[userId].length}`);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(keepAliveInterval);
    if (sseClients[userId]) {
      sseClients[userId] = sseClients[userId].filter(client => client !== res);
      if (sseClients[userId].length === 0) {
        delete sseClients[userId];
      }
    }
    console.log(`User ${userId} disconnected from SSE stream.`);
  });
};

module.exports = {
  subscribe,
  sseClients
};
