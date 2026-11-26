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

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri || !/^mongodb(?:\+srv)?:\/\//.test(mongodbUri)) {
  throw new Error('MONGODB_URI deve contenere un URI MongoDB valido. Configura apps/server/.env.');
}

const jwtSecret = process.env.JWT_SECRET?.trim();
if (!jwtSecret) {
  throw new Error('JWT_SECRET è obbligatoria. Configura apps/server/.env.');
}

const configuredExpiry = process.env.JWT_EXPIRES_IN ?? '7d';
const expiryMatch = /^([1-9]\d*)([smhd])?$/.exec(configuredExpiry);
const secondsPerUnit: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
const jwtExpiresIn = expiryMatch
  ? Number(expiryMatch[1]) * secondsPerUnit[expiryMatch[2] ?? 's']
  : NaN;
if (!Number.isSafeInteger(jwtExpiresIn) || jwtExpiresIn <= 0) {
  throw new Error('JWT_EXPIRES_IN deve essere una durata positiva in secondi oppure con suffisso s, m, h o d.');
}

export const env = { port, mongodbUri, jwtSecret, jwtExpiresIn };
