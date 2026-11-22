// Funzioni di lettura delle pagine del sito csvastialessandria.it
// Sono pure (ricevono HTML, restituiscono dati) così si possono provare anche nel browser.

export const BASE = 'https://www.csvastialessandria.it';

const ENT = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  agrave: 'à', aacute: 'á', egrave: 'è', eacute: 'é', igrave: 'ì', iacute: 'í',
  ograve: 'ò', oacute: 'ó', ugrave: 'ù', uacute: 'ú', Agrave: 'À', Egrave: 'È',
  Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù', ccedil: 'ç',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  ndash: '–', mdash: '—', hellip: '…', euro: '€', deg: '°', middot: '·', bull: '•'
};

export function decodifica(s = '') {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e] ?? m;
  });
}

export function testo(html = '') {
  return decodifica(
    html
      .replace(/\r/g, '')
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h\d>|<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n[\s\n]*/g, '\n')
    .trim();
}

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=\\s*"([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? decodifica(m[1]).replace(/\s+/g, ' ').trim() : '';
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const pad = n => String(n).padStart(2, '0');

// Pagina home con il calendario del mese: restituisce le date (AAAA-MM-GG) che hanno eventi
export function giorniConEventi(html) {
  const re = /calendario\.asp\?cc=ok&(?:amp;)?gg=(\d+)&(?:amp;)?mm=(\d+)&(?:amp;)?aa=(\d+)/gi;
  const date = [...html.matchAll(re)].map(m => `${m[3]}-${pad(m[2])}-${pad(m[1])}`);
  return [...new Set(date)].sort();
}

