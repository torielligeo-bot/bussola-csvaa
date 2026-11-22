// Legge il sito del CSVAA, aggiorna i dati dell'app e manda le notifiche.
// Si avvia con: node scraper/scrape.mjs  (Node 20 o superiore, nessuna libreria esterna)
//
// Variabili d'ambiente:
//   NTFY_TOPIC   nome del canale ntfy su cui arrivano le notifiche (se vuoto, niente notifiche)
//   NTFY_SERVER  server ntfy (predefinito https://ntfy.sh)
//   SITE_URL     indirizzo pubblico dell'app, usato come link nelle notifiche
//   SOLO_PROVA=1 legge e scrive i dati ma non manda notifiche

import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, giorniConEventi, eventoDelGiorno, notizie, bandi } from './parse.mjs';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARTELLA_APP = path.join(RADICE, 'docs');
const FILE_STATO = path.join(RADICE, 'state', 'stato.json');
// Il canale delle notifiche: dalla variabile d'ambiente oppure da docs/config.js (così si imposta in un posto solo)
let TOPIC = process.env.NTFY_TOPIC || '';
if (!TOPIC) {
  try {
    const cfg = await fs.readFile(path.join(RADICE, 'docs', 'config.js'), 'utf8');
    TOPIC = (cfg.match(/ntfyTopic:\s*'([^']+)'/) || [])[1] || '';
  } catch { /* nessuna configurazione */ }
}
const NTFY = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
const SITE_URL = process.env.SITE_URL || '';
const SOLO_PROVA = process.env.SOLO_PROVA === '1';
const MAX_NOTIFICHE = 8;

const attesa = ms => new Promise(r => setTimeout(r, ms));

async function scarica(percorso) {
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      const r = await fetch(BASE + percorso, {
        headers: { 'User-Agent': 'BussolaCSVAA/0.1 (prototipo app volontari; lettura oraria)' }
      });
      if (!r.ok) throw new Error(`${percorso}: HTTP ${r.status}`);
      await attesa(250); // un passo alla volta, per non pesare sul sito
      return new TextDecoder('windows-1252').decode(await r.arrayBuffer());
    } catch (e) {
      if (tentativo === 3) throw e;
      await attesa(2000 * tentativo);
    }
  }
}

// Data e ora attuali a Roma
function adessoRoma() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { oggi: `${p.year}-${p.month}-${p.day}`, ora: Number(p.hour) % 24, anno: Number(p.year), mese: Number(p.month) };
}

const giorniTra = (da, a) => Math.round((Date.parse(a) - Date.parse(da)) / 864e5);

function mesiDaLeggere(anno, mese) {
  // il mese scorso (per lo storico), quello corrente e i due successivi
  const out = [];
  for (let d = -1; d <= 2; d++) {
    const t = new Date(Date.UTC(anno, mese - 1 + d, 1));
    out.push([t.getUTCMonth() + 1, t.getUTCFullYear()]);
  }
  return out;
}

async function leggiSito() {
  const { anno, mese } = adessoRoma();
  const giorni = [];
  for (const [m, a] of mesiDaLeggere(anno, mese)) {
    giorni.push(...giorniConEventi(await scarica(`/index.asp?control=OK&mese=${m}&anno=${a}`)));
  }
  const eventi = [];
  for (const g of [...new Set(giorni)]) {
    const [a, m, d] = g.split('-').map(Number);
    try {
      eventi.push(...eventoDelGiorno(await scarica(`/news/calendario.asp?cc=ok&gg=${d}&mm=${m}&aa=${a}`), g));
    } catch (e) {
      console.warn('Giorno non letto', g, e.message);
    }
  }
  const news = [];
  for (const [percorso, zona] of [['/news/index.asp', ''], ['/news/alessandria.asp', 'Alessandria'], ['/news/asti.asp', 'Asti']]) {
    try {
      for (const n of notizie(await scarica(percorso), zona)) {
        const gia = news.find(x => x.id === n.id);
        if (gia) { if (zona && !gia.zona) gia.zona = zona; } else news.push(n);
      }
    } catch (e) {
      console.warn('Notizie non lette', percorso, e.message);
    }
  }
  let elencoBandi = [];
  try { elencoBandi = bandi(await scarica('/bandi/index.asp')); } catch (e) { console.warn('Bandi non letti', e.message); }

  eventi.sort((x, y) => (x.data + x.ora).localeCompare(y.data + y.ora));
  news.sort((x, y) => y.data.localeCompare(x.data));
  return { eventi, notizie: news.slice(0, 60), bandi: elencoBandi };
}

// ---------- Calendario .ics ----------

