const WebSocket = require('ws');

const PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public?app_id=1089';
const ws = new WebSocket(PUBLIC_WS_URL);

ws.on('open', () => {
  console.log('Connected!');
  ws.send(JSON.stringify({
    ticks_history: "R_10",
    end: 'latest',
    count: 100,
    style: 'ticks',
    subscribe: 1,
    req_id: 1,
  }));
});

ws.on('message', (data) => {
  const parsed = JSON.parse(data);
  if (parsed.error) {
    console.error('Error received:', parsed.error);
  } else if (parsed.msg_type === 'active_symbols') {
    console.log('Symbols count:', parsed.active_symbols.length);
    console.log('Sample symbols:', parsed.active_symbols.slice(0, 5).map(s => s.symbol));
    const r10 = parsed.active_symbols.find(s => s.symbol === 'R_10');
    console.log('R_10 exists:', !!r10);
    ws.close();
  } else {
    console.log('Other message:', parsed.msg_type);
  }
});

ws.on('close', () => {
  console.log('Closed');
});
ws.on('error', (err) => {
  console.error('WS Error:', err);
});