function assoluto(u) {
  if (!u) return '';
  if (/^https?:\/\/(www\.)?csvastialessandria\.it/i.test(u)) return u.replace(/^https?:\/\/(www\.)?/i, 'https://www.');
  if (/^https?:\/\//i.test(u)) return u;
  if (/^(www\.)?csvastialessandria\.it/i.test(u)) return 'https://www.' + u.replace(/^\/+/, '').replace(/^www\./i, '');
  return BASE + (u.startsWith('/') ? u : '/' + u);
}

function corpoArticolo(html) {
  const i = html.search(/NEWSLETTER CSVAA/);
  const j = html.search(/Versione stampabile|Torna indietro/);
  const pezzo = html.slice(i > 0 ? i : 0, j > i ? j : undefined);
  return pezzo;
}

// Cerca l'orario dell'evento: prima nella riga che cita quel giorno, poi nel testo intero
function orario(testoCorpo, data) {
  const [, mm, gg] = data.split('-').map(Number);
  const reOra = /\b(?:ore|alle|dalle)\s+(\d{1,2})(?:[.:,](\d{2}))?(?![\d/])/i;
  const righe = testoCorpo.split('\n');
  const reGiorno = new RegExp(`\\b${gg}\\s+${MESI[mm - 1]}`, 'i');
  for (const r of righe) {
    if (reGiorno.test(r)) {
      const m = r.match(reOra);
      if (m) return `${pad(m[1])}:${m[2] || '00'}`;
    }
  }
  const m = testoCorpo.match(reOra);
  return m && Number(m[1]) < 24 ? `${pad(m[1])}:${m[2] || '00'}` : '';
}

// Luogo: cerca nelle righe che citano quel giorno (città in maiuscolo, riga "c/o ...", "ad Alessandria nei locali...")
function luogo(testoCorpo, data) {
  const [, mm, gg] = data.split('-').map(Number);
  const righe = testoCorpo.split('\n');
  const reGiorno = new RegExp(`\\b${gg}\\s+${MESI[mm - 1]}`, 'i');
  const reSede = /^(c\/o|presso|in via|via|piazza|sede|su piattaforma|online|sala)/i;
  for (let k = 0; k < righe.length; k++) {
    if (!reGiorno.test(righe[k])) continue;
    const citta = righe[k].match(/^([A-ZÀ-Ù' ]{3,}):/);
    const dopo = righe[k + 1] || '';
    const sede = reSede.test(dopo) ? dopo : '';
    if (citta || sede) return [citta ? citta[1].trim() : '', sede].filter(Boolean).join(' – ');
    const frase = righe[k].match(/\b(?:ad?|presso)\s+([A-Z][^,.;]*?(?:\bvia\b[^.;]*?\d+[a-z]?)?)(?=[.;]|$)/);
    if (frase && frase[1].length < 140) return frase[1].replace(/\s+nei locali di\s+/i, ', ').trim();
  }
  return '';
}

// Pagina di un giorno del calendario
export function eventoDelGiorno(html, data) {
  const titolo = testo((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '') || meta(html, 'og:title');
  const url = assoluto(meta(html, 'og:url'));
  const corpoHtml = corpoArticolo(html);
  let corpo = testo(corpoHtml);
  const t = corpo.indexOf(titolo);
  if (t >= 0) corpo = corpo.slice(t + titolo.length).trim();
  corpo = corpo.replace(/^NEWSLETTER CSVAA[\s\S]*?\nIscriviti\n/, '');
  const allegati = [...corpoHtml.matchAll(/href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => ({ nome: testo(m[2]) || 'Allegato', url: encodeURI(decodeURI(assoluto(decodifica(m[1])))) }));
  const iscrizione = (corpoHtml.match(/href=["'](https?:\/\/(?:forms\.gle|docs\.google\.com\/forms|my\.csvastialessandria\.it|my\.csvnetpiemonte\.org|zoom\.us)[^"']*)["']/i) || [])[1] || '';
  const descrizione = corpo.replace(/\n?Allegati[\s\S]*$/, '').trim();
  const eventi = [{
    id: `${data}|${url || titolo}`,
    data,
    ora: orario(corpo, data),
    titolo,
    luogo: luogo(corpo, data),
    descrizione: descrizione.slice(0, 1200),
    url,
    iscrizione: decodifica(iscrizione),
    allegati
  }];
  // Se nello stesso giorno ci sono altri articoli collegati, li aggiunge come eventi separati
  const altri = [...new Set([...html.matchAll(/href=["'](\/20\d\d\/\d+\/\d+\/[^"'?#]+)\?control=OK/gi)].map(m => assoluto(m[1])))]
    .filter(u => u !== url);
  for (const u of altri) {
    const slug = decodeURIComponent(u.split('/').pop()).replace(/-+/g, ' ');
    eventi.push({ id: `${data}|${u}`, data, ora: '', titolo: slug.charAt(0).toUpperCase() + slug.slice(1), luogo: '', descrizione: '', url: u, iscrizione: '', allegati: [] });
  }
  return eventi;
}

// Elenco notizie (/news/index.asp, /news/alessandria.asp, /news/asti.asp)
export function notizie(html, zona = '') {
  const re = /<b><a href="(\/(20\d\d)\/(\d+)\/(\d+)\/[^"]+)">([\s\S]*?)<\/a><\/b><\/p>\s*<p class="corpo">([\s\S]*?)<a /gi;
  const visti = new Set();
  const out = [];
  for (const m of html.matchAll(re)) {
    const url = assoluto(m[1]);
    if (visti.has(url)) continue;
    visti.add(url);
    const prima = html.slice(Math.max(0, m.index - 600), m.index);
    const img = [...prima.matchAll(/background-image:\s*url\('([^']+)'\)/gi)].pop();
    out.push({
      id: url,
      data: `${m[2]}-${pad(m[3])}-${pad(m[4])}`,
      titolo: testo(m[5]),
      sommario: testo(m[6]).replace(/\s*\.{3}$/, '…'),
      url,
      immagine: img ? encodeURI(decodeURI(assoluto(img[1]))) : '',
      zona
    });
  }
  return out;
}

const dataIt = s => { const [g, m, a] = s.split('/'); return `${a}-${m}-${g}`; };

// Elenco bandi (/bandi/index.asp)
export function bandi(html) {
  const re = /<p class="corpo">(\d\d\/\d\d\/\d{4})<\/p>\s*<p class="corpo"><b><a href="articolo\.asp\?id=(\d+)">([\s\S]*?)<\/a><\/b><\/p>([\s\S]*?)<div class="linea">/gi;
  const out = [];
  for (const m of html.matchAll(re)) {
    const resto = m[4];
    const sc = resto.match(/Scadenza:\s*(\d\d\/\d\d\/\d{4})/i);
    const somm = testo(resto.replace(/<b>Scadenza:[\s\S]*?<\/b>/i, '')).replace(/leggi tutto\s*$/i, '').trim();
    out.push({
      id: 'bando-' + m[2],
      pubblicato: dataIt(m[1]),
      scadenza: sc ? dataIt(sc[1]) : '',
      titolo: testo(m[3]),
      sommario: somm.slice(0, 400),
      url: `${BASE}/bandi/articolo.asp?id=${m[2]}`
    });
  }
  return out;
}
