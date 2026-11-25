// Local examples only. These messages never claim to read the selected materials.
export function createDemoReply(prompt: string, materialCount: number, variant = 0) {
  const context = materialCount
    ? `\n\nHai aggiunto ${materialCount === 1 ? 'un materiale' : `${materialCount} materiali`} al messaggio. In questa demo il loro contenuto non viene analizzato.`
    : '';
  if (/fotosintesi/i.test(prompt)) {
    return (
      (variant % 2 === 0
        ? '## La luce diventa energia\n\nLa **fotosintesi** è il processo con cui le piante usano la luce del sole per produrre zuccheri a partire da acqua e anidride carbonica. Durante questo processo liberano ossigeno.\n\nImmagina una foglia come una piccola cucina: la luce fornisce l’energia, acqua e anidride carbonica sono gli ingredienti, gli zuccheri sono il cibo prodotto.\n\n**Da ricordare**\n\n- La clorofilla assorbe la luce.\n- Le radici assorbono l’acqua.\n- Le foglie scambiano gas con l’aria.\n\nProva a spiegarlo con parole tue: che cosa fornisce l’energia alla pianta?'
        : '## Un modo diverso di vederla\n\nPensa alla pianta come a una **fabbrica alimentata dal sole**.\n\n1. La clorofilla cattura l’energia della luce.\n2. La pianta usa acqua e anidride carbonica per produrre zuccheri.\n3. L’ossigeno viene liberato nell’ambiente.\n\nLa pianta trasforma quindi energia luminosa in energia chimica, immagazzinata negli zuccheri.\n\n**Mini ripasso:** quali sono le due materie prime di questo processo?') +
      context
    );
  }
  if (/quiz|domande|memoria|mettimi alla prova/i.test(prompt)) {
    return (
      '## Metti alla prova il ripasso\n\nEcco un **quiz dimostrativo sulla memoria**. Prova a rispondere prima di cercare le soluzioni.\n\n1. Che differenza c’è tra riconoscere una risposta e ricordarla senza aiuti?\n2. Perché distribuire il ripasso su più giorni può aiutare a ricordare?\n3. Come trasformeresti una pagina di appunti in tre domande di ripasso?\n\n**Un piccolo esercizio**\nChiudi gli appunti e scrivi tre idee che ricordi. Poi riaprili e controlla ciò che manca.' +
      context
    );
  }
  if (/riassun|metodo di studio/i.test(prompt)) {
    return (
      '## Un metodo di studio in quattro passaggi\n\nUn esempio di **riassunto strutturato**, da usare come punto di partenza.\n\n1. **Orienta.** Guarda titoli e obiettivi prima di leggere.\n2. **Comprendi.** Collega ogni concetto a un esempio concreto.\n3. **Richiama.** Chiudi il materiale e prova a spiegare ciò che ricordi.\n4. **Ripassa.** Torna sui punti incerti a distanza di tempo.\n\n**Il prossimo passo**\nScegli un solo argomento e trasformalo in una domanda a cui rispondere senza guardare gli appunti.' +
      context
    );
  }
  return (
    '## Costruiamo il ragionamento\n\nQuesta è una **risposta di esempio** per provare la conversazione. Quando collegheremo l’AI, qui troverai una risposta alla tua domanda.\n\nIntanto puoi esplorare un percorso di studio:\n\n1. **Metti a fuoco il dubbio.** Isola il passaggio che vuoi capire.\n2. **Cerca un esempio.** Collega l’idea a una situazione concreta.\n3. **Verifica.** Prova a spiegarla con parole tue.\n\nPuoi continuare con “Spiegami la fotosintesi”, “Mostrami un riassunto sul metodo di studio” oppure “Fammi un quiz sulla memoria”.' +
    context
  );
}
