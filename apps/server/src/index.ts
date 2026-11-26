import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';
import mongoose from 'mongoose';

try {
  await connectDatabase();
  const server = app.listen(env.port, () => {
    console.log(`Server avviato su http://localhost:${env.port}`);
  });

  server.on('error', async (error: NodeJS.ErrnoException) => {
    console.error(`Impossibile avviare il server HTTP: ${error.code ?? 'errore sconosciuto'}.`);
    await mongoose.disconnect();
    process.exitCode = 1;
  });

  const shutdown = () => {
    server.close(() => {
      void mongoose.disconnect();
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch {
  console.error('Connessione a MongoDB fallita. Verifica MONGODB_URI e che MongoDB sia raggiungibile.');
  await mongoose.disconnect();
  process.exitCode = 1;
}
