'use strict';

require('dotenv').config();

const express       = require('express');
const http          = require('http');
const { Server }    = require('socket.io');
const path          = require('path');
const helmet        = require('helmet');
const morgan        = require('morgan');
const cookieParser  = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit     = require('express-rate-limit');
const compression   = require('compression');

const connectDB                     = require('../config/database');
const routes                        = require('./routes');
const { notFound, errorHandler }    = require('./middleware/errorHandler');
const initSocket                    = require('./socketHandler');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || false, credentials: true },
});

/* ── Expose io cho controllers ── */
app.set('io', io);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SECURITY MIDDLEWARE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));

/* ── Global API rate limit (exclude static/assets) ── */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Quá nhiều yêu cầu, thử lại sau.' },
});
app.use('/api', apiLimiter);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GENERAL MIDDLEWARE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use(mongoSanitize());           // Chống NoSQL injection
app.use(compression());             // Gzip responses

/* ── Static files ── */
app.use(express.static(path.join(__dirname, '../public'), { 
  maxAge: process.env.NODE_ENV === 'production' ? '30d' : '7d',
  etag: false, // Disable etag for static files as we use maxAge
}));
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { 
  maxAge: process.env.NODE_ENV === 'production' ? '30d' : '7d',
}));

/* ── View engine ── */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.set('view cache', false);

/* ── EJS helpers ── */
const { formatRelativeTime } = require('./utils/dateHelper');
app.use((req, res, next) => {
  res.locals.formatRelativeTime = formatRelativeTime;
  // Do not cache HTML documents. Route/view changes should appear immediately.
  if (req.method === 'GET' && req.accepts('html')) {
    res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
app.use('/', routes);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ERROR HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
app.use(notFound);
app.use(errorHandler);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SOCKET.IO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
initSocket(io);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   START SERVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const PORT = process.env.PORT || 3000;

(async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`\n🔥 DramaBuzz v3 running → http://localhost:${PORT}`);
    console.log(`   ENV: ${process.env.NODE_ENV || 'development'}\n`);
  });
})();

module.exports = { app, server };
