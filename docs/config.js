// Impostazioni dell'app. È l'unico file da modificare per collegare notifiche e accesso.
window.BUSSOLA_CONFIG = {
  // Canale ntfy su cui il lettore orario pubblica le notifiche (deve coincidere con NTFY_TOPIC su GitHub)
  ntfyServer: 'https://ntfy.sh',
  ntfyTopic: 'csvaa-bussola-ta7k2',

  // Accesso con Google ed email: incollare qui la configurazione del progetto Firebase
  // (console.firebase.google.com > Impostazioni progetto > Le tue app > Web).
  // Finché resta null, la registrazione vale solo su questo telefono.
  firebase: null,
  // firebase: {
  //   apiKey: '...',
  //   authDomain: 'bussola-csvaa.firebaseapp.com',
  //   projectId: 'bussola-csvaa',
  //   appId: '...'
  // },

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
