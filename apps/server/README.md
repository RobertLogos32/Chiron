# Server Chiron

Server Express con TypeScript e moduli ESM. Richiede Node.js 24 o successivo.

## Struttura

```text
server/
  src/
    agents/          Agenti AI, istruzioni e strumenti
    config/          Caricamento e validazione della configurazione
    controllers/     Gestori delle richieste HTTP
    dto/             Contratti dei dati in ingresso e in uscita
    middleware/      Middleware Express condivisi
    models/          Modelli dei dati e schemi del database
    routes/          Definizione e composizione delle rotte
    services/        Logica applicativa
    types/           Tipi condivisi
    utils/           Funzioni di utilità
    app.ts           Configurazione Express, senza aprire una porta
    index.ts         Avvio del server
  .dockerignore
  .env.example
  Dockerfile
  eslint.config.ts
  jest.config.ts
  package.json
  tsconfig.json
```

Le cartelle ancora vuote contengono `.gitkeep` per conservarle nel repository.
La semplice rotta `/health` è definita direttamente in `app.ts`; le altre
cartelle sono predisposte per le funzionalità applicative.

## Avvio

Dalla cartella `apps/server`:

```sh
npm ci
```

Copia `.env.example` in `.env`, se non esiste già, poi avvia:

```sh
npm run dev
```

Il server legge sempre `.env` dalla propria cartella, anche se avviato dalla
radice del progetto. `PORT` vale `3000` quando non specificata.

`GET http://localhost:3000/health` restituisce:

```json
{ "status": "ok", "timestamp": "2026-11-13T00:00:00.000Z" }
```

Il timestamp rappresenta l'istante della richiesta. Autenticazione, accesso ai
modelli AI e collegamento al database sono ancora da implementare; i relativi
campi in `.env.example` sono segnaposto.

## Controlli e produzione

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

ESLint controlla la sintassi e le regole JavaScript; il compilatore TypeScript
controlla tipi e variabili inutilizzate. I file di configurazione TypeScript
vengono caricati tramite `jiti` per ESLint ed `esbuild-register` per Jest.

Jest è predisposto per file `tests/**/*.test.mjs` che importano il codice
compilato da `dist`. `npm test` compila prima dell'esecuzione; al momento non ci
sono suite e il comando lo segnala senza errore.

## Docker

Dalla radice del progetto:

```sh
docker build -t chiron-server apps/server
docker run --rm -p 3000:3000 chiron-server
```

Per utilizzare una configurazione locale aggiungi
`--env-file apps/server/.env` prima del nome dell'immagine. I file `.env` e le
dipendenze di sviluppo non vengono inclusi nell'immagine finale.
