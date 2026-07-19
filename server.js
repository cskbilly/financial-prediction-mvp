const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

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

// Supabase 設定
const supabaseUrl = 'https://hcwikvcdpnnssuibqvbd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhjd2lrdmNkcG5uc3N1aWJxdmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NDQyMjIsImV4cCI6MjEwMDAyMDIyMn0.apRzZ09BilPfafDEtdOFvbhde2QcxhF5zf0MxZ59du4';
const supabase = createClient(supabaseUrl, supabaseKey);

// 取得所有票據
app.get('/api/tickets', async (req, res) => {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    console.error('Get tickets error:', error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// 玩家下注
app.post('/api/bet', async (req, res) => {
  const { ticketId, amount } = req.body;

  try {
    // 1. 取得票據
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      console.error('Ticket not found:', ticketError);
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // 2. 更新未對沖金額
    const newUnhedged = parseFloat(ticket.unhedged) + parseFloat(amount);

    const { error: updateError } = await supabase
      .from('tickets')
      .update({ 
        unhedged: newUnhedged, 
        last_hedge: new Date().toISOString() 
      })
      .eq('id', ticketId);

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({ error: updateError.message });
    }

    // 3. 記錄交易
    await supabase.from('transactions').insert({
      ticket_id: ticketId,
      amount: parseFloat(amount)
    });

    // 4. 取得更新後的票據並推送給後台
    const { data: updatedTicket } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    io.emit('ticketUpdated', updatedTicket);

    res.json({ success: true, ticket: updatedTicket });

  } catch (err) {
    console.error('Bet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Socket.io 連線
io.on('connection', (socket) => {
  console.log('後台已連線:', socket.id);
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`後端伺服器運行在 http://0.0.0.0:${PORT}`);
});