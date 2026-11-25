import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});

const configuredPort = process.env.PORT ?? '3000';
const port = Number(configuredPort);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT deve essere un numero intero tra 1 e 65535.');
}

export const env = { port };
