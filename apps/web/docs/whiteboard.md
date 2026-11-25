# Lavagna

La lavagna è ora integrata in `apps/web`, insieme al visualizzatore PDF. I comandi seguenti si eseguono da `apps/web`; la pagina si apre dalla libreria creando un quaderno. Il codice degli editor e i loro stili sono stati mantenuti.

Una lavagna a tutto schermo con React, TypeScript e Konva. La barra in basso contiene **selezione**, **penna**, **evidenziatore**, **gomma**, **testo**, **mano**, **AI**, colori, spessore e annulla/ripeti.

```sh
npm install
npm run dev
```

- Scrivi con mouse, touch o penna. I tasti `S`, `P`, `H`, `E`, `T`, `V`, `A` selezionano gli strumenti.
- Con **Seleziona**, clicca un elemento o trascina un rettangolo per selezionare tratti e testi. `Shift` aggiunge alla selezione, `Ctrl+A` seleziona tutto, `Canc` o `Backspace` cancellano gli elementi selezionati. Il pulsante cestino funziona anche su touch. `Esc` deseleziona.
- La **gomma** cancella solo le parti di tratto attraversate. I testi toccati vengono rimossi come elementi interi. Una passata si annulla con un solo `Ctrl+Z`.
- L’**evidenziatore** ha un tratto piatto trasparente, un colore separato e resta sotto penna e testo. Tieni `Shift` durante il trascinamento per una riga orizzontale.
- Con **Testo**, tocca il foglio per scrivere o un appunto per modificarlo. Clicca fuori o premi `Ctrl+Invio` per confermare; `Esc` annulla.
- La lavagna ha un'origine fissa in alto a sinistra e si estende senza limiti verso destra e in basso. Con **Mano**, rotella o trackpad puoi esplorarla e tornare all'origine senza superare i bordi iniziali. Anche zoom, disegno e spostamento dei testi rispettano questi limiti.
- In alto a destra scegli **tema chiaro/scuro** e sfondo **libero, a righe, a quadretti o puntinato**. Il primo avvio è scuro. Le preferenze vengono salvate e i colori degli appunti si adattano al tema.
- Passando il mouse sul colore attivo, la barra degli strumenti si allarga con un’animazione per mostrare gli altri colori al suo interno; si richiude quando il mouse esce. Su touch, tocca il colore attivo. Con la tastiera, premi Invio o una freccia sul comando e scegli il colore. Il menu degli sfondi include anteprime ed è navigabile con le frecce.
- Con **AI**, trascina un rettangolo sulla lavagna: accanto all’area compare un campo per il prompt. **Invia** o `Ctrl+Invio` preparano la richiesta, `Esc` chiude. Per questa versione è stata richiesta solo l’interfaccia: non vengono chiamati servizi AI e non viene simulata una risposta. Il componente `AiPrompt` espone un callback `onSend` con prompt e coordinate della selezione per una futura integrazione.
- I controlli **− / percentuale / +** regolano lo zoom dal 25% al 400%. Clicca la percentuale per tornare al 100%. Con `Ctrl+rotella` (o il gesto di zoom del trackpad) ingrandisci attorno al puntatore. Puoi usare anche `+`, `−`, `0`. Posizione e zoom si salvano insieme agli appunti.
- `Ctrl+Z` annulla; `Ctrl+Shift+Z` o `Ctrl+Y` ripetono.
- Gli appunti si salvano automaticamente nel browser su questo indirizzo. Cancellare i dati del browser elimina gli appunti. Il vecchio quaderno resta nella sua voce di salvataggio separata.

Per la versione di produzione: `npm run build`, poi `npm run preview`.

Verifiche della geometria di selezione, gomma e zoom: `npm test` (Node 24 o successivo).

## Struttura del frontend

Il codice usa una struttura **per funzionalità** e il pattern **Container/Presentational con custom hook**. La pagina compone i componenti; i componenti visuali ricevono dati e callback; gli hook coordinano stato, effetti e gesti. I salvataggi restano compatibili con la versione precedente.

```text
src/
  App.tsx                         # Ingresso dell'applicazione
  pages/WhiteboardPage.tsx         # Composizione della pagina lavagna
  features/whiteboard/
    components/
      canvas/                     # Disegno, selezioni e editor del testo
      toolbar/                    # Strumenti, colori, spessore e cronologia
      settings/                   # Tema, sfondo e zoom
      ai/                         # Interfaccia del prompt AI
    hooks/                        # Stato e comportamenti React
    model/                        # Tipi, colori e reducer della cronologia
    services/storage.ts           # Lettura e scrittura nel browser
    lib/                          # Geometria e posizionamento del prompt
    config/                       # Strumenti e valori iniziali
    styles/                       # Stili separati per area dell'interfaccia
  shared/hooks/                   # Hook riutilizzabili per dimensioni e menu
  styles/global.css               # Regole comuni dell'applicazione
```

`useWhiteboard` è il coordinatore della pagina. Le interazioni usano piccoli gestori con le stesse operazioni `move` e `finish`: penna, gomma, selezione e spostamento mantengono responsabilità separate. Il reducer della cronologia raggruppa ogni gesto in una sola modifica annullabile.

Per una modifica visuale, intervieni nel componente e nel relativo file di stile. Per cambiare il comportamento di uno strumento, intervieni nel suo hook. Le funzioni geometriche e la cronologia sono verificabili senza avviare React.

```sh
npm run format        # Formatta automaticamente il codice
npm run format:check  # Verifica la formattazione
npm test              # Geometria e cronologia
npm run build         # TypeScript e build di produzione
```
