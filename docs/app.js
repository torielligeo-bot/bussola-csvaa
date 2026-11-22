/* Bussola CSVAA – prototipo di app per i volontari del CSV Asti e Alessandria */
(() => {
  'use strict';

  const CFG = window.BUSSOLA_CONFIG || {};
  const SITO = 'https://www.csvastialessandria.it';
  const vista = document.getElementById('vista');
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  let dati = { eventi: [], notizie: [], bandi: [], aggiornato: null };
  let utente = null; // utente Firebase, se configurato
  let auth = null;

  // ---------- utilità ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const oggiIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const giorniTra = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const dataLunga = iso => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dataBreve = iso => { const [a, m, g] = iso.split('-').map(Number); return `${g} ${MESI_BREVI[m - 1]} ${a}`; };
  const leggi = (k, d) => { try { return JSON.parse(localStorage.getItem('bussola:' + k)) ?? d; } catch { return d; } };
  const scrivi = (k, v) => { try { localStorage.setItem('bussola:' + k, JSON.stringify(v)); } catch { /* memoria piena o non disponibile */ } };
  const link = (url, testo, cls = 'bottone secondario') => url ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${testo}</a>` : '';
  const urlApp = () => location.href.split('#')[0].replace(/index\.html$/, '');

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('vis');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('vis'), 2600);
  }

  // ---------- profilo ----------
  function profilo() {
    const p = leggi('profilo', {});
    if (utente) {
      const [nome, ...cognome] = (utente.displayName || '').split(' ');
      return { nome: p.nome || nome || '', cognome: p.cognome || cognome.join(' '), email: utente.email || p.email || '', telefono: p.telefono || '', codiceFiscale: p.codiceFiscale || '', zona: p.zona || '', foto: utente.photoURL || '', account: 'firebase' };
    }
    return p;
  }
  const registrato = () => !!(utente || (profilo().email && profilo().nome));

  function aggiornaAvatar() {
    const a = document.getElementById('avatar');
    const p = profilo();
    if (p.foto) a.innerHTML = `<img src="${esc(p.foto)}" alt="">`;
    else a.textContent = registrato() ? (p.nome || '?').charAt(0).toUpperCase() : '?';
  }

  // ---------- Firebase (facoltativo) ----------
  function caricaScript(src) {
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  }
  async function avviaFirebase() {
    if (!CFG.firebase) return;
    try {
      const v = '10.12.2';
      await caricaScript(`https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js`);
      await caricaScript(`https://www.gstatic.com/firebasejs/${v}/firebase-auth-compat.js`);
      firebase.initializeApp(CFG.firebase);
      auth = firebase.auth();
      auth.languageCode = 'it';
      auth.onAuthStateChanged(u => { utente = u; aggiornaAvatar(); mostra(); });
      auth.getRedirectResult().catch(e => toast(erroreAuth(e)));
    } catch (e) {
      console.warn('Firebase non disponibile', e);
    }
  }
  function erroreAuth(e) {
    const m = {
      'auth/invalid-credential': 'Email o password non corrette.',
      'auth/wrong-password': 'Password non corretta.',
      'auth/user-not-found': 'Nessun account con questa email.',
      'auth/email-already-in-use': 'Questa email è già registrata: usa "Accedi".',
      'auth/weak-password': 'La password deve avere almeno 6 caratteri.',
      'auth/invalid-email': 'L\'indirizzo email non è valido.',
      'auth/popup-closed-by-user': 'Accesso annullato.',
      'auth/network-request-failed': 'Connessione assente.'
    };
    return m[e.code] || 'Accesso non riuscito: ' + (e.message || e.code);
  }

  // ---------- dati ----------
  async function caricaDati() {
    const cache = leggi('dati', null);
    if (cache) dati = cache;
    try {
      const r = await fetch('dati.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) { dati = await r.json(); scrivi('dati', dati); }
    } catch { if (!cache) toast('Sei offline: mostro gli ultimi dati salvati.'); }
  }
  const trovaEvento = id => dati.eventi.find(e => e.id === id);
  const trovaBando = id => dati.bandi.find(b => b.id === id);

  function novita() {
    const ultimaVisita = leggi('ultimaVisita', null);
    if (!ultimaVisita) return [];
    const viste = new Set(leggi('visti', []));
    return [
      ...dati.eventi.filter(e => !viste.has('ev:' + e.id) && e.data >= oggiIso()),
      ...dati.bandi.filter(b => !viste.has('ba:' + b.id) && (!b.scadenza || b.scadenza >= oggiIso()))
    ];
  }
  function segnaVisti() {
    scrivi('visti', [...dati.eventi.map(e => 'ev:' + e.id), ...dati.bandi.map(b => 'ba:' + b.id)]);
    scrivi('ultimaVisita', new Date().toISOString());
  }

  // ---------- componenti ----------
  function schedaEvento(e) {
    const [, m, g] = e.data.split('-').map(Number);
    const passato = e.data < oggiIso();
    const mancano = giorniTra(oggiIso(), e.data);
    const quando = passato ? '' : mancano === 0 ? '<span class="etichetta urgente">Oggi</span>' : mancano === 1 ? '<span class="etichetta presto">Domani</span>' : '';
    return `<a class="scheda scheda-evento${passato ? ' passato' : ''}" href="#evento/${encodeURIComponent(e.id)}">
      <div class="data-box"><div class="g">${g}</div><div class="m">${MESI_BREVI[m - 1]}</div></div>
      <div class="dett"><h3>${esc(e.titolo)}</h3>
        <div class="meta">${quando}${e.ora ? 'ore ' + esc(e.ora) : 'Orario sul sito'}</div>
        ${e.luogo ? `<div class="meta">${esc(e.luogo)}</div>` : ''}
      </div></a>`;
  }
  function statoBando(b) {
    if (!b.scadenza) return '<span class="etichetta">Scadenza nel testo</span>';
    const n = giorniTra(oggiIso(), b.scadenza);
    if (n < 0) return '<span class="etichetta chiuso">Chiuso</span>';
    if (n === 0) return '<span class="etichetta urgente">Scade oggi</span>';
    if (n <= 7) return `<span class="etichetta urgente">Scade tra ${n} giorni</span>`;
    if (n <= 30) return `<span class="etichetta presto">Scade tra ${n} giorni</span>`;
    return '<span class="etichetta ok">Aperto</span>';
  }
  function schedaBando(b) {
    return `<a class="scheda" href="#bando/${encodeURIComponent(b.id)}">
      <div>${statoBando(b)}</div>
      <h3 style="margin-top:6px">${esc(b.titolo)}</h3>
      <div class="meta">${b.scadenza ? 'Scadenza: ' + dataBreve(b.scadenza) : 'Pubblicato il ' + dataBreve(b.pubblicato)}</div></a>`;
  }
  function schedaNotizia(n) {
    return `<a class="scheda notizia" href="${esc(n.url)}" target="_blank" rel="noopener">
      ${n.immagine ? `<img src="${esc(n.immagine)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      <div class="dett"><div class="meta">${dataBreve(n.data)}${n.zona ? ' · ' + esc(n.zona) : ''}</div>
      <h3>${esc(n.titolo)}</h3><div class="meta">${esc(n.sommario)}</div></div></a>`;
  }
  const bandiAperti = () => dati.bandi.filter(b => !b.scadenza || b.scadenza >= oggiIso())
    .sort((a, b) => (a.scadenza || '9999').localeCompare(b.scadenza || '9999'));
  const prossimi = () => dati.eventi.filter(e => e.data >= oggiIso());

  // ---------- viste ----------
  function vHome() {
    const p = profilo();
    const nuovi = novita();
    const ev = prossimi();
    const ba = (bandiAperti().filter(b => b.scadenza).length ? bandiAperti().filter(b => b.scadenza) : bandiAperti()).slice(0, 3);
    const notifiche = leggi('notificheAttive', false);
    const agg = dati.aggiornato ? new Date(dati.aggiornato).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div class="saluto"><h1>${registrato() ? 'Ciao ' + esc(p.nome) : 'Benvenuto'}</h1>
        <p>${nuovi.length ? `<strong>${nuovi.length} novità</strong> dall'ultima visita` : 'Appuntamenti, formazione e bandi del CSVAA'}</p></div>
      ${!registrato() ? `<div class="richiamo"><strong>Registrati in un minuto</strong><p>Con il profilo puoi prenotare un appuntamento al Punto digitale facile senza riscrivere ogni volta i tuoi dati.</p><a class="bottone" href="#profilo">Registrati</a></div>`
        : !notifiche ? `<div class="richiamo"><strong>Ricevi le notifiche sul telefono</strong><p>Nuovi appuntamenti, promemoria il giorno prima e bandi in scadenza.</p><a class="bottone" href="#notifiche">Attiva le notifiche</a></div>` : ''}
      <div class="intestazione-sez"><h2>Prossimi appuntamenti</h2><a href="#calendario">Calendario</a></div>
      ${ev.length ? ev.slice(0, 4).map(schedaEvento).join('') : '<div class="scheda vuoto">Nessun appuntamento in programma nel calendario del CSVAA per ora.</div>'}
      <div class="intestazione-sez"><h2>Bandi aperti</h2><a href="#bandi">Tutti</a></div>
      ${ba.length ? ba.map(schedaBando).join('') : '<div class="scheda vuoto">Nessun bando con scadenza aperta.</div>'}
      <div class="intestazione-sez"><h2>Ultime notizie</h2><a href="#notizie">Tutte</a></div>
      ${dati.notizie.slice(0, 3).map(schedaNotizia).join('')}
      ${agg ? `<p class="nota" style="text-align:center">Dati aggiornati: ${agg}</p>` : ''}`;
  }

  let meseVisto = null;
  function vCalendario() {
    const oggi = oggiIso();
    if (!meseVisto) meseVisto = oggi.slice(0, 7);
    const [a, m] = meseVisto.split('-').map(Number);
    const primo = new Date(a, m - 1, 1);
    const giorni = new Date(a, m, 0).getDate();
    const vuoti = (primo.getDay() + 6) % 7;
    const evMese = dati.eventi.filter(e => e.data.startsWith(meseVisto));
    const scMese = dati.bandi.filter(b => b.scadenza && b.scadenza.startsWith(meseVisto));
    const conEv = new Set(evMese.map(e => e.data));
    const conSc = new Set(scMese.map(b => b.scadenza));
    let cel = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'].map(g => `<div class="gs">${g}</div>`).join('');
    cel += '<div></div>'.repeat(vuoti);
    for (let g = 1; g <= giorni; g++) {
      const iso = `${meseVisto}-${pad(g)}`;
      const cls = ['gg', iso === oggi && 'oggi', conEv.has(iso) && 'con-evento', conSc.has(iso) && 'con-scadenza'].filter(Boolean).join(' ');
      cel += (conEv.has(iso) || conSc.has(iso)) ? `<a class="${cls}" href="#giorno/${iso}">${g}</a>` : `<div class="${cls}">${g}</div>`;
    }
    const elenco = [
      ...evMese.map(e => ({ d: e.data + (e.ora || '99'), h: schedaEvento(e) })),
      ...scMese.map(b => ({ d: b.scadenza + '99', h: schedaBando(b) }))
    ].sort((x, y) => x.d.localeCompare(y.d)).map(x => x.h).join('');
    return `
      <div class="mese-nav"><button id="mesePrima" aria-label="Mese precedente">‹</button><h1>${MESI[m - 1]} ${a}</h1><button id="meseDopo" aria-label="Mese successivo">›</button></div>
      <div class="griglia">${cel}</div>
      <div class="legenda"><span>Appuntamento</span><span class="sc">Scadenza bando</span></div>
      <div class="azioni"><a class="bottone leggero" href="#notifiche">Aggiungi al calendario del telefono</a></div>
      ${elenco || '<div class="scheda vuoto">Nessun appuntamento in questo mese.</div>'}`;
  }
  function dopoCalendario() {
    const sposta = d => { const [a, m] = meseVisto.split('-').map(Number); const t = new Date(a, m - 1 + d, 1); meseVisto = `${t.getFullYear()}-${pad(t.getMonth() + 1)}`; mostra(); };
    document.getElementById('mesePrima').onclick = () => sposta(-1);
    document.getElementById('meseDopo').onclick = () => sposta(1);
  }
  function vGiorno(iso) {
    const ev = dati.eventi.filter(e => e.data === iso);
    const sc = dati.bandi.filter(b => b.scadenza === iso);
    return `<a class="indietro" href="#calendario">‹ Calendario</a><h1 style="text-transform:capitalize">${dataLunga(iso)}</h1>
      ${ev.map(schedaEvento).join('')}${sc.map(schedaBando).join('')}`;
  }

  function vEvento(id) {
    const e = trovaEvento(id);
    if (!e) return `<a class="indietro" href="#calendario">‹ Calendario</a><div class="scheda vuoto">Appuntamento non trovato. Forse il CSVAA l'ha tolto dal calendario.</div>`;
    const salvati = leggi('salvati', []);
    const salvato = salvati.includes(e.id);
    return `<div class="dettaglio"><a class="indietro" href="#calendario">‹ Calendario</a>
      <h1>${esc(e.titolo)}</h1>
      <div class="riquadro-info">
        <div><strong style="text-transform:capitalize">${dataLunga(e.data)}</strong></div>
        <div>${e.ora ? 'Ore ' + esc(e.ora) : 'Orario indicato nella pagina del CSVAA'}</div>
        ${e.luogo ? `<div>${esc(e.luogo)}</div>` : ''}
      </div>
      <div class="azioni">
        ${e.iscrizione ? link(e.iscrizione, 'Iscriviti', 'bottone') : ''}
        <button class="bottone secondario" id="icsEvento">Aggiungi al mio calendario</button>
        <button class="bottone leggero" id="salvaEvento">${salvato ? '★ Salvato' : '☆ Salva'}</button>
      </div>
      <p class="descr">${esc(e.descrizione)}${e.descrizione.length >= 690 ? '…' : ''}</p>
      <div class="azioni">${link(e.url, 'Leggi tutto sul sito del CSVAA')}${e.allegati.map(a => link(a.url, esc(a.nome))).join('')}</div>
    </div>`;
  }
  function dopoEvento(id) {
    const e = trovaEvento(id);
    if (!e) return;
    document.getElementById('icsEvento').onclick = () => scaricaIcs(e.titolo, [{ uid: e.id, data: e.data, ora: e.ora, titolo: e.titolo, luogo: e.luogo, descrizione: [e.iscrizione && 'Iscrizioni: ' + e.iscrizione, e.url].filter(Boolean).join('\n') }]);
    document.getElementById('salvaEvento').onclick = () => {
      const s = new Set(leggi('salvati', []));
      s.has(e.id) ? s.delete(e.id) : s.add(e.id);
      scrivi('salvati', [...s]); mostra(); toast(s.has(e.id) ? 'Salvato tra i tuoi appuntamenti' : 'Tolto dai salvati');
    };
  }

  function vBando(id) {
    const b = trovaBando(id);
    if (!b) return `<a class="indietro" href="#bandi">‹ Bandi</a><div class="scheda vuoto">Bando non trovato.</div>`;
    return `<div class="dettaglio"><a class="indietro" href="#bandi">‹ Bandi</a>
      <div>${statoBando(b)}</div><h1 style="margin-top:8px">${esc(b.titolo)}</h1>
      <div class="riquadro-info"><div>Pubblicato il ${dataBreve(b.pubblicato)}</div>${b.scadenza ? `<div><strong>Scadenza: ${dataLunga(b.scadenza)}</strong></div>` : ''}</div>
      <p class="descr">${esc(b.sommario.replace(/\.{3}$/, '…'))}</p>
      <div class="azioni">${link(b.url, 'Leggi il bando sul sito', 'bottone')}${b.scadenza && b.scadenza >= oggiIso() ? '<button class="bottone secondario" id="icsBando">Metti la scadenza in calendario</button>' : ''}</div>
    </div>`;
  }
  function dopoBando(id) {
    const b = trovaBando(id);
    const btn = document.getElementById('icsBando');
    if (b && btn) btn.onclick = () => scaricaIcs('Scadenza bando', [{ uid: b.id, data: b.scadenza, titolo: 'Scadenza bando: ' + b.titolo, descrizione: b.url, avvisoGiorni: 7 }]);
  }

  let filtroNotizie = 'tutte';
  function vNotizie() {
    const zone = ['tutte', 'Alessandria', 'Asti'];
    const lista = dati.notizie.filter(n => filtroNotizie === 'tutte' || n.zona === filtroNotizie);
    return `<h1>Notizie</h1>
      <div class="filtri">${zone.map(z => `<button data-z="${z}" class="${z === filtroNotizie ? 'on' : ''}">${z === 'tutte' ? 'Tutte' : z}</button>`).join('')}</div>
      ${lista.map(schedaNotizia).join('') || '<div class="scheda vuoto">Nessuna notizia per questa zona.</div>'}`;
  }
  function dopoNotizie() {
    vista.querySelectorAll('.filtri button').forEach(b => b.onclick = () => { filtroNotizie = b.dataset.z; mostra(); });
  }

  function vBandi() {
    const aperti = bandiAperti();
    const chiusi = dati.bandi.filter(b => b.scadenza && b.scadenza < oggiIso());
    return `<h1>Bandi e contributi</h1>
      <p class="nota">Ti avvisiamo 7 giorni e 1 giorno prima di ogni scadenza.</p>
      ${aperti.map(schedaBando).join('') || '<div class="scheda vuoto">Nessun bando aperto in questo momento.</div>'}
      ${chiusi.length ? `<h2>Chiusi di recente</h2>${chiusi.slice(0, 6).map(schedaBando).join('')}` : ''}`;
  }

  function vServizi() {
    const sedi = (CFG.sedi || []).map(s => `<div class="scheda"><h3>Sede di ${esc(s.nome)}</h3><div class="meta">${esc(s.indirizzo)}</div>
      <div class="azioni"><a class="bottone leggero" href="tel:${esc(s.telefono.replace(/\s/g, ''))}">Chiama ${esc(s.telefono)}</a><a class="bottone leggero" href="mailto:${esc(s.email)}">Scrivi</a></div></div>`).join('');
    const voce = (href, ico, titolo, testo, esterno) => `<a class="scheda servizio" href="${href}"${esterno ? ' target="_blank" rel="noopener"' : ''}><div class="ico">${ico}</div><div><h3 style="margin:0">${titolo}</h3><div class="meta">${testo}</div></div></a>`;
    return `<h1>Servizi</h1>
      ${voce('#prenota', '🖥', 'Prenota il Punto digitale facile', 'Appuntamento con un facilitatore digitale (SPID, fascicolo sanitario, servizi online)')}
      ${voce('#appuntamenti', '📋', 'I miei appuntamenti', 'Richieste inviate ed eventi salvati')}
      ${voce('#notifiche', '🔔', 'Notifiche e calendario', 'Ricevi gli avvisi sul telefono')}
      ${voce('https://my.csvastialessandria.it/Frontend/Formazione.aspx', '🎓', 'Iscrizione ai corsi (MyCSVAA)', 'Area riservata del CSVAA per la formazione', true)}
      ${voce(SITO + '/newsletter/iscrizione.asp', '✉', 'Newsletter del CSVAA', 'Iscriviti dal sito', true)}
      ${voce(SITO + '/servizi/modulistica.asp', '📄', 'Modulistica', 'Moduli e fac-simile sul sito', true)}
      ${voce(SITO + '/focus/fiscale.asp', '⚖', 'Area fiscale e legale', 'Approfondimenti per gli ETS', true)}
      <h2>Contatti</h2>${sedi}
      <p class="nota">Numero verde ${esc(CFG.numeroVerde || '')}</p>`;
  }

  function vPrenota() {
    const p = profilo();
    const bozza = leggi('bozzaPrenotazione', {});
    const minimo = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    return `<a class="indietro" href="#servizi">‹ Servizi</a><h1>Punto digitale facile</h1>
      <p>Chiedi un appuntamento con un facilitatore digitale del CSVAA. Scegli giorno e ora negli orari di apertura dello sportello.</p>
      ${!registrato() ? '<div class="richiamo"><strong>Prima registrati</strong><p>Così l\'app compila da sola nome, telefono ed email.</p><a class="bottone" href="#profilo">Registrati</a></div>' : ''}
      <form id="formPrenota">
        <div class="due"><div class="campo"><label for="pNome">Nome</label><input id="pNome" required value="${esc(p.nome)}" autocomplete="given-name"></div>
        <div class="campo"><label for="pCognome">Cognome</label><input id="pCognome" required value="${esc(p.cognome)}" autocomplete="family-name"></div></div>
        <div class="due"><div class="campo"><label for="pTel">Telefono</label><input id="pTel" type="tel" required value="${esc(p.telefono)}" autocomplete="tel"></div>
        <div class="campo"><label for="pMail">Email</label><input id="pMail" type="email" required value="${esc(p.email)}" autocomplete="email"></div></div>
        <div class="campo"><label for="pCf">Codice fiscale</label><input id="pCf" value="${esc(p.codiceFiscale)}" maxlength="16" style="text-transform:uppercase" autocomplete="off">
          <div class="nota">Lo chiede il modulo del CSVAA. Resta salvato solo su questo telefono.</div></div>
        <div class="campo"><label for="pPunto">Punto di facilitazione</label><select id="pPunto" required><option value="">Scegli…</option>
          ${(CFG.puntiFacilitazione || []).map(x => `<option${bozza.punto === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="due"><div class="campo"><label for="pData">Giorno</label><input id="pData" type="date" required min="${minimo}" value="${esc(bozza.data || '')}"></div>
        <div class="campo"><label for="pOra">Orario</label><select id="pOra" required><option value="">Scegli…</option>
          ${(CFG.orariFacilitazione || []).map(x => `<option${bozza.ora === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div></div>
        <div class="campo"><label for="pMotivo">Per cosa ti serve aiuto?</label><textarea id="pMotivo" rows="3" placeholder="Per esempio: attivare lo SPID, scaricare un referto dal fascicolo sanitario">${esc(bozza.motivo || '')}</textarea></div>
        <div class="campo"><label class="spunta"><input type="checkbox" id="pPrivacy" required> <span>Ho letto l'<a href="${SITO}/profilo/privacy.asp" target="_blank" rel="noopener">informativa privacy del CSVAA</a></span></label></div>
        <button class="bottone largo" type="submit">Invia la richiesta via email</button>
        <p class="nota">Si apre la tua app di posta con il messaggio già scritto per ${esc(CFG.emailFacilitazione)}. Premi Invia: il CSVAA ti risponde per confermare.</p>
        <div class="separatore">oppure</div>
        <a class="bottone secondario largo" href="${SITO}/facilitazione-digitale/index.asp#contatti" target="_blank" rel="noopener">Compila il modulo sul sito</a>
      </form>`;
  }
  function dopoPrenota() {
    const f = document.getElementById('formPrenota');
    const salvaBozza = () => scrivi('bozzaPrenotazione', { punto: f.pPunto.value, data: f.pData.value, ora: f.pOra.value, motivo: f.pMotivo.value });
    f.addEventListener('change', salvaBozza);
    f.onsubmit = ev => {
      ev.preventDefault();
      const d = {
        nome: f.pNome.value.trim(), cognome: f.pCognome.value.trim(), telefono: f.pTel.value.trim(), email: f.pMail.value.trim(),
        codiceFiscale: f.pCf.value.trim().toUpperCase(), punto: f.pPunto.value, data: f.pData.value, ora: f.pOra.value, motivo: f.pMotivo.value.trim()
      };
      const giornoSett = new Date(d.data + 'T12:00:00').getDay();
      if (giornoSett === 0) { toast('La domenica lo sportello è chiuso: scegli un altro giorno.'); return; }
      // aggiorna il profilo con i dati appena scritti
      scrivi('profilo', { ...leggi('profilo', {}), nome: d.nome, cognome: d.cognome, telefono: d.telefono, email: d.email, codiceFiscale: d.codiceFiscale });
      const oggetto = `Richiesta appuntamento facilitazione digitale – ${d.punto}, ${dataBreve(d.data)} ore ${d.ora}`;
      const corpo = [
        'Buongiorno,',
        '',
        `vorrei prenotare un appuntamento con un facilitatore digitale presso il punto di ${d.punto}, il giorno ${dataLunga(d.data)} alle ore ${d.ora}.`,
        d.motivo ? `\nMi serve aiuto per: ${d.motivo}` : '',
        '',
        `Nome e cognome: ${d.nome} ${d.cognome}`,
        `Telefono: ${d.telefono}`,
        `Email: ${d.email}`,
        d.codiceFiscale ? `Codice fiscale: ${d.codiceFiscale}` : '',
        '',
        'Ho preso visione dell\'informativa sul trattamento dei dati del CSVAA.',
        'Resto in attesa di conferma, grazie.',
        '',
        `${d.nome} ${d.cognome}`,
        '',
        '(richiesta inviata dall\'app Bussola, prototipo)'
      ].filter(r => r !== null).join('\n');
      const app = leggi('appuntamenti', []);
      app.unshift({ id: 'pr-' + Date.now(), tipo: 'facilitazione', punto: d.punto, data: d.data, ora: d.ora, motivo: d.motivo, stato: 'Richiesta inviata, in attesa di conferma', creato: new Date().toISOString() });
      scrivi('appuntamenti', app);
      scrivi('bozzaPrenotazione', {});
      location.href = `mailto:${CFG.emailFacilitazione}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`;
      setTimeout(() => { location.hash = '#appuntamenti'; toast('Richiesta preparata. Ricordati di premere Invia nella posta.'); }, 800);
    };
  }

  function vAppuntamenti() {
    const app = leggi('appuntamenti', []);
    const salvati = leggi('salvati', []).map(trovaEvento).filter(Boolean);
    return `<a class="indietro" href="#servizi">‹ Servizi</a><h1>I miei appuntamenti</h1>
      <h2>Prenotazioni</h2>
      ${app.length ? app.map(a => `<div class="scheda"><div><span class="etichetta presto">${esc(a.stato)}</span></div>
          <h3 style="margin-top:6px">Punto digitale facile – ${esc(a.punto)}</h3>
          <div class="meta" style="text-transform:capitalize">${dataLunga(a.data)}, ore ${esc(a.ora)}</div>
          ${a.motivo ? `<div class="meta">${esc(a.motivo)}</div>` : ''}
          <div class="azioni"><button class="bottone leggero" data-ics="${esc(a.id)}">Aggiungi al calendario</button>
          <button class="bottone leggero" data-conf="${esc(a.id)}">${a.stato.startsWith('Confermato') ? 'Annulla conferma' : 'Il CSVAA ha confermato'}</button>
          <button class="bottone leggero" data-del="${esc(a.id)}">Elimina</button></div></div>`).join('')
        : '<div class="scheda vuoto">Nessuna prenotazione. <a href="#prenota">Prenota il Punto digitale facile</a></div>'}
      <h2>Eventi salvati</h2>
      ${salvati.length ? salvati.map(schedaEvento).join('') : '<div class="scheda vuoto">Apri un appuntamento del calendario e premi ☆ Salva.</div>'}`;
  }
  function dopoAppuntamenti() {
    const app = leggi('appuntamenti', []);
    vista.querySelectorAll('[data-ics]').forEach(b => b.onclick = () => {
      const a = app.find(x => x.id === b.dataset.ics);
      scaricaIcs('Appuntamento CSVAA', [{ uid: a.id, data: a.data, ora: a.ora.replace('.', ':').padStart(5, '0'), durataMin: 30, titolo: 'Punto digitale facile CSVAA – ' + a.punto, luogo: a.punto, descrizione: a.motivo || '' }]);
    });
    vista.querySelectorAll('[data-conf]').forEach(b => b.onclick = () => {
      const a = app.find(x => x.id === b.dataset.conf);
      a.stato = a.stato.startsWith('Confermato') ? 'Richiesta inviata, in attesa di conferma' : 'Confermato dal CSVAA';
      scrivi('appuntamenti', app); mostra();
    });
    vista.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (!confirm('Eliminare questa prenotazione dall\'app? Se il CSVAA l\'ha già confermata, avvisali per disdire.')) return;
      scrivi('appuntamenti', app.filter(x => x.id !== b.dataset.del)); mostra();
    });
  }

  function vNotifiche() {
    const t = CFG.ntfyTopic;
    const server = (CFG.ntfyServer || 'https://ntfy.sh').replace(/\/$/, '');
    const host = server.replace(/^https?:\/\//, '');
    const ics = new URL('calendario.ics', urlApp()).href;
    const webcal = ics.replace(/^https?:/, 'webcal:');
    return `<a class="indietro" href="#servizi">‹ Servizi</a><h1>Notifiche e calendario</h1>
      <h2>Notifiche sul telefono</h2>
      <p>Le notifiche arrivano tramite <strong>ntfy</strong>, un'app gratuita e senza pubblicità. Non serve creare un account.</p>
      <ol class="passi">
        <li><strong>Installa ntfy</strong><div class="azioni">
          <a class="bottone leggero" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android</a>
          <a class="bottone leggero" href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone</a></div></li>
        <li><strong>Iscriviti al canale del CSVAA</strong>
          <div class="azioni"><a class="bottone" href="ntfy://${esc(host)}/${esc(t)}">Iscriviti nell'app ntfy</a></div>
          <div class="nota">Se il tasto non funziona, in ntfy premi + e scrivi il nome del canale: <span class="codice">${esc(t)}</span> <button class="bottone leggero" id="copiaTopic" style="min-height:32px;padding:4px 10px">Copia</button></div></li>
        <li><strong>Fatto</strong>. Riceverai i nuovi appuntamenti, un promemoria la sera prima e gli avvisi sui bandi in scadenza.
          <div class="azioni"><button class="bottone secondario" id="notificheOk">${leggi('notificheAttive', false) ? '✓ Notifiche attive' : 'Ho attivato le notifiche'}</button></div></li>
      </ol>
      <p class="nota">Dal computer puoi anche aprire il canale nel browser: ${link(`${server}/${t}`, 'apri il canale', '')}.</p>
      <h2>Calendario del telefono</h2>
      <p>Aggiungi il calendario del CSVAA: appuntamenti e scadenze dei bandi compaiono insieme ai tuoi impegni e si aggiornano da soli.</p>
      <div class="azioni">
        <a class="bottone" href="${esc(webcal)}">iPhone / Outlook</a>
        <a class="bottone secondario" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">Google Calendar</a>
      </div>
      <p class="nota">Indirizzo del calendario: <span class="codice">${esc(ics)}</span></p>`;
  }
  function dopoNotifiche() {
    document.getElementById('copiaTopic').onclick = async () => { try { await navigator.clipboard.writeText(CFG.ntfyTopic); toast('Nome del canale copiato'); } catch { toast(CFG.ntfyTopic); } };
    document.getElementById('notificheOk').onclick = () => { scrivi('notificheAttive', true); toast('Perfetto, ti terremo aggiornato'); mostra(); };
  }

  function vProfilo() {
    const p = profilo();
    if (utente) {
      return `<h1>Il mio profilo</h1>
        <div class="scheda"><strong>${esc(utente.displayName || p.nome || '')}</strong><div class="meta">${esc(utente.email || '')}</div>
        <div class="meta">Accesso con ${utente.providerData[0]?.providerId === 'google.com' ? 'Google' : 'email'}</div></div>
        ${formDati(p)}
        <button class="bottone secondario largo" id="esci">Esci</button>`;
    }
    const conFirebase = !!CFG.firebase;
    return `<h1>${registrato() ? 'Il mio profilo' : 'Registrati'}</h1>
      ${conFirebase ? `
        <button class="bottone google largo" id="accediGoogle"><svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>Continua con Google</button>
        <div class="separatore">oppure con email</div>
        <form id="formAccesso">
          <div class="campo"><label for="aMail">Email</label><input id="aMail" type="email" required autocomplete="email"></div>
          <div class="campo"><label for="aPass">Password</label><input id="aPass" type="password" required minlength="6" autocomplete="current-password"></div>
          <div class="azioni"><button class="bottone" type="submit" data-azione="accedi">Accedi</button><button class="bottone secondario" type="submit" data-azione="registra">Crea account</button></div>
          <a href="#" id="passDimenticata" class="nota">Password dimenticata?</a>
        </form>` : `
        <p class="nota">In questa versione di prova il profilo resta salvato su questo telefono. L'accesso con Google si attiva collegando l'app a Firebase (vedi README).</p>
        ${formDati(p)}`}
      ${registrato() && !conFirebase ? '<button class="bottone secondario largo" id="cancellaProfilo">Cancella i miei dati da questo telefono</button>' : ''}`;
  }
  function formDati(p) {
    return `<form id="formProfilo" style="margin-top:14px">
      <div class="due"><div class="campo"><label for="fNome">Nome</label><input id="fNome" required value="${esc(p.nome)}" autocomplete="given-name"></div>
      <div class="campo"><label for="fCognome">Cognome</label><input id="fCognome" value="${esc(p.cognome)}" autocomplete="family-name"></div></div>
      <div class="campo"><label for="fMail">Email</label><input id="fMail" type="email" required value="${esc(p.email)}" autocomplete="email" ${utente ? 'readonly' : ''}></div>
      <div class="campo"><label for="fTel">Telefono</label><input id="fTel" type="tel" value="${esc(p.telefono)}" autocomplete="tel"></div>
      <div class="campo"><label for="fZona">Zona</label><select id="fZona"><option value="">Asti e Alessandria</option>
        <option${p.zona === 'Alessandria' ? ' selected' : ''}>Alessandria</option><option${p.zona === 'Asti' ? ' selected' : ''}>Asti</option></select></div>
      <button class="bottone largo" type="submit">${registrato() ? 'Salva' : 'Registrati'}</button></form>`;
  }
  function dopoProfilo() {
    const fp = document.getElementById('formProfilo');
    if (fp) fp.onsubmit = ev => {
      ev.preventDefault();
      const prima = registrato();
      scrivi('profilo', { ...leggi('profilo', {}), nome: fp.fNome.value.trim(), cognome: fp.fCognome.value.trim(), email: fp.fMail.value.trim(), telefono: fp.fTel.value.trim(), zona: fp.fZona.value });
      if (fp.fZona.value) filtroNotizie = fp.fZona.value;
      aggiornaAvatar(); toast(prima ? 'Dati salvati' : 'Registrazione completata');
      location.hash = prima ? '#home' : '#notifiche';
    };
    const g = document.getElementById('accediGoogle');
    if (g) g.onclick = async () => {
      const prov = new firebase.auth.GoogleAuthProvider();
      try {
        if (/iPhone|iPad|Android/i.test(navigator.userAgent)) await auth.signInWithRedirect(prov);
        else await auth.signInWithPopup(prov);
      } catch (e) { toast(erroreAuth(e)); }
    };
    const fa = document.getElementById('formAccesso');
    if (fa) {
      let azione = 'accedi';
      fa.querySelectorAll('[data-azione]').forEach(b => b.onclick = () => { azione = b.dataset.azione; });
      fa.onsubmit = async ev => {
        ev.preventDefault();
        try {
          if (azione === 'registra') { await auth.createUserWithEmailAndPassword(fa.aMail.value, fa.aPass.value); toast('Account creato'); }
          else await auth.signInWithEmailAndPassword(fa.aMail.value, fa.aPass.value);
          location.hash = '#home';
        } catch (e) { toast(erroreAuth(e)); }
      };
      document.getElementById('passDimenticata').onclick = async ev => {
        ev.preventDefault();
        if (!fa.aMail.value) { toast('Scrivi prima la tua email'); return; }
        try { await auth.sendPasswordResetEmail(fa.aMail.value); toast('Ti abbiamo mandato un\'email per reimpostare la password'); } catch (e) { toast(erroreAuth(e)); }
      };
    }
    const esci = document.getElementById('esci');
    if (esci) esci.onclick = () => auth.signOut().then(() => { location.hash = '#home'; });
    const canc = document.getElementById('cancellaProfilo');
    if (canc) canc.onclick = () => {
      if (!confirm('Cancellare profilo, prenotazioni ed eventi salvati da questo telefono?')) return;
      ['profilo', 'appuntamenti', 'salvati', 'bozzaPrenotazione', 'notificheAttive'].forEach(k => localStorage.removeItem('bussola:' + k));
      aggiornaAvatar(); location.hash = '#home'; mostra();
    };
  }

  // ---------- file .ics da scaricare ----------
  function scaricaIcs(nome, voci) {
    const e = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const r = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bussola CSVAA//IT'];
    for (const v of voci) {
      r.push('BEGIN:VEVENT', `UID:${btoa(unescape(encodeURIComponent(v.uid))).replace(/[^a-z0-9]/gi, '').slice(0, 40)}@bussola-csvaa`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`);
      const d = v.data.replace(/-/g, '');
      if (v.ora) {
        const [h, m] = v.ora.split(':').map(Number);
        const fine = new Date(2000, 0, 1, h, m + (v.durataMin || 120));
        r.push(`DTSTART:${d}T${pad(h)}${pad(m)}00`, `DTEND:${d}T${pad(fine.getHours())}${pad(fine.getMinutes())}00`);
      } else {
        const dopo = new Date(Date.parse(v.data) + 864e5).toISOString().slice(0, 10).replace(/-/g, '');
        r.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${dopo}`);
      }
      r.push(`SUMMARY:${e(v.titolo)}`);
      if (v.luogo) r.push(`LOCATION:${e(v.luogo)}`);
      if (v.descrizione) r.push(`DESCRIPTION:${e(v.descrizione)}`);
      r.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(v.titolo)}`, `TRIGGER:${v.avvisoGiorni ? '-P' + v.avvisoGiorni + 'D' : '-PT2H'}`, 'END:VALARM', 'END:VEVENT');
    }
    r.push('END:VCALENDAR');
    const blob = new Blob([r.join('\r\n')], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome.replace(/[^\w\- ]+/g, '').slice(0, 40) + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Apri il file scaricato per aggiungerlo al calendario');
  }

  // ---------- navigazione ----------
  const VISTE = {
    home: [vHome], calendario: [vCalendario, dopoCalendario], notizie: [vNotizie, dopoNotizie], bandi: [vBandi],
    servizi: [vServizi], prenota: [vPrenota, dopoPrenota], appuntamenti: [vAppuntamenti, dopoAppuntamenti],
    notifiche: [vNotifiche, dopoNotifiche], profilo: [vProfilo, dopoProfilo],
    evento: [vEvento, dopoEvento], bando: [vBando, dopoBando], giorno: [vGiorno]
  };
  const SEZ_BARRA = { evento: 'calendario', giorno: 'calendario', bando: 'bandi', prenota: 'servizi', appuntamenti: 'servizi', notifiche: 'servizi' };

  function mostra() {
    const [sez, ...resto] = (location.hash.slice(1) || 'home').split('/');
    const param = decodeURIComponent(resto.join('/'));
    const [disegna, dopo] = VISTE[sez] || VISTE.home;
    vista.innerHTML = disegna(param);
    if (dopo) dopo(param);
    const attiva = SEZ_BARRA[sez] || sez;
    document.querySelectorAll('.barra a').forEach(a => a.classList.toggle('attiva', a.dataset.sez === attiva));
  }
  window.addEventListener('hashchange', () => { mostra(); window.scrollTo(0, 0); });

  // ---------- avvio ----------
  async function avvio() {
    const z = profilo().zona; if (z) filtroNotizie = z;
    aggiornaAvatar();
    mostra();
    await caricaDati();
    mostra();
    // dopo qualche secondo le novità risultano "viste"
    setTimeout(segnaVisti, 4000);
    avviaFirebase();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    // ricarica i dati quando si torna sull'app
    document.addEventListener('visibilitychange', async () => { if (!document.hidden) { await caricaDati(); mostra(); } });
  }
  avvio();
})();
