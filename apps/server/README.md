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
La rotta `/health` è definita in `app.ts`; le rotte utenti sono definite in
`routes/auth.route.ts` e montate alla radice dell'applicazione.

## Avvio

Dalla cartella `apps/server`:

```sh
npm ci
```

Copia `.env.example` in `.env`, se non esiste già. Avvia MongoDB e configura
`MONGODB_URI` con l'indirizzo del database. Genera una chiave per `JWT_SECRET`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Incolla il risultato in `JWT_SECRET` nel file `.env`, quindi avvia:

```sh
npm run dev
```

Il server legge sempre `.env` dalla propria cartella, anche se avviato dalla
radice del progetto. `PORT` vale `3000` quando non specificata.
`MONGODB_URI` e `JWT_SECRET` sono obbligatori. `JWT_EXPIRES_IN` vale `7d` per
impostazione predefinita e accetta secondi interi oppure durate con suffisso
`s`, `m`, `h` o `d`. Il server apre la porta solo dopo la connessione a MongoDB;
se il database non è raggiungibile, termina con un errore entro circa 5 secondi.

`GET http://localhost:3000/health` restituisce:

```json
{ "status": "ok", "timestamp": "2026-11-13T00:00:00.000Z" }
```

Il timestamp rappresenta l'istante della richiesta. Le rotte disponibili sono:

| Metodo | Percorso | Funzione |
| --- | --- | --- |
| POST | `/register` | Registrazione e token JWT |
| POST | `/login` | Accesso con email e password |
| PATCH | `/me` | Modifica del nome |
| PATCH | `/me/password` | Cambio password, minimo 8 caratteri |
| DELETE | `/me` | Eliminazione dell'account con conferma della password |

Le rotte `/me` mantengono il contratto con il gateway: ricevono l'identità
nell'header `X-User-Id`. Il gateway deve autenticare il chiamante e impostare
questo header; il servizio va esposto dietro quel gateway.

I body JSON malformati restituiscono `400 INVALID_JSON`, quelli troppo grandi
`413 PAYLOAD_TOO_LARGE`; le rotte inesistenti restituiscono `404 NOT_FOUND`.
L'accesso ai modelli AI è ancora da implementare.

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

Jest esegue i file `tests/**/*.test.mjs` sul codice compilato da `dist`.
`npm test` compila prima dell'esecuzione e verifica routing HTTP, validazione,
errori, token e configurazione. I test usano una porta locale temporanea e
simulano le operazioni MongoDB, senza richiedere o modificare un database reale.

## Docker

Dalla radice del progetto:

```sh
docker build -t chiron-server apps/server
docker run --rm -p 3000:3000 --env-file apps/server/.env chiron-server
```

Il database indicato da `MONGODB_URI` deve essere raggiungibile dal container:
su Docker Desktop, per un MongoDB sull'host usa `host.docker.internal` al posto
di `localhost`. I file `.env` e le dipendenze di sviluppo non vengono inclusi
nell'immagine finale.