const icsTesto = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function piega(riga) {
  // le righe ICS non devono superare 75 byte
  const out = [];
  let resto = riga;
  while (Buffer.byteLength(resto) > 74) {
    let n = 74;
    while (Buffer.byteLength(resto.slice(0, n)) > 74) n--;
    out.push(resto.slice(0, n));
    resto = ' ' + resto.slice(n);
  }
  out.push(resto);
  return out.join('\r\n');
}
const dataIcs = d => d.replace(/-/g, '');
const uid = s => createHash('sha1').update(s).digest('hex') + '@bussola-csvaa';

function generaIcs(dati) {
  const ora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const r = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bussola CSVAA//prototipo//IT', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:CSVAA – Appuntamenti e scadenze', 'X-WR-TIMEZONE:Europe/Rome',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Rome',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE'
  ];
  for (const e of dati.eventi) {
    r.push('BEGIN:VEVENT', `UID:${uid(e.id)}`, `DTSTAMP:${ora}`);
    if (e.ora) {
      const [h, m] = e.ora.split(':').map(Number);
      const fine = `${String(Math.min(h + 2, 23)).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
      r.push(`DTSTART;TZID=Europe/Rome:${dataIcs(e.data)}T${e.ora.replace(':', '')}00`, `DTEND;TZID=Europe/Rome:${dataIcs(e.data)}T${fine}`);
    } else {
      const dopo = new Date(Date.parse(e.data) + 864e5).toISOString().slice(0, 10);
      r.push(`DTSTART;VALUE=DATE:${dataIcs(e.data)}`, `DTEND;VALUE=DATE:${dataIcs(dopo)}`);
    }
    r.push(`SUMMARY:${icsTesto(e.titolo)}`);
    if (e.luogo) r.push(`LOCATION:${icsTesto(e.luogo)}`);
    const desc = [e.descrizione, e.iscrizione ? `Iscrizioni: ${e.iscrizione}` : '', e.url].filter(Boolean).join('\n\n');
    r.push(`DESCRIPTION:${icsTesto(desc)}`);
    if (e.url) r.push(`URL:${e.url}`);
    r.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTesto(e.titolo)}`, 'TRIGGER:-PT2H', 'END:VALARM', 'END:VEVENT');
  }
  for (const b of dati.bandi.filter(b => b.scadenza)) {
    const dopo = new Date(Date.parse(b.scadenza) + 864e5).toISOString().slice(0, 10);
    r.push('BEGIN:VEVENT', `UID:${uid(b.id)}`, `DTSTAMP:${ora}`,
      `DTSTART;VALUE=DATE:${dataIcs(b.scadenza)}`, `DTEND;VALUE=DATE:${dataIcs(dopo)}`,
      `SUMMARY:${icsTesto('Scadenza bando: ' + b.titolo)}`,
      `DESCRIPTION:${icsTesto([b.sommario, b.url].join('\n\n'))}`, `URL:${b.url}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTesto('Scade tra 7 giorni: ' + b.titolo)}`, 'TRIGGER:-P7D', 'END:VALARM',
      'END:VEVENT');
  }
  r.push('END:VCALENDAR');
  return r.map(piega).join('\r\n') + '\r\n';
}

// ---------- Notifiche ----------

