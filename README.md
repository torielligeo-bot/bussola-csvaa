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

## App Android (APK)

La cartella `android/` contiene l'app Android. GitHub la compila da solo a ogni modifica (workflow "Compila app Android") e pubblica il file nella pagina Releases. Il link per scaricare l'ultima versione non cambia:

https://github.com/torielligeo-bot/bussola-csvaa/releases/latest/download/Bussola-CSVAA.apk

L'app mostra le stesse pagine del sito, quindi le migliorie arrivano senza reinstallare. Ogni ora controlla da sola i dati e manda le notifiche: non serve ntfy né alcun account. "Aggiungi al calendario" apre direttamente il calendario del telefono.

Installazione: apri il link dal telefono, scarica il file, aprilo e consenti l'installazione da questa fonte quando Android lo chiede.

La firma dell'APK usa una chiave di prova salvata nel repository (`android/app/bussola-prototipo.jks`). Va bene per provare l'app, ma prima di distribuirla davvero bisogna sostituirla con una chiave privata. Per il Play Store si usa la firma gestita da Google.

## Accesso con Google ed email (Firebase)

Il progetto Firebase è `bussola-csvaa` (piano gratuito Spark), con accesso Google ed email/password attivi e il dominio `torielligeo-bot.github.io` autorizzato. La configurazione è in `docs/config.js`.

- Sul sito l'accesso Google usa la finestra di Google.
- Nell'app Android usa l'account Google già presente sul telefono (Credential Manager) e passa il token a Firebase.
  Funziona solo con APK firmati dalla chiave registrata in Firebase (impronta SHA-1 in Impostazioni progetto > App Android).
  Se cambi chiave, o quando l'app va sul Play Store, aggiungi lì anche la nuova impronta.

Gli utenti registrati si vedono in Firebase > Authentication > Utenti.

## Prova in locale

```
node scraper/scrape.mjs        # con SOLO_PROVA=1 non manda notifiche
cd docs && python3 -m http.server 8000
```

## Limiti noti

- Se il CSVAA cambia la struttura del sito il lettore va adattato. In quel caso il giro orario si ferma con un errore visibile nella scheda Actions.
- L'orario e il luogo vengono ricavati dal testo dell'articolo. Quando il testo non li riporta in modo chiaro l'app rimanda alla pagina del sito.
- GitHub può ritardare di qualche minuto i giri orari.
