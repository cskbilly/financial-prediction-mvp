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

// 模擬票據數據
let tickets = [
  {
    id: 1,
    name: "特斯拉 (TSLA) 今日收盤 > $420",
    unhedged: 385000,
    lastHedge: new Date(Date.now() - 47 * 60 * 1000)
  },
  {
    id: 2,
    name: "COMEX 黃金 7/28 收盤 > $4200",
    unhedged: 780,
    lastHedge: new Date(Date.now() - 78 * 60 * 1000)
  },
  {
    id: 3,
    name: "輝達 (NVDA) 今日收盤 > $145",
    unhedged: 0,
    lastHedge: new Date(Date.now() - 12 * 60 * 1000)
  }
];

// 提供票據資料給前端
app.get('/api/tickets', (req, res) => {
  res.json(tickets);
});

// 玩家下注 API
app.post('/api/bet', (req, res) => {
  const { ticketId, amount } = req.body;

  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  // 更新未對沖金額
  ticket.unhedged += amount;
  ticket.lastHedge = new Date();

  // 即時推送給所有後台客戶端
  io.emit('ticketUpdated', ticket);

  res.json({ success: true, ticket });
});

// Socket.io 連線
io.on('connection', (socket) => {
  console.log('後台已連線:', socket.id);
  socket.emit('initialTickets', tickets);
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`後端伺服器運行在 http://0.0.0.0:${PORT}`);
});