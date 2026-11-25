# TODO server Chiron

## 1. Ripristinare le risposte HTTP

- [ ] Rimuovere `app.use(Router)` da `apps/server/src/app.ts`. Quando le rotte di autenticazione saranno pronte, montare il router esportato da `auth.route.ts` sotto `/auth`.
- [ ] Verificare che `GET /health` risponda con `200` e `{ "status": "ok", "timestamp": "..." }`.

## 2. Collegare MongoDB e completare la configurazione

- [ ] Dichiarare `MONGODB_URI`, `JWT_SECRET` e `JWT_EXPIRES_IN` in `.env.example` e validarle all’avvio in `src/config/env.ts`.
- [ ] Connettere Mongoose a MongoDB prima di avviare l’ascolto HTTP in `src/index.ts`.

## 3. Completare l’autenticazione

- [ ] Applicare il middleware JWT alle rotte private `/me` e `/me/password` prima di esporle.
- [ ] Nei controller delle rotte private, usare `req.user.id` impostato dal middleware JWT al posto di `X-User-Id`.
- [ ] Usare `updatePasswordDto` per validare il cambio password e allinearlo alle regole della registrazione.

## 4. Verificare il flusso completo

- [ ] Aggiungere un test di integrazione che verifichi `/health`, registrazione, login e modifica del proprio profilo.
- [ ] Rieseguire `npm run typecheck`, `npm run lint` e `npm test`.
- [ ] Verificare che l’immagine Docker si compili e che il container risponda su `/health`.

Al momento della revisione, build, typecheck e lint passavano. Jest non aveva suite da eseguire e il motore Docker era spento.

Collegare la chat AI dopo aver verificato il flusso di autenticazione.
