import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/api.js';
import { getDatabase } from './server/db.js';

async function startServer() {
  const app = express();
  // O Render informa a porta pelo ambiente. Localmente continua na 3000.
  const PORT = Number(process.env.PORT) || 3000;

  // Trust proxy for production deployments (Cloud Run, Nginx, Cloudflare, etc.)
  app.set('trust proxy', 1);

  // Middlewares
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Key', 'x-device-key'],
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Initialize DB
  await getDatabase();

  // API Routes
  app.use('/api', apiRouter);

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Scooter Link Server rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('❌ Erro fatal ao iniciar o servidor Scooter Link:', err);
});
