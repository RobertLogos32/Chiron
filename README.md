# Chiron

Un solo frontend per organizzare materie, leggere e annotare PDF, scrivere sui quaderni Konva e affiancare chat AI. L’interfaccia usa una palette grafite con accenti tenui e un carattere sans serif. Il visualizzatore, la lavagna e la barra strumenti mantengono lo stile esistente; ogni materiale vive in un pannello indipendente.

## Avvio

```sh
npm --prefix apps/web install
npm run dev
```

Apri **http://127.0.0.1:5174/**. Crea una materia oppure scegli “Esplora con un PDF e un quaderno di esempio”.

```text
Chiron/
  apps/
    web/                 Frontend React, PDF.js e Konva
      src/features/
        study/           Materie, libreria, pannelli e prototipo chat
        reader/          Visualizzatore PDF originale
        annotations/     Annotazioni separate per documento e pagina
        whiteboard/      Lavagna e strumenti Konva originali
      src/shared/        Hook comuni
      tests/             Verifiche PDF, lavagna e libreria
    server/              Server Express e TypeScript, organizzato per responsabilità
    _archive/            Struttura Konva precedente, conservata e non utilizzata
```

## Utilizzo

- Crea una materia con nome, colore ed eventuali PDF (massimo 50 MB ciascuno).
- Aggiungi allegati anche trascinandoli nella libreria; cerca e filtra i materiali. I tre puntini sui materiali permettono di rinominare o eliminare; nei quaderni, **Cambia colore** mostra un’anteprima della copertina prima del salvataggio.
- Rinomina o elimina una materia dai tre puntini sulla sua voce nella barra laterale. I menu rimangono entro i bordi dello schermo e si chiudono scorrendo la pagina, cliccando fuori o premendo Escape.
- Apri un PDF o un quaderno. L’icona **Affianca un pannello**, in alto a destra di ogni pannello, permette di aggiungere un **PDF**, una **lavagna** o una **chat AI** immediatamente dopo quel pannello. **Chat AI** apre subito una nuova conversazione con un solo clic. Puoi aggiungere più pannelli, in qualsiasi combinazione, e aprire lo stesso materiale in più viste. Dal selettore puoi anche importare un PDF o creare un quaderno. Il selettore compatto in alto a destra di PDF e lavagna permette di cambiare il materiale solo nel pannello scelto. Non ci sono barre con il titolo o icone delle impostazioni sopra gli editor.
- Clicca un pannello per attivarlo: una sola barra strumenti e le scorciatoie agiscono su quell’editor. Ogni PDF mantiene la sua pagina e ogni vista il suo zoom; gli appunti e annulla/ripeti si condividono fra viste dello stesso materiale, senza sovrascrivere le modifiche. I divisori si trascinano o si spostano con le frecce; un doppio clic o Home riequilibra la coppia. La X chiude soltanto quel pannello. Se i pannelli diventano molti, la zona di studio scorre orizzontalmente; su mobile si dispongono uno sopra l’altro e scorrono in verticale.
- Trascina la zona dei comandi o la maniglia di un pannello per cambiarne la posizione: una linea mostra il punto di inserimento e i bordi fanno scorrere lo spazio quando serve. PDF, lavagne e chat mantengono il proprio stato durante lo spostamento. Esc annulla. Con il fuoco sulla maniglia del pannello, Alt + freccia sinistra/destra riordina da tastiera; su mobile usa Alt + freccia su/giù.
- In studio, passa sul bordo sinistro per rivelare le materie. La freccia in alto a sinistra torna alla libreria. La puntina o `Ctrl+\` / `Cmd+\` fissa la navigazione sui desktop.
- **Impostazioni**, nella navigazione delle materie, contiene il tema chiaro/scuro dell’area di studio e le informazioni sul salvataggio. Tornando allo studio, pannelli, pagine, zoom, appunti e bozze chat restano al loro posto. Lo sfondo della lavagna si sceglie dal comando in alto a destra, che si espande al passaggio del mouse.
- **Inizia la chat**, in fondo alla libreria della materia, apre direttamente una conversazione; puoi anche aggiungere chat affiancate agli altri pannelli. Il prototipo include suggerimenti iniziali, composizione multilinea, selezione dei materiali della materia, risposte dimostrative progressive con interruzione, copia, rigenerazione e modifica dei messaggi. Modificare una domanda sostituisce i messaggi successivi. L’editor della domanda usa tutta la larghezza della chat e adatta automaticamente l’altezza al testo, senza ridimensionamento manuale; Esc annulla e Ctrl+Invio salva e invia. Lo scorrimento segue la risposta solo se stai leggendo in fondo; una freccia permette di tornare all’ultimo messaggio. Ogni pannello ha conversazione e bozza separate, conservate finché resta aperto; L’icona **Nuova chat**, in alto a destra della chat e a sinistra di Affianca, le azzera. La freccia per tornare alla materia resta in alto a sinistra, senza il nome della materia. Invio invia e Shift+Invio va a capo. La modalità **Demo** usa esempi locali, non legge i file e non contatta servizi AI. I lavori AI sulle selezioni di PDF e lavagna mantengono invece il loro comportamento di attesa senza risposte simulate.
- Le funzionalità originali di zoom, selezione, penna, evidenziatore, gomma, testo, sfondo, tema e annulla/ripeti restano disponibili.
- La barra si adatta allo strumento con un’animazione: selezione, mano e AI nascondono colori e spessore; la gomma nasconde solo i colori. Penna, evidenziatore e testo mostrano entrambi i controlli. Le preferenze vengono conservate passando da uno strumento all’altro.
- Con **AI**, seleziona un’area: la barra compatta cerca spazio fuori dalla selezione e può sovrapporsi temporaneamente agli altri pannelli. La bozza resta legata alla selezione di origine e viene conservata cambiando pannello o aprendo le impostazioni. `Invio` o `Ctrl+Invio` nascondono la barra: resta il buddy Chiron con occhiali e rotella, accanto a una X, sotto l’angolo inferiore destro della selezione. Durante lo scorrimento il buddy segue sempre lo stesso angolo. Se l’area esce dal pannello o lo zoom scende sotto il 93%, resta il solo buddy globale in basso a destra. `Shift+Invio` va a capo; `Esc` chiude la bozza o interrompe la richiesta selezionata. I blocchi AI si applicano a tutte le viste dello stesso quaderno o della stessa pagina PDF; il buddy riapre anche un pannello chiuso quando torni alla sua selezione.

I PDF si salvano in IndexedDB; materie, preferenze e appunti nel browser. Ogni quaderno ha un salvataggio indipendente. Gli appunti si salvano anche uscendo immediatamente da un quaderno. I documenti non vengono inviati al server. Il salvataggio vale per questo browser e indirizzo: cancellare i dati del sito rimuove i materiali.

Puoi inviare più selezioni AI, anche sovrapposte. Ogni richiesta conserva il proprio rettangolo e buddy cambiando strumento, pannello, pagina PDF o materiale. Le aree in lavorazione impediscono scrittura, gomma, modifica e trascinamento del testo, cancellazione e annulla/ripeti sui contenuti coinvolti; il resto del foglio rimane utilizzabile. I testi e i tratti esistenti che toccano un’area occupata restano immutabili fino alla sua liberazione. La X accanto a una selezione annulla solo quella richiesta; un’area condivisa con altri lavori rimane protetta. Durante i lavori resta **un solo buddy globale senza X** nell’angolo. Click o Invio partono dalla selezione più vicina sopra la vista corrente e scorrono i risultati di PDF e lavagna verso l’alto; alla prima selezione il percorso si inverte verso il basso, e viceversa all’ultima. Con le frecce su e giù sul buddy puoi scegliere la direzione. Il comando attiva il pannello, riapre il materiale o la pagina PDF se necessario e riporta lo zoom almeno al 93%. Anche le selezioni sovrapposte sono raggiungibili singolarmente, con la propria X per interrompere il lavoro.

La barra AI è un’anteprima frontend, senza un servizio AI collegato: lo stato di attesa rimane fino all’annullamento e non vengono generate risposte fittizie. `AiRequestsProvider.onSend(request, signal)` è pronto per un gestore asincrono che restituisce il testo della risposta; la richiesta comprende lo scope del quaderno o della pagina PDF. Risposta, errore e annullamento liberano solo il relativo blocco. In caso di errore compare Riprova. L’annullamento interrompe il segnale e ignora risposte tardive; i lavori non si interrompono smontando l’editor di origine. I lavori rimangono nella sessione aperta e non vengono ripristinati ricaricando l’app. Il server esistente espone solo `/health`: autenticazione e sincronizzazione cloud non sono implementate. L’origine e il prompt del buddy sono documentati in `apps/web/src/assets/buddy/README.md`.

## Verifiche e produzione

```sh
npm test
npm run format:check
npm run build
npm run preview
```

Il comando build produce `apps/web/dist`, includendo worker, font PDF e decoder locali. Per avviare il server separatamente: `npm --prefix apps/server install`, poi `npm --prefix apps/server run dev`.

Il server ha le cartelle `agents`, `config`, `controllers`, `dto`, `middleware`, `models`,
`routes`, `services`, `types` e `utils` dentro `src`. `app.ts` configura Express e
`index.ts` avvia l'ascolto. Le istruzioni per Docker, ESLint e Jest sono in
[apps/server/README.md](apps/server/README.md).