async function invia(n) {
  if (!TOPIC || SOLO_PROVA) {
    console.log('[notifica non inviata]', n.title, '-', n.message.slice(0, 80));
    return;
  }
  const corpo = { topic: TOPIC, title: n.title, message: n.message, tags: n.tags || [], priority: n.priority || 3 };
  if (n.click) corpo.click = n.click;
  if (n.actions) corpo.actions = n.actions;
  const r = await fetch(NTFY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  if (!r.ok) console.warn('ntfy ha risposto', r.status, await r.text());
  await attesa(400);
}

const dataLeggibile = d => new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' });
const linkApp = (sezione, id) => SITE_URL ? `${SITE_URL}#${sezione}${id ? '/' + encodeURIComponent(id) : ''}` : '';

function notificheDaInviare(dati, stato, { oggi, ora }) {
  const lista = [];
  const visti = new Set(stato.visti || []);
  const promemoria = new Set(stato.promemoria || []);

  for (const e of dati.eventi) {
    const chiave = 'ev:' + e.id;
    if (!visti.has(chiave) && e.data >= oggi) {
      lista.push({
        title: 'Nuovo appuntamento CSVAA',
        message: `${e.titolo}\n${dataLeggibile(e.data)}${e.ora ? ' ore ' + e.ora : ''}${e.luogo ? '\n' + e.luogo : ''}`,
        tags: ['date'], click: linkApp('evento', e.id) || e.url,
        actions: e.iscrizione ? [{ action: 'view', label: 'Iscriviti', url: e.iscrizione }] : undefined
      });
    }
    visti.add(chiave);
    // promemoria il giorno prima, dalle 17 in poi
    const chiaveP = 'pr:' + e.id;
    if (giorniTra(oggi, e.data) === 1 && ora >= 17 && !promemoria.has(chiaveP)) {
      lista.push({
        title: 'Domani: ' + e.titolo.slice(0, 80),
        message: `${e.ora ? 'Ore ' + e.ora : 'Tutto il giorno'}${e.luogo ? ' – ' + e.luogo : ''}`,
        tags: ['alarm_clock'], priority: 4, click: linkApp('evento', e.id) || e.url
      });
      promemoria.add(chiaveP);
    }
  }
  for (const b of dati.bandi) {
    const chiave = 'ba:' + b.id;
    if (!visti.has(chiave) && (!b.scadenza || b.scadenza >= oggi)) {
      lista.push({
        title: 'Nuovo bando',
        message: `${b.titolo}${b.scadenza ? '\nScadenza: ' + dataLeggibile(b.scadenza) : ''}`,
        tags: ['moneybag'], click: linkApp('bando', b.id) || b.url
      });
    }
    visti.add(chiave);
    if (b.scadenza) {
      const mancano = giorniTra(oggi, b.scadenza);
      for (const soglia of [7, 1]) {
        const chiaveP = `pr${soglia}:${b.id}`;
        if (mancano === soglia && ora >= 9 && !promemoria.has(chiaveP)) {
          lista.push({
            title: soglia === 1 ? 'Il bando scade domani' : 'Il bando scade tra 7 giorni',
            message: b.titolo, tags: ['hourglass'], priority: 4, click: linkApp('bando', b.id) || b.url
          });
          promemoria.add(chiaveP);
        }
      }
    }
  }
  for (const n of dati.notizie) {
    const chiave = 'nw:' + n.id;
    if (!visti.has(chiave) && giorniTra(n.data, oggi) <= 7) {
      lista.push({ title: 'Novità dal CSVAA', message: n.titolo, tags: ['newspaper'], priority: 2, click: linkApp('notizia', n.id) || n.url });
    }
    visti.add(chiave);
  }
  return { lista, visti: [...visti], promemoria: [...promemoria] };
}

// ---------- Avvio ----------

async function main() {
  const adesso = adessoRoma();
  let stato = {};
  try { stato = JSON.parse(await fs.readFile(FILE_STATO, 'utf8')); } catch { /* primo avvio */ }

  const dati = await leggiSito();
  if (!dati.eventi.length && !dati.notizie.length) throw new Error('Nessun dato letto: il sito potrebbe aver cambiato struttura');

  const uscita = { aggiornato: new Date().toISOString(), fonte: BASE, ...dati };
  await fs.mkdir(CARTELLA_APP, { recursive: true });
  await fs.writeFile(path.join(CARTELLA_APP, 'dati.json'), JSON.stringify(uscita, null, 1));
  await fs.writeFile(path.join(CARTELLA_APP, 'calendario.ics'), generaIcs(dati));

  const { lista, visti, promemoria } = notificheDaInviare(dati, stato, adesso);
  if (!stato.avviato) {
    // primo giro: registra quello che c'è già senza mandare decine di notifiche
    console.log(`Primo avvio: ${lista.length} elementi registrati senza notifica.`);
    await invia({ title: 'Bussola CSVAA attiva', message: `Da ora ricevi qui appuntamenti, bandi e novità del CSVAA. In calendario ci sono ${dati.eventi.length} appuntamenti.`, tags: ['white_check_mark'], click: SITE_URL || BASE });
  } else if (lista.length > MAX_NOTIFICHE) {
    for (const n of lista.slice(0, MAX_NOTIFICHE - 1)) await invia(n);
    await invia({ title: 'Altre novità dal CSVAA', message: `Ci sono altri ${lista.length - MAX_NOTIFICHE + 1} aggiornamenti. Apri l'app per vederli.`, click: SITE_URL || BASE });
  } else {
    for (const n of lista) await invia(n);
  }

  await fs.mkdir(path.dirname(FILE_STATO), { recursive: true });
  await fs.writeFile(FILE_STATO, JSON.stringify({ avviato: true, ultimoGiro: uscita.aggiornato, visti: visti.slice(-3000), promemoria: promemoria.slice(-3000) }, null, 1));
  console.log(`Fatto: ${dati.eventi.length} eventi, ${dati.notizie.length} notizie, ${dati.bandi.length} bandi, ${stato.avviato ? lista.length : 0} notifiche.`);
}

main().catch(e => { console.error(e); process.exit(1); });
