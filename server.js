const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// 暫時使用記憶體陣列測試
let tickets = [
  { id: 1, name: "特斯拉 (TSLA) 今日收盤 > $420", unhedged: 385000, lastHedge: new Date() },
  { id: 2, name: "COMEX 黃金 7/28 收盤 > $4200", unhedged: 186420, lastHedge: new Date() },
  { id: 3, name: "輝達 (NVDA) 今日收盤 > $145", unhedged: 0, lastHedge: new Date() }
];

// 取得所有票據
app.get('/api/tickets', (req, res) => {
  res.json(tickets);
});

// 玩家下注
app.post('/api/bet', (req, res) => {
  const { ticketId, amount } = req.body;

  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  ticket.unhedged = parseFloat(ticket.unhedged) + parseFloat(amount);
  ticket.lastHedge = new Date();

  io.emit('ticketUpdated', ticket);

  res.json({ success: true, ticket });
});

// Socket.io 連線
io.on('connection', (socket) => {
  console.log('後台已連線:', socket.id);
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`後端伺服器運行在 http://0.0.0.0:${PORT}`);
});