// Impostazioni dell'app. È l'unico file da modificare per collegare notifiche e accesso.
window.BUSSOLA_CONFIG = {
  // Canale ntfy su cui il lettore orario pubblica le notifiche (deve coincidere con NTFY_TOPIC su GitHub)
  ntfyServer: 'https://ntfy.sh',
  ntfyTopic: 'csvaa-bussola-ta7k2',

  // Accesso con Google ed email: incollare qui la configurazione del progetto Firebase
  // (console.firebase.google.com > Impostazioni progetto > Le tue app > Web).
  // Questi valori sono identificativi pubblici, non password: possono stare nel codice.
  firebase: {
    apiKey: 'AIzaSyAQeRmpIJ8_jtZyIafup7Ipy30qYeLQ4BA',
    authDomain: 'bussola-csvaa.firebaseapp.com',
    projectId: 'bussola-csvaa',
    storageBucket: 'bussola-csvaa.firebasestorage.app',
    messagingSenderId: '502713426647',
    appId: '1:502713426647:web:2f3f8ac10c962b481f4692'
  },
  // ID client web di Google (identificativo pubblico), usato dall'accesso nativo nell'app Android
  googleWebClientId: '502713426647-6du8svqrnduu23r3vv5hiijqq4lraasa.apps.googleusercontent.com',

  // Contatti usati dalle prenotazioni e dalla pagina servizi
  emailFacilitazione: 'facilitazione@csvaa.it',
  sedi: [
    { nome: 'Alessandria', indirizzo: 'via Verona 1, angolo via Vochieri – 15121 Alessandria', telefono: '0131 250389', email: 'al@csvastialessandria.it' },
    { nome: 'Asti', indirizzo: 'via Brofferio 110 – 14100 Asti', telefono: '0141 321897', email: 'at@csvastialessandria.it' }
  ],
  numeroVerde: '800 158081',
  puntiFacilitazione: ['Alessandria', 'Valenza', 'Novi Ligure - URP', 'Novi Ligure - Biblioteca Civica'],
  orariFacilitazione: ['9.00', '9.30', '10.00', '10.30', '11.00', '11.30', '12.00', '12.30', '13.00', '13.30',
    '14.00', '14.30', '15.00', '15.30', '16.00', '16.30', '17.00', '17.30']
};
