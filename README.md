# Bussola CSVAA (prototipo)

App per volontari ed enti del Terzo settore di Asti e Alessandria. Legge ogni ora il sito del CSV Asti e Alessandria (calendario, notizie, bandi), mostra tutto in un'app da installare sul telefono e manda una notifica quando esce qualcosa di nuovo.

Il prototipo non è ufficiale. Prima di farlo girare tra i volontari serve l'ok del CSVAA, anche perché usa il loro logo.

## Cosa fa

- Calendario del CSVAA con appuntamenti e scadenze dei bandi, da aggiungere al calendario del telefono (Google, iPhone, Outlook). Si aggiorna da solo.
- Notifiche sul telefono tramite l'app gratuita ntfy: nuovo appuntamento, promemoria la sera prima, nuovo bando, bando che scade tra 7 giorni e il giorno prima, notizie della settimana.
- Notizie filtrabili per Asti e Alessandria.
- Registrazione: per ora il profilo resta sul telefono. Con Firebase si attivano l'accesso con Google e con email e password.
- Prenotazione del Punto digitale facile: l'app prepara l'email per facilitazione@csvaa.it con i dati del profilo, oppure apre il modulo del sito. Il modulo del sito ha un reCAPTCHA, quindi l'app non lo invia da sola.
- I miei appuntamenti: richieste inviate, eventi salvati, file da aggiungere al calendario.

## Come è fatta

```
scraper/parse.mjs     lettura delle pagine del sito (calendario, notizie, bandi)
scraper/scrape.mjs    giro orario: scarica, crea dati.json e calendario.ics, manda le notifiche
docs/                 l'app (pubblicata con GitHub Pages)
docs/config.js        impostazioni: canale notifiche, Firebase, contatti
state/stato.json      memoria di cosa è già stato notificato
.github/workflows/    avvio automatico ogni ora
```

Non servono server né librerie esterne: Node 20 o superiore, GitHub Actions e GitHub Pages, tutto gratuito per un repository pubblico.

## Messa in linea

1. Su GitHub crea un repository pubblico (per esempio `bussola-csvaa`) e caricaci questi file.
2. Settings > Pages > Build and deployment: "Deploy from a branch", ramo `main`, cartella `/docs`.
3. Scheda Actions > "Aggiorna dati CSVAA" > Run workflow. Al primo giro arriva sul canale il messaggio "Bussola CSVAA attiva". Da lì in poi il programma gira da solo ogni ora.
4. L'app è all'indirizzo `https://<utente>.github.io/bussola-csvaa/`. Dal telefono aprila e scegli "Aggiungi a schermata Home".

Il nome del canale delle notifiche è in `docs/config.js` (`ntfyTopic`). Chi conosce il nome può leggere il canale: i contenuti sono comunque pubblici sul sito del CSVAA.

## Accesso con Google ed email (Firebase)

1. Vai su console.firebase.google.com e crea un progetto (gratuito).
2. Authentication > Metodo di accesso: attiva Google ed Email/password.
3. Authentication > Impostazioni > Domini autorizzati: aggiungi `<utente>.github.io`.
4. Impostazioni progetto > Le tue app > Web: copia la configurazione in `firebase` dentro `docs/config.js`.

## Prova in locale

```
node scraper/scrape.mjs        # con SOLO_PROVA=1 non manda notifiche
cd docs && python3 -m http.server 8000
```

## Limiti noti

- Se il CSVAA cambia la struttura del sito il lettore va adattato. In quel caso il giro orario si ferma con un errore visibile nella scheda Actions.
- L'orario e il luogo vengono ricavati dal testo dell'articolo. Quando il testo non li riporta in modo chiaro l'app rimanda alla pagina del sito.
- GitHub può ritardare di qualche minuto i giri orari.
