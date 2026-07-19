require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
  credentials: false
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST']
  }
});

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeTicket(ticket) {
  return {
    id: ticket.id,
    name: ticket.name,
    odds: Number(ticket.odds),
    expires_at: ticket.expires_at,
    unhedged: Number(ticket.unhedged || 0),
    last_hedge: ticket.last_hedge,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at
  };
}

async function fetchAllTickets() {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .order('id', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeTicket);
}

async function fetchTicketById(ticketId) {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .single();

  if (error) throw error;
  return data ? normalizeTicket(data) : null;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'financial-prediction-mvp',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await fetchAllTickets();
    res.json({ success: true, tickets });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
  }
});

app.post('/api/bet', async (req, res) => {
  try {
    const ticketId = parseInt(req.body.ticketId, 10);
    const amount = parseInt(req.body.amount, 10);

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid ticketId' });
    }

    if (!Number.isInteger(amount) || amount < 100 || amount > 1000000) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const newUnhedged = toNumber(ticket.unhedged) + amount;

    if (!Number.isFinite(newUnhedged)) {
      return res.status(500).json({ success: false, error: 'Invalid unhedged calculation' });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('tickets')
      .update({
        unhedged: newUnhedged,
        last_hedge: now,
        updated_at: now
      })
      .eq('id', ticketId);

    if (updateError) {
      console.error('Update ticket error:', updateError);
      return res.status(500).json({ success: false, error: 'Failed to update ticket' });
    }

    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        ticket_id: ticketId,
        amount,
        created_at: now
      });

    if (txError) {
      console.error('Insert transaction error:', txError);
      return res.status(500).json({ success: false, error: 'Failed to record transaction' });
    }

    const updatedTicket = await fetchTicketById(ticketId);

    io.emit('ticketUpdated', updatedTicket);

    res.json({
      success: true,
      ticket: updatedTicket
    });
  } catch (error) {
    console.error('Bet error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

io.on('connection', async (socket) => {
  console.log('Socket connected:', socket.id);

  try {
    const tickets = await fetchAllTickets();
    socket.emit('initialTickets', tickets);
  } catch (error) {
    console.error('Initial socket load error:', error);
    socket.emit('serverError', { message: 'Failed to load initial tickets' });
  }

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, reason);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player-game.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});