import cors from 'cors';
import express from 'express';
import { errorHandler } from './middleware/error.middleware.js';
import authRouter from './routes/auth.route.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use(authRouter);
app.use((_req, res) => {
  res.status(404).json({ status: 'fail', code: 'NOT_FOUND', message: 'Rotta non trovata' });
});
app.use(errorHandler);
export default app;
