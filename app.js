/* Carnet d'expositions : application web hors connexion.
   Données : IndexedDB du téléphone (visites, éléments, médias).
   Lecture des cartels : Tesseract (français), embarqué dans vendor/. */
'use strict';
(() => {
  const app = document.getElementById('app');

  // ---------- Outils ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
  };
  const fmtDuree = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const slug = (s) => norm(s).replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } };

  const EXT = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  };
  const extension = (type) => EXT[String(type || '').split(';')[0]] || 'bin';

  const I = {
    retour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    crayon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    loupe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    appareil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    micro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3z"/></svg>',
    phototheque: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    lecture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M10 8.5v7l6-3.5-6-3.5z"/></svg>',
    poubelle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    fermer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };

  function message(texte, duree = 2600) {
    const m = document.createElement('div');
    m.className = 'message';
    m.setAttribute('role', 'status');
    m.textContent = texte;
    document.body.appendChild(m);
    setTimeout(() => m.remove(), duree);
  }

  // ---------- Base de données (IndexedDB) ----------
  let dbPromesse;
  function db() {
    if (!dbPromesse) {
      dbPromesse = new Promise((res, rej) => {
        const r = indexedDB.open('carnet-expositions', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          d.createObjectStore('visites', { keyPath: 'id' });
          d.createObjectStore('elements', { keyPath: 'id' }).createIndex('visiteId', 'visiteId');
          d.createObjectStore('medias', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbPromesse;
  }
  async function tx(nom, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(nom, mode);
      let sortie;
      const r = fn(t.objectStore(nom));
      if (r) r.onsuccess = () => { sortie = r.result; };
      t.oncomplete = () => res(sortie);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transaction annulée'));
    });
  }
  const lire = (s, id) => tx(s, 'readonly', (st) => st.get(id));
  const tous = (s) => tx(s, 'readonly', (st) => st.getAll());
  const ecrire = (s, v) => tx(s, 'readwrite', (st) => st.put(v));
  const effacer = (s, id) => tx(s, 'readwrite', (st) => st.delete(id));
  const elementsDe = (visiteId) => tx('elements', 'readonly', (st) => st.index('visiteId').getAll(visiteId));

  async function toucherVisite(visiteId) {
    const v = await lire('visites', visiteId);
    if (v) { v.modifieLe = Date.now(); await ecrire('visites', v); }
  }
  async function sauverElement(e) {
    e.modifieLe = Date.now();
    await ecrire('elements', e);
    await toucherVisite(e.visiteId);
  }
  async function ajouterMedia(blob, nature) {
    const id = uid();
    await ecrire('medias', { id, blob, type: blob.type || '', nature, creeLe: Date.now() });
    return id;
  }
  function mediasDe(e) {
    return [e.mediaId, e.photoId, e.cartelPhotoId, ...(e.vocaux || [])].filter(Boolean);
  }
  async function supprimerElement(e) {
    for (const m of mediasDe(e)) await effacer('medias', m);
    await effacer('elements', e.id);
    await toucherVisite(e.visiteId);
  }
  const oeuvreVide = (e) => e.type === 'oeuvre' && !e.photoId && !e.cartelPhotoId && !e.artiste && !e.titre && !e.cartel && !e.notes && !(e.vocaux || []).length;

  // ---------- Médias affichés ----------
  let urls = [];
  function libererUrls() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; }
  async function hydrater(racine = app) {
    for (const el of racine.querySelectorAll('[data-media]')) {
      const id = el.getAttribute('data-media');
      el.removeAttribute('data-media');
      const m = id && await lire('medias', id);
      if (!m) continue;
      const u = URL.createObjectURL(m.blob);
      urls.push(u);
      if (el.tagName === 'VIDEO') el.src = u + '#t=0.1'; else el.src = u;
    }
  }

  // ---------- Fichiers et captures ----------
  function choisirFichiers({ accept, capture, multiple } = {}) {
    // Doit être appelé directement dans le geste de l'utilisateur (règle de Safari).
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = accept || '';
      if (capture) i.setAttribute('capture', capture);
      if (multiple) i.multiple = true;
      i.className = 'sr';
      document.body.appendChild(i);
      i.addEventListener('change', () => { res([...(i.files || [])]); i.remove(); });
      i.addEventListener('cancel', () => { res([]); i.remove(); });
      i.click();
    });
  }

  async function preparerImage(fichier, max = 2560, qualite = 0.88) {
    try {
      const bmp = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
      const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * r);
      c.height = Math.round(bmp.height * r);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      const b = await new Promise((res) => c.toBlob(res, 'image/jpeg', qualite));
      return b || fichier;
    } catch (e) {
      return fichier;
    }
  }

  function ouvrirDialogue(html, classe = '') {
    const d = document.createElement('dialog');
    d.className = classe;
    d.innerHTML = html;
    document.body.appendChild(d);
    d.addEventListener('close', () => d.remove());
    d.showModal();
    return d;
  }

  async function enregistrerVocal() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      alert("L'enregistrement audio n'est pas disponible sur cet appareil.");
      return null;
    }
    let flux;
    try {
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert("Le micro n'est pas accessible. Autorise-le dans les réglages (Safari, Micro), puis réessaie.");
      return null;
    }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(flux, type ? { mimeType: type } : undefined);
    const morceaux = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) morceaux.push(ev.data); };
    const d = ouvrirDialogue(`<div class="boite">
      <p class="enregistre"><span class="point"></span>Enregistrement</p>
      <p class="chrono">0:00</p>
      <button type="button" class="btn btn-accent" data-ok>Arrêter et garder</button>
      <button type="button" class="btn btn-lien" data-annuler>Annuler</button>
    </div>`);
    const chrono = d.querySelector('.chrono');
    const debut = Date.now();
    const minuteur = setInterval(() => { chrono.textContent = fmtDuree((Date.now() - debut) / 1000); }, 500);
    rec.start(1000);
    return new Promise((res) => {
      let fini = false;
      const fin = (garder) => {
        if (fini) return;
        fini = true;
        clearInterval(minuteur);
        rec.onstop = () => {
          flux.getTracks().forEach((t) => t.stop());
          if (d.open) d.close();
          const duree = (Date.now() - debut) / 1000;
          res(garder && morceaux.length ? { blob: new Blob(morceaux, { type: (rec.mimeType || type || 'audio/mp4').split(';')[0] }), duree } : null);
        };
        rec.stop();
      };
      d.querySelector('[data-ok]').onclick = () => fin(true);
      d.querySelector('[data-annuler]').onclick = () => fin(false);
      d.addEventListener('cancel', (ev) => { ev.preventDefault(); fin(false); });
    });
  }

  // ---------- Lecture des cartels (Tesseract) ----------
  let ocrTravailleur = null;
  let fileOcr = Promise.resolve();
  function travailleurOcr() {
    if (!ocrTravailleur) {
      const base = new URL('vendor/tesseract/', location.href).href;
      ocrTravailleur = Tesseract.createWorker('fra', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'core',
        langPath: base + 'lang',
        gzip: true,
        workerBlobURL: false,
      }).catch((e) => { ocrTravailleur = null; throw e; });
    }
    return ocrTravailleur;
  }
  async function imagePourOcr(blob) {
    const bmp = await createImageBitmap(blob);
    const r = Math.min(2, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * r);
    c.height = Math.round(bmp.height * r);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    // Passage en niveaux de gris avec léger contraste, utile sous les éclairages de musée.
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const p = img.data;
    for (let i = 0; i < p.length; i += 4) {
      let g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128));
      p[i] = p[i + 1] = p[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function nettoyerTexte(t) {
    return String(t || '')
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => /[0-9A-Za-zÀ-ÿ]/.test(l) && l.replace(/[^0-9A-Za-zÀ-ÿ]/g, '').length >= 2)
      .join('\n');
  }
  function lireCartel(blob) {
    const travail = fileOcr.then(async () => {
      const w = await travailleurOcr();
      const { data } = await w.recognize(await imagePourOcr(blob));
      return nettoyerTexte(data.text);
    });
    fileOcr = travail.catch(() => {});
    return travail;
  }
  const enCours = new Set();
  async function traiterCartel(oeuvreId, remplacer) {
    let e = await lire('elements', oeuvreId);
    if (!e || !e.cartelPhotoId) return;
    const m = await lire('medias', e.cartelPhotoId);
    if (!m) return;
    enCours.add(oeuvreId);
    e.ocr = 'en-cours';
    await ecrire('elements', e);
    rafraichirCartel(oeuvreId);
    let texte = '';
    let echec = false;
    try { texte = await lireCartel(m.blob); } catch (err) { console.error(err); echec = true; }
    enCours.delete(oeuvreId);
    e = await lire('elements', oeuvreId);
    if (!e) return;
    if (!echec) {
      if (remplacer || !e.cartel) e.cartel = texte;
      const lignes = texte.split('\n');
      if (!e.artiste && lignes[0]) e.artiste = lignes[0];
      if (!e.titre && lignes[1]) e.titre = lignes[1];
    }
    e.ocr = echec ? 'echec' : (texte ? 'fait' : 'vide');
    await sauverElement(e);
    rafraichirCartel(oeuvreId, e);
  }

  // ---------- Navigation ----------
  const sauvegardesEnAttente = new Map();
  async function viderEnAttente() {
    const fns = [...sauvegardesEnAttente.values()];
    sauvegardesEnAttente.clear();
    for (const f of fns) await f();
  }
  let vueCourante = '';
  async function router() {
    await viderEnAttente();
    libererUrls();
    const h = location.hash.slice(1) || '/';
    const [chemin, requete] = h.split('?');
    const p = chemin.split('/').filter(Boolean);
    vueCourante = chemin;
    try {
      if (!p.length) await vueAccueil(new URLSearchParams(requete || '').get('q') || '');
      else if (p[0] === 'nouvelle') await vueFormVisite(null);
      else if (p[0] === 'visite' && p[2] === 'modifier') await vueFormVisite(p[1]);
      else if (p[0] === 'visite') await vueVisite(p[1]);
      else if (p[0] === 'oeuvre') await vueOeuvre(p[1]);
      else if (p[0] === 'sauvegarde') await vueSauvegarde();
      else await vueAccueil('');
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="page"><div class="contenu"><p class="statut erreur">Une erreur est survenue : ${esc(e.message)}</p><a class="btn" href="#/">Retour aux visites</a></div></div>`;
    }
    await hydrater();
  }
  const aller = (hash) => { if (location.hash === hash) router(); else location.hash = hash; };

  // ---------- Vue : accueil et recherche ----------
  async function donneesAccueil() {
    const visites = await tous('visites');
    const elements = await tous('elements');
    const parVisite = new Map(visites.map((v) => [v.id, []]));
    for (const e of elements) if (parVisite.has(e.visiteId) && !oeuvreVide(e)) parVisite.get(e.visiteId).push(e);
    visites.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.creeLe || 0) - (a.creeLe || 0));
    return { visites, elements, parVisite };
  }
  function resumeVisite(els) {
    const n = (t) => els.filter((e) => e.type === t).length;
    const vocaux = n('vocal') + els.reduce((s, e) => s + (e.vocaux || []).length, 0);
    const parts = [];
    if (n('oeuvre')) parts.push(pluriel(n('oeuvre'), 'œuvre', 'œuvres'));
    if (n('note')) parts.push(pluriel(n('note'), 'note', 'notes'));
    if (vocaux) parts.push(pluriel(vocaux, 'vocal', 'vocaux'));
    if (n('video')) parts.push(pluriel(n('video'), 'vidéo', 'vidéos'));
    if (n('photo')) parts.push(pluriel(n('photo'), 'photo', 'photos'));
    return parts;
  }
  async function vueAccueil(q) {
    const { visites, parVisite } = await donneesAccueil();
    const derniere = Number(lsGet('derniereSauvegarde') || 0);
    const modif = visites.reduce((m, v) => Math.max(m, v.modifieLe || 0), 0);
    const bandeau = visites.length && modif > derniere
      ? `<div class="bandeau"><span>${derniere ? 'Des changements ne sont pas encore sauvegardés.' : 'Aucune sauvegarde pour l’instant.'}</span><a href="#/sauvegarde">Sauvegarder</a></div>` : '';
    const cartes = visites.map((v) => {
      const els = parVisite.get(v.id) || [];
      const images = els.filter((e) => e.photoId || e.type === 'photo').slice(0, 3);
      return `<a class="carte-visite" href="#/visite/${esc(v.id)}">
        <span class="date">${esc(fmtDate(v.date))}</span>
        <h2>${esc(v.titre || 'Sans titre')}</h2>
        <p class="meta">${esc([v.lieu, ...resumeVisite(els)].filter(Boolean).join(' · '))}</p>
        ${images.length ? `<div class="vignettes">${images.map((e) => `<div class="tirage"><div class="image"><img alt="" data-media="${esc(e.photoId || e.mediaId)}"></div></div>`).join('')}</div>` : ''}
      </a>`;
    }).join('');
    app.innerHTML = `<div class="page">
      <header class="entete-accueil">
        <p class="surtitre">Carnet d'expositions</p>
        <h1>Mes visites</h1>
      </header>
      <div class="recherche" role="search">
        <label for="recherche" class="sr">Rechercher dans toutes les visites</label>
        <div class="champ-recherche">${I.loupe}<input id="recherche" type="search" autocomplete="off" placeholder="Artiste, œuvre, mot du cartel" value="${esc(q)}"></div>
      </div>
      ${bandeau}
      <div class="contenu">
        <div id="resultats"></div>
        <div id="liste">${cartes || '<p class="vide">Aucune visite pour l’instant. Commence par une nouvelle visite.</p>'}</div>
      </div>
      <div class="barre-bas"><div class="rangee">
        <a class="btn btn-accent btn-plein" href="#/nouvelle">Nouvelle visite</a>
        <a class="btn icone-btn" style="width:48px;height:48px;padding:0" href="#/sauvegarde" aria-label="Sauvegarder et exporter">${I.export}</a>
      </div></div>
    </div>`;
    const champ = document.getElementById('recherche');
    let minuteur;
    champ.addEventListener('input', () => { clearTimeout(minuteur); minuteur = setTimeout(() => chercher(champ.value), 150); });
    if (q) await chercher(q);
  }
  function surligner(texte, mots) {
    let h = esc(texte);
    for (const m of mots) {
      if (m.length < 2) continue;
      const re = new RegExp(m.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(''), 'gi');
      h = h.replace(re, (x) => `<mark>${x}</mark>`);
    }
    return h;
  }
  function extrait(texte, mots) {
    const n = norm(texte);
    let pos = -1;
    for (const m of mots) { const i = n.indexOf(m); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
    if (pos < 0) return '';
    const debut = Math.max(0, pos - 40);
    return (debut ? '…' : '') + texte.slice(debut, debut + 140).replace(/\s+/g, ' ');
  }
  async function chercher(q) {
    const res = document.getElementById('resultats');
    const liste = document.getElementById('liste');
    if (!res) return;
    const mots = norm(q).split(/\s+/).filter(Boolean);
    try { history.replaceState(null, '', q ? `#/?q=${encodeURIComponent(q)}` : '#/'); } catch (e) { /* ignoré */ }
    if (!mots.length) { res.innerHTML = ''; liste.hidden = false; return; }
    liste.hidden = true;
    const { visites, parVisite } = await donneesAccueil();
    const lignes = [];
    for (const v of visites) {
      const contexte = `${v.titre} ${v.lieu} ${fmtDate(v.date)}`;
      for (const e of parVisite.get(v.id) || []) {
        if (!['oeuvre', 'note'].includes(e.type)) continue;
        const propre = e.type === 'oeuvre' ? `${e.artiste || ''} ${e.titre || ''} ${e.cartel || ''} ${e.notes || ''}` : (e.texte || '');
        const tout = norm(`${contexte} ${propre}`);
        if (!mots.every((m) => tout.includes(m))) continue;
        const titre = e.type === 'oeuvre' ? (e.titre || 'Œuvre sans titre') : 'Note de visite';
        const ex = extrait(propre, mots);
        const lien = e.type === 'oeuvre' ? `#/oeuvre/${esc(e.id)}` : `#/visite/${esc(v.id)}`;
        lignes.push(`<a class="resultat" href="${lien}">
          <div class="tirage"><div class="image">${e.photoId || e.cartelPhotoId ? `<img alt="" data-media="${esc(e.photoId || e.cartelPhotoId)}">` : ''}</div></div>
          <div class="corps">
            <span class="italique" style="font-size:19px">${surligner(titre, mots)}</span>
            ${e.artiste ? `<span style="font-size:14px">${surligner(e.artiste, mots)}</span>` : ''}
            <span class="meta" style="font-size:13px">${surligner(`${v.titre || ''} · ${fmtDate(v.date)}`, mots)}</span>
            ${ex ? `<span class="extrait">${surligner(ex, mots)}</span>` : ''}
          </div>
        </a>`);
      }
    }
    res.innerHTML = lignes.length
      ? `<p class="libelle">${pluriel(lignes.length, 'résultat', 'résultats')}</p>${lignes.join('')}`
      : '<p class="vide">Aucun résultat. Essaie un autre mot, ou une partie du nom.</p>';
    await hydrater(res);
  }

  // ---------- Vue : nouvelle visite et modification ----------
  async function vueFormVisite(id) {
    const v = id ? await lire('visites', id) : null;
    if (id && !v) return aller('#/');
    const lieux = [...new Set((await tous('visites')).map((x) => x.lieu).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    app.innerHTML = `<div class="page">
      <div class="barre-haut"><div class="gauche">
        <a class="icone-btn" href="${v ? `#/visite/${esc(v.id)}` : '#/'}" aria-label="Retour">${I.retour}</a>
        <span class="surtitre">${v ? 'La visite' : 'Mes visites'}</span>
      </div></div>
      <div class="contenu">
        <h1 style="padding-top:12px">${v ? 'Modifier la visite' : 'Nouvelle visite'}</h1>
        <form class="formulaire" id="form-visite" novalidate>
          <div class="champ">
            <label class="libelle" for="titre">Titre de l'exposition</label>
            <input id="titre" name="titre" type="text" autocomplete="off" autocapitalize="sentences" placeholder="Saisir ou dicter le titre" value="${esc(v?.titre)}">
          </div>
          <div class="champ">
            <label class="libelle" for="lieu">Lieu</label>
            <input id="lieu" name="lieu" type="text" list="lieux" autocomplete="off" placeholder="Musée, galerie, ville" value="${esc(v?.lieu)}">
            <datalist id="lieux">${lieux.map((l) => `<option value="${esc(l)}"></option>`).join('')}</datalist>
            <p class="aide">Les lieux déjà visités sont proposés au fil de la saisie.</p>
          </div>
          <div class="champ">
            <label class="libelle" for="date">Date de la visite</label>
            <input id="date" name="date" type="date" value="${esc(v?.date || aujourdhui())}">
            <p class="aide">Date du jour par défaut, modifiable pour une visite passée.</p>
          </div>
          <p class="italique" style="font-size:18px;color:var(--encre-douce);margin:0">Ces trois informations figurent en tête de chaque œuvre et dans l'export Excel.</p>
          <button class="btn btn-accent" type="submit">${v ? 'Enregistrer' : 'Commencer la visite'}</button>
          ${v ? '<button class="btn btn-danger" type="button" id="supprimer-visite">Supprimer cette visite</button>' : ''}
        </form>
      </div>
    </div>`;
    const form = document.getElementById('form-visite');
    if (!v) form.titre.focus();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const titre = form.titre.value.trim();
      if (!titre) { message('Indique au moins le titre de l’exposition.'); form.titre.focus(); return; }
      const maintenant = Date.now();
      const visite = v || { id: uid(), creeLe: maintenant };
      Object.assign(visite, { titre, lieu: form.lieu.value.trim(), date: form.date.value || aujourdhui(), modifieLe: maintenant });
      await ecrire('visites', visite);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      if (v) history.back(); else location.replace(`#/visite/${visite.id}`);
    });
    const bouton = document.getElementById('supprimer-visite');
    if (bouton) bouton.addEventListener('click', async () => {
      const els = await elementsDe(v.id);
      if (!confirm(`Supprimer « ${v.titre} » et ses ${els.length} éléments ? Cette action est définitive.`)) return;
      for (const e of els) { for (const m of mediasDe(e)) await effacer('medias', m); await effacer('elements', e.id); }
      await effacer('visites', v.id);
      location.replace('#/');
    });
  }

  // ---------- Vue : une visite ----------
  function tuile(e) {
    if (e.type === 'oeuvre') {
      const img = e.photoId || e.cartelPhotoId;
      return `<a class="tuile" href="#/oeuvre/${esc(e.id)}">
        <div class="tirage"><div class="image">${img ? `<img alt="" data-media="${esc(img)}">` : ''}</div></div>
        <div class="legende"><span class="t">${esc(e.titre || (e.ocr === 'en-cours' ? 'Lecture du cartel…' : 'Œuvre sans titre'))}</span>${e.artiste ? `<span class="s">${esc(e.artiste)}</span>` : ''}</div>
      </a>`;
    }
    if (e.type === 'photo') {
      return `<button type="button" class="tuile" data-voir="${esc(e.id)}" aria-label="Voir la photo">
        <div class="tirage"><div class="image"><img alt="" data-media="${esc(e.mediaId)}"></div></div>
        <div class="legende"><span class="s">Photo</span></div>
      </button>`;
    }
    if (e.type === 'video') {
      return `<button type="button" class="tuile" data-voir="${esc(e.id)}" aria-label="Voir la vidéo">
        <div class="tirage"><div class="image" style="background:#4A443C"><video muted playsinline preload="metadata" data-media="${esc(e.mediaId)}"></video><span class="lecture">${I.lecture}</span></div></div>
        <div class="legende"><span class="t">Vidéo${e.duree ? `, ${fmtDuree(e.duree)}` : ''}</span></div>
      </button>`;
    }
    if (e.type === 'note') {
      return `<button type="button" class="tuile" data-note="${esc(e.id)}">
        <div class="tuile-texte"><span class="libelle" style="margin:0">Note</span><span class="txt">${esc(e.texte)}</span></div>
      </button>`;
    }
    if (e.type === 'vocal') {
      return `<div class="tuile">
        <div class="tuile-texte">
          <div class="ligne-titre"><span class="libelle" style="margin:0">Vocal${e.duree ? `, ${fmtDuree(e.duree)}` : ''}</span>
          <button type="button" class="icone-btn" data-suppr="${esc(e.id)}" aria-label="Supprimer ce vocal">${I.poubelle}</button></div>
          <audio controls preload="metadata" data-media="${esc(e.mediaId)}"></audio>
        </div>
      </div>`;
    }
    return '';
  }
  async function vueVisite(id) {
    const v = await lire('visites', id);
    if (!v) return aller('#/');
    let els = await elementsDe(id);
    for (const e of els) if (oeuvreVide(e) && !enCours.has(e.id)) await effacer('elements', e.id);
    els = els.filter((e) => !oeuvreVide(e)).sort((a, b) => (a.creeLe || 0) - (b.creeLe || 0));
    app.innerHTML = `<div class="page">
      <div class="barre-haut">
        <a class="icone-btn" href="#/" aria-label="Retour aux visites">${I.retour}</a>
        <a class="icone-btn" href="#/visite/${esc(v.id)}/modifier" aria-label="Modifier le titre, le lieu ou la date">${I.crayon}</a>
      </div>
      <header class="entete-visite">
        <span class="date">${esc(fmtDate(v.date))}</span>
        <h1>${esc(v.titre || 'Sans titre')}</h1>
        ${v.lieu ? `<p class="meta">${esc(v.lieu)}</p>` : ''}
      </header>
      <div class="contenu">
        ${els.length ? `<div class="grille">${els.map(tuile).join('')}</div>` : '<p class="vide" style="padding-top:22px">La visite commence. Photographie une première œuvre et son cartel, ou ajoute une note.</p>'}
      </div>
      <div class="barre-bas">
        <div class="capture">
          <button type="button" class="btn btn-accent" data-capture="oeuvre">${I.appareil}Œuvre</button>
          <button type="button" class="btn" data-capture="note">${I.note}Note</button>
          <button type="button" class="btn" data-capture="vocal">${I.micro}Vocal</button>
          <button type="button" class="btn" data-capture="video">${I.video}Vidéo</button>
        </div>
        <button type="button" class="btn btn-lien" data-capture="import">${I.phototheque}Importer depuis la photothèque</button>
      </div>
    </div>`;

    const nouvelElement = (type, extra) => ({ id: uid(), visiteId: v.id, type, creeLe: Date.now(), ...extra });

    app.querySelector('[data-capture="oeuvre"]').addEventListener('click', async () => {
      const e = nouvelElement('oeuvre', { artiste: '', titre: '', cartel: '', notes: '', vocaux: [] });
      await ecrire('elements', e);
      aller(`#/oeuvre/${e.id}`);
    });
    app.querySelector('[data-capture="note"]').addEventListener('click', () => editerNote(null, v.id));
    app.querySelector('[data-capture="vocal"]').addEventListener('click', async () => {
      const r = await enregistrerVocal();
      if (!r) return;
      const mediaId = await ajouterMedia(r.blob, 'audio');
      await sauverElement(nouvelElement('vocal', { mediaId, duree: r.duree }));
      router();
    });
    app.querySelector('[data-capture="video"]').addEventListener('click', async () => {
      const fichiers = await choisirFichiers({ accept: 'video/*', capture: 'environment' });
      if (fichiers.length) await importerMedias(fichiers, v.id);
    });
    app.querySelector('[data-capture="import"]').addEventListener('click', async () => {
      const fichiers = await choisirFichiers({ accept: 'image/*,video/*', multiple: true });
      if (fichiers.length) await importerMedias(fichiers, v.id);
    });
    app.querySelectorAll('[data-note]').forEach((b) => b.addEventListener('click', () => editerNote(b.getAttribute('data-note'), v.id)));
    app.querySelectorAll('[data-voir]').forEach((b) => b.addEventListener('click', () => visionner(b.getAttribute('data-voir'))));
    app.querySelectorAll('[data-suppr]').forEach((b) => b.addEventListener('click', async () => {
      const e = await lire('elements', b.getAttribute('data-suppr'));
      if (e && confirm('Supprimer ce vocal ?')) { await supprimerElement(e); router(); }
    }));
  }

  async function dureeVideo(blob) {
    return new Promise((res) => {
      const u = URL.createObjectURL(blob);
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () => { res(isFinite(vid.duration) ? vid.duration : 0); URL.revokeObjectURL(u); };
      vid.onerror = () => { res(0); URL.revokeObjectURL(u); };
      vid.src = u;
      setTimeout(() => res(0), 4000);
    });
  }
  async function importerMedias(fichiers, visiteId) {
    message(fichiers.length > 1 ? `Import de ${fichiers.length} fichiers…` : 'Enregistrement…', 1800);
    let base = Date.now();
    for (const f of fichiers) {
      const video = (f.type || '').startsWith('video/');
      const blob = video ? f : await preparerImage(f);
      const mediaId = await ajouterMedia(blob, video ? 'video' : 'photo');
      const e = { id: uid(), visiteId, type: video ? 'video' : 'photo', mediaId, creeLe: base++ };
      if (video) e.duree = await dureeVideo(f);
      await sauverElement(e);
    }
    router();
  }

  function editerNote(id, visiteId) {
    (async () => {
      const e = id ? await lire('elements', id) : null;
      const d = ouvrirDialogue(`<form class="boite" method="dialog">
        <h2>${e ? 'La note' : 'Nouvelle note'}</h2>
        <div class="champ"><label class="libelle" for="texte-note">Texte (le micro du clavier permet de dicter)</label>
        <textarea id="texte-note" rows="6">${esc(e?.texte)}</textarea></div>
        <button type="submit" class="btn btn-accent" value="ok">Enregistrer</button>
        ${e ? '<button type="button" class="btn btn-danger" data-suppr>Supprimer la note</button>' : ''}
        <button type="button" class="btn btn-lien" data-annuler>Annuler</button>
      </form>`);
      const zone = d.querySelector('textarea');
      zone.focus();
      d.querySelector('[data-annuler]').onclick = () => d.close();
      const sup = d.querySelector('[data-suppr]');
      if (sup) sup.onclick = async () => { if (confirm('Supprimer cette note ?')) { await supprimerElement(e); d.close(); router(); } };
      d.querySelector('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const texte = zone.value.trim();
        if (texte) {
          const note = e || { id: uid(), visiteId, type: 'note', creeLe: Date.now() };
          note.texte = texte;
          await sauverElement(note);
        } else if (e) {
          await supprimerElement(e);
        }
        d.close();
        router();
      });
    })();
  }

  async function visionner(elementId) {
    const e = await lire('elements', elementId);
    if (!e) return;
    const m = await lire('medias', e.mediaId);
    if (!m) return;
    const u = URL.createObjectURL(m.blob);
    const d = ouvrirDialogue(`<div class="boite">
      <div class="haut">
        <button type="button" class="icone-btn" data-fermer aria-label="Fermer">${I.fermer}</button>
        <button type="button" class="btn" data-suppr>Supprimer</button>
      </div>
      <div class="media">${e.type === 'video' ? `<video controls playsinline src="${u}"></video>` : `<img alt="" src="${u}">`}</div>
    </div>`, 'visionneuse');
    d.addEventListener('close', () => URL.revokeObjectURL(u));
    d.querySelector('[data-fermer]').onclick = () => d.close();
    d.querySelector('[data-suppr]').onclick = async () => {
      if (!confirm(e.type === 'video' ? 'Supprimer cette vidéo ?' : 'Supprimer cette photo ?')) return;
      await supprimerElement(e);
      d.close();
      router();
    };
  }
  async function visionnerMedia(mediaId) {
    const m = await lire('medias', mediaId);
    if (!m) return;
    const u = URL.createObjectURL(m.blob);
    const d = ouvrirDialogue(`<div class="boite">
      <div class="haut"><button type="button" class="icone-btn" data-fermer aria-label="Fermer">${I.fermer}</button></div>
      <div class="media"><img alt="" src="${u}"></div>
    </div>`, 'visionneuse');
    d.addEventListener('close', () => URL.revokeObjectURL(u));
    d.querySelector('[data-fermer]').onclick = () => d.close();
  }

  // ---------- Vue : fiche d'une œuvre ----------
  function blocStatut(e) {
    if (!e.cartelPhotoId) return '';
    if (e.ocr === 'en-cours' || enCours.has(e.id)) return '<span class="statut"><span class="point"></span>Lecture du cartel…</span>';
    if (e.ocr === 'echec') return '<span class="statut erreur">La lecture a échoué. Réessaie ou saisis le texte.</span>';
    if (e.ocr === 'vide') return '<span class="statut">Aucun texte lisible. Une photo plus nette, de face et sans reflet, aide beaucoup.</span>';
    return '<span class="statut">Texte lu automatiquement, à corriger si besoin.</span>';
  }
  function emplacement(role, libelle) {
    return `<div class="emplacement">
      <p>${libelle}</p>
      <div class="actions">
        <button type="button" class="btn btn-accent" data-prendre="${role}" data-source="appareil">${I.appareil}Photographier</button>
        <button type="button" class="btn" data-prendre="${role}" data-source="phototheque">${I.phototheque}Photothèque</button>
      </div>
    </div>`;
  }
  async function vueOeuvre(id) {
    const e = await lire('elements', id);
    if (!e) return aller('#/');
    const v = await lire('visites', e.visiteId);
    if (!v) return aller('#/');
    const vocaux = [];
    for (const mid of e.vocaux || []) { const m = await lire('medias', mid); if (m) vocaux.push(m); }
    app.innerHTML = `<div class="page">
      <div class="barre-haut"><div class="gauche">
        <a class="icone-btn" href="#/visite/${esc(v.id)}" aria-label="Retour à la visite">${I.retour}</a>
        <div class="rappel"><span class="titre">${esc(v.titre)}</span><span class="sous">${esc([v.lieu, fmtDate(v.date)].filter(Boolean).join(' · '))}</span></div>
      </div></div>
      <div class="contenu"><div class="fiche">
        <section aria-label="Photo de l'œuvre">
          ${e.photoId ? `<button type="button" class="photo-principale" data-agrandir="${esc(e.photoId)}" aria-label="Agrandir la photo"><img alt="" data-media="${esc(e.photoId)}"></button>
            <div class="actions-discretes"><button type="button" class="btn" data-prendre="photo" data-source="appareil">Reprendre</button><button type="button" class="btn" data-prendre="photo" data-source="phototheque">Photothèque</button></div>`
            : emplacement('photo', '1. L’œuvre')}
        </section>
        <section aria-label="Cartel">
          ${e.cartelPhotoId ? `<div class="cartel">
              <button type="button" class="vignette" data-agrandir="${esc(e.cartelPhotoId)}" aria-label="Agrandir le cartel"><img alt="" data-media="${esc(e.cartelPhotoId)}"></button>
              <div class="corps"><span class="libelle" style="margin:0">Cartel</span><div id="statut-cartel">${blocStatut(e)}</div></div>
            </div>
            <div class="actions-discretes"><button type="button" class="btn" data-relire>Relire le cartel</button><button type="button" class="btn" data-prendre="cartel" data-source="appareil">Reprendre</button><button type="button" class="btn" data-prendre="cartel" data-source="phototheque">Photothèque</button></div>`
            : emplacement('cartel', '2. Le cartel')}
        </section>
        <section class="section">
          <div class="champ"><label class="libelle" for="artiste">Artiste</label><input id="artiste" data-champ="artiste" type="text" autocomplete="off" value="${esc(e.artiste)}"></div>
          <div class="champ"><label class="libelle" for="titre-oeuvre">Titre de l'œuvre</label><input id="titre-oeuvre" data-champ="titre" type="text" autocomplete="off" style="font-style:italic" value="${esc(e.titre)}"></div>
          <div class="champ"><label class="libelle" for="cartel">Texte du cartel</label><textarea id="cartel" data-champ="cartel" rows="5">${esc(e.cartel)}</textarea></div>
        </section>
        <section class="section">
          <div class="champ"><label class="libelle" for="notes">Mes notes</label><textarea id="notes" data-champ="notes" rows="4" placeholder="Ce que l’œuvre m’évoque… (micro du clavier pour dicter)">${esc(e.notes)}</textarea></div>
          ${vocaux.map((m, i) => `<div class="vocal"><audio controls preload="metadata" data-media="${esc(m.id)}" aria-label="Vocal ${i + 1}"></audio><button type="button" class="icone-btn" data-suppr-vocal="${esc(m.id)}" aria-label="Supprimer ce vocal">${I.poubelle}</button></div>`).join('')}
        </section>
        <button type="button" class="btn btn-danger" data-supprimer-oeuvre>Supprimer cette œuvre</button>
      </div></div>
      <div class="barre-bas"><div class="rangee">
        <button type="button" class="btn btn-plein" data-vocal>${I.micro}Vocal</button>
        <button type="button" class="btn btn-accent btn-plein" data-suivante>${I.plus}Œuvre suivante</button>
      </div></div>
    </div>`;

    // Sauvegarde automatique des champs
    const sauverChamps = async () => {
      sauvegardesEnAttente.delete(id);
      const x = await lire('elements', id);
      if (!x) return;
      let change = false;
      app.querySelectorAll('[data-champ]').forEach((c) => {
        const k = c.getAttribute('data-champ');
        if ((x[k] || '') !== c.value) { x[k] = c.value; change = true; }
      });
      if (change) await sauverElement(x);
    };
    let minuteur;
    app.querySelectorAll('[data-champ]').forEach((c) => {
      c.addEventListener('input', () => {
        sauvegardesEnAttente.set(id, sauverChamps);
        clearTimeout(minuteur);
        minuteur = setTimeout(sauverChamps, 500);
      });
      c.addEventListener('blur', () => { if (sauvegardesEnAttente.has(id)) sauverChamps(); });
    });

    app.querySelectorAll('[data-prendre]').forEach((b) => b.addEventListener('click', async () => {
      const role = b.getAttribute('data-prendre');
      const fichiers = await choisirFichiers({ accept: 'image/*', capture: b.getAttribute('data-source') === 'appareil' ? 'environment' : null });
      if (!fichiers.length) return;
      await viderEnAttente();
      const blob = await preparerImage(fichiers[0]);
      const x = await lire('elements', id);
      const cle = role === 'photo' ? 'photoId' : 'cartelPhotoId';
      const ancien = x[cle];
      x[cle] = await ajouterMedia(blob, role === 'photo' ? 'photo' : 'cartel');
      if (role === 'cartel') x.ocr = 'en-cours';
      await sauverElement(x);
      if (ancien) await effacer('medias', ancien);
      if (role === 'cartel') traiterCartel(id, true);
      await router();
    }));
    const relire = app.querySelector('[data-relire]');
    if (relire) relire.addEventListener('click', async () => {
      await viderEnAttente();
      const x = await lire('elements', id);
      if (x.cartel && !confirm('Relire le cartel remplacera le texte actuel. Continuer ?')) return;
      traiterCartel(id, true);
    });
    app.querySelectorAll('[data-agrandir]').forEach((b) => b.addEventListener('click', () => visionnerMedia(b.getAttribute('data-agrandir'))));
    app.querySelector('[data-vocal]').addEventListener('click', async () => {
      await viderEnAttente();
      const r = await enregistrerVocal();
      if (!r) return;
      const mid = await ajouterMedia(r.blob, 'audio');
      const x = await lire('elements', id);
      x.vocaux = [...(x.vocaux || []), mid];
      x.durees = { ...(x.durees || {}), [mid]: r.duree };
      await sauverElement(x);
      router();
    });
    app.querySelectorAll('[data-suppr-vocal]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Supprimer ce vocal ?')) return;
      await viderEnAttente();
      const mid = b.getAttribute('data-suppr-vocal');
      const x = await lire('elements', id);
      x.vocaux = (x.vocaux || []).filter((m) => m !== mid);
      await sauverElement(x);
      await effacer('medias', mid);
      router();
    }));
    app.querySelector('[data-supprimer-oeuvre]').addEventListener('click', async () => {
      if (!confirm('Supprimer cette œuvre, ses photos et ses vocaux ?')) return;
      sauvegardesEnAttente.delete(id);
      await supprimerElement(await lire('elements', id));
      location.replace(`#/visite/${v.id}`);
    });
    app.querySelector('[data-suivante]').addEventListener('click', async () => {
      await viderEnAttente();
      const n = { id: uid(), visiteId: v.id, type: 'oeuvre', creeLe: Date.now(), artiste: '', titre: '', cartel: '', notes: '', vocaux: [] };
      await ecrire('elements', n);
      location.replace(`#/oeuvre/${n.id}`);
    });
  }
  function rafraichirCartel(id, e) {
    if (vueCourante !== `/oeuvre/${id}`) return;
    const zone = document.getElementById('statut-cartel');
    if (zone) zone.innerHTML = blocStatut(e || { id, cartelPhotoId: true, ocr: 'en-cours' });
    if (!e) return;
    for (const k of ['artiste', 'titre', 'cartel']) {
      const c = app.querySelector(`[data-champ="${k}"]`);
      if (c && document.activeElement !== c && c.value !== (e[k] || '')) c.value = e[k] || '';
    }
  }

  // ---------- Exports et sauvegardes ----------
  async function collecter() {
    const visites = (await tous('visites')).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.creeLe || 0) - (b.creeLe || 0));
    const elements = (await tous('elements')).filter((e) => !oeuvreVide(e));
    const medias = await tous('medias');
    const typeDe = new Map(medias.map((m) => [m.id, m.type]));
    const chemins = new Map();
    const numeros = new Map();
    const parVisite = new Map(visites.map((v) => [v.id, []]));
    for (const e of elements) if (parVisite.has(e.visiteId)) parVisite.get(e.visiteId).push(e);
    for (const v of visites) {
      const dossier = `${v.date || 'sans-date'}-${slug(v.titre) || 'exposition'}`;
      const els = parVisite.get(v.id).sort((a, b) => (a.creeLe || 0) - (b.creeLe || 0));
      els.forEach((e, i) => {
        const nn = pad(i + 1);
        numeros.set(e.id, i + 1);
        const nomer = (mid, suffixe) => { if (mid) chemins.set(mid, `${dossier}/${suffixe}.${extension(typeDe.get(mid))}`); };
        if (e.type === 'oeuvre') {
          const base = [nn, slug(e.artiste), slug(e.titre)].filter(Boolean).join('-') || nn;
          nomer(e.photoId, base);
          nomer(e.cartelPhotoId, `${base}-cartel`);
          (e.vocaux || []).forEach((m, k) => nomer(m, `${base}-vocal-${k + 1}`));
        } else {
          nomer(e.mediaId, `${nn}-${e.type}`);
        }
      });
    }
    return { visites, elements, medias, chemins, numeros, parVisite };
  }
  function construireExcel({ visites, chemins, numeros, parVisite }) {
    const oeuvres = [];
    const lignesVisites = [];
    for (const v of visites) {
      const els = parVisite.get(v.id);
      for (const e of els.filter((x) => x.type === 'oeuvre')) {
        oeuvres.push({
          'Date': v.date || '',
          'Exposition': v.titre || '',
          'Lieu': v.lieu || '',
          'N°': numeros.get(e.id),
          'Artiste': e.artiste || '',
          "Titre de l'œuvre": e.titre || '',
          'Texte du cartel': e.cartel || '',
          'Mes notes': e.notes || '',
          'Vocaux': (e.vocaux || []).length,
          "Photo de l'œuvre": chemins.get(e.photoId) || '',
          'Photo du cartel': chemins.get(e.cartelPhotoId) || '',
          'Fichiers vocaux': (e.vocaux || []).map((m) => chemins.get(m)).filter(Boolean).join(' ; '),
        });
      }
      const n = (t) => els.filter((x) => x.type === t).length;
      lignesVisites.push({
        'Date': v.date || '',
        'Exposition': v.titre || '',
        'Lieu': v.lieu || '',
        'Œuvres': n('oeuvre'),
        'Notes de visite': els.filter((x) => x.type === 'note').map((x) => x.texte).join('\n\n'),
        'Vocaux': n('vocal') + els.reduce((s, x) => s + (x.vocaux || []).length, 0),
        'Vidéos': n('video'),
        'Photos': n('photo'),
      });
    }
    const wb = XLSX.utils.book_new();
    const f1 = XLSX.utils.json_to_sheet(oeuvres, { header: ['Date', 'Exposition', 'Lieu', 'N°', 'Artiste', "Titre de l'œuvre", 'Texte du cartel', 'Mes notes', 'Vocaux', "Photo de l'œuvre", 'Photo du cartel', 'Fichiers vocaux'] });
    f1['!cols'] = [12, 32, 24, 5, 24, 32, 50, 50, 7, 40, 40, 40].map((w) => ({ wch: w }));
    const f2 = XLSX.utils.json_to_sheet(lignesVisites, { header: ['Date', 'Exposition', 'Lieu', 'Œuvres', 'Notes de visite', 'Vocaux', 'Vidéos', 'Photos'] });
    f2['!cols'] = [12, 36, 28, 8, 60, 8, 8, 8].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, f1, 'Œuvres');
    XLSX.utils.book_append_sheet(wb, f2, 'Visites');
    const octets = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([octets], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  async function partager(fichier) {
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      try { await navigator.share({ files: [fichier], title: fichier.name }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(fichier);
    a.download = fichier.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
    return true;
  }
  const taille = (o) => (o > 1e9 ? `${(o / 1e9).toFixed(1).replace('.', ',')} Go` : `${Math.max(1, Math.round(o / 1e6))} Mo`);

  async function vueSauvegarde() {
    const d = await collecter();
    const nbOeuvres = d.elements.filter((e) => e.type === 'oeuvre').length;
    const poidsVideos = d.medias.filter((m) => m.nature === 'video').reduce((s, m) => s + (m.blob?.size || 0), 0);
    const poidsTotal = d.medias.reduce((s, m) => s + (m.blob?.size || 0), 0);
    const nbVocaux = d.medias.filter((m) => m.nature === 'audio').length;
    const derniere = Number(lsGet('derniereSauvegarde') || 0);
    let estimation = '';
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est.quota) estimation = `Espace utilisé : ${taille(est.usage || 0)} sur ${taille(est.quota)} disponibles pour l’application.`;
      }
    } catch (e) { /* ignoré */ }
    app.innerHTML = `<div class="page">
      <div class="barre-haut"><div class="gauche">
        <a class="icone-btn" href="#/" aria-label="Retour aux visites">${I.retour}</a>
        <span class="surtitre">Mes visites</span>
      </div></div>
      <div class="contenu">
        <h1 style="padding:12px 0 18px">Sauvegarder</h1>
        <div class="chiffres">
          <div><strong>${d.visites.length}</strong><span>${d.visites.length > 1 ? 'visites' : 'visite'}</span></div>
          <div><strong>${nbOeuvres}</strong><span>${nbOeuvres > 1 ? 'œuvres' : 'œuvre'}</span></div>
          <div><strong>${d.medias.length}</strong><span>médias, ${taille(poidsTotal)}</span></div>
        </div>
        <p class="meta" style="padding-bottom:16px">${derniere ? `Dernière sauvegarde complète : ${esc(new Date(derniere).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }))}.` : 'Aucune sauvegarde complète pour l’instant.'} ${esc(estimation)}</p>

        <div class="bloc">
          <h2>Fichier Excel</h2>
          <p>Le fichier <em>carnet-expositions.xlsx</em> contient toutes les visites depuis le début : un onglet Œuvres (une ligne par œuvre) et un onglet Visites. Enregistre-le dans Fichiers sous le même nom pour remplacer l’ancien. Les corrections se font ici, dans l’application.</p>
          <button type="button" class="btn btn-accent" data-action="excel">Exporter le fichier Excel</button>
          <div class="progression" data-zone="excel"></div>
        </div>

        <div class="bloc">
          <h2>Sauvegarde complète</h2>
          <p>Une archive avec le fichier Excel, toutes les données et tous les médias, rangés par visite. À faire après chaque visite et à ranger dans iCloud : c’est elle qui permet de tout restaurer.</p>
          <label class="case"><input type="checkbox" data-videos checked>Inclure les vidéos (${taille(poidsVideos)})</label>
          <button type="button" class="btn btn-accent" data-action="complete">Préparer la sauvegarde</button>
          <div class="progression" data-zone="complete"></div>
        </div>

        <div class="bloc">
          <h2>Vocaux</h2>
          <p>Les ${nbVocaux} enregistrements, nommés par visite et par œuvre, pour les transcrire ensuite si besoin.</p>
          <button type="button" class="btn" data-action="vocaux" ${nbVocaux ? '' : 'disabled'}>Exporter les vocaux</button>
          <div class="progression" data-zone="vocaux"></div>
        </div>

        <div class="bloc">
          <h2>Restaurer</h2>
          <p>Recharger une sauvegarde complète, par exemple sur un nouveau téléphone. Les visites déjà présentes sont conservées ; celles de la sauvegarde sont ajoutées ou mises à jour.</p>
          <button type="button" class="btn" data-action="restaurer">Choisir une sauvegarde</button>
          <div class="progression" data-zone="restaurer"></div>
        </div>
      </div>
    </div>`;

    const zone = (n) => app.querySelector(`[data-zone="${n}"]`);
    const proposer = (n, fichier, apres) => {
      // Le partage doit partir d'un geste : on affiche un second bouton une fois le fichier prêt.
      const z = zone(n);
      z.innerHTML = `<p style="margin:0 0 8px">Prêt : ${esc(fichier.name)} (${taille(fichier.size)}).</p><button type="button" class="btn btn-accent">Enregistrer le fichier</button>`;
      z.querySelector('button').addEventListener('click', async () => { const ok = await partager(fichier); if (ok && apres) apres(); });
    };
    const jour = aujourdhui();

    app.querySelector('[data-action="excel"]').addEventListener('click', async () => {
      zone('excel').textContent = 'Préparation…';
      const blob = construireExcel(await collecter());
      proposer('excel', new File([blob], 'carnet-expositions.xlsx', { type: blob.type }));
    });
    app.querySelector('[data-action="complete"]').addEventListener('click', async () => {
      const avecVideos = app.querySelector('[data-videos]').checked;
      const z = zone('complete');
      z.textContent = 'Préparation…';
      try {
        const c = await collecter();
        const zip = new JSZip();
        zip.file('carnet-expositions.xlsx', construireExcel(c));
        const inclus = c.medias.filter((m) => c.chemins.has(m.id) && (avecVideos || m.nature !== 'video'));
        zip.file('donnees.json', JSON.stringify({
          format: 'carnet-expositions', version: 1, exporteLe: new Date().toISOString(),
          visites: c.visites, elements: c.elements,
          medias: inclus.map((m) => ({ id: m.id, type: m.type, nature: m.nature, creeLe: m.creeLe, chemin: c.chemins.get(m.id) })),
        }, null, 1));
        for (const m of inclus) zip.file(`medias/${c.chemins.get(m.id)}`, m.blob, { binary: true });
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (meta) => { z.textContent = `Préparation… ${Math.round(meta.percent)} %`; });
        proposer('complete', new File([blob], `carnet-expositions-sauvegarde-${jour}.zip`, { type: 'application/zip' }), () => {
          lsSet('derniereSauvegarde', String(Date.now()));
          message('Sauvegarde enregistrée.');
        });
      } catch (e) {
        console.error(e);
        z.textContent = `La sauvegarde n’a pas pu être préparée (${e.message}). Essaie sans les vidéos.`;
      }
    });
    app.querySelector('[data-action="vocaux"]').addEventListener('click', async () => {
      const z = zone('vocaux');
      z.textContent = 'Préparation…';
      const c = await collecter();
      const zip = new JSZip();
      for (const m of c.medias.filter((x) => x.nature === 'audio' && c.chemins.has(x.id))) zip.file(c.chemins.get(m.id), m.blob, { binary: true });
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      proposer('vocaux', new File([blob], `carnet-expositions-vocaux-${jour}.zip`, { type: 'application/zip' }));
    });
    app.querySelector('[data-action="restaurer"]').addEventListener('click', async () => {
      const fichiers = await choisirFichiers({ accept: '.zip,application/zip' });
      if (!fichiers.length) return;
      const z = zone('restaurer');
      z.textContent = 'Lecture de la sauvegarde…';
      try {
        const zip = await JSZip.loadAsync(fichiers[0]);
        const json = zip.file('donnees.json');
        if (!json) throw new Error('ce fichier n’est pas une sauvegarde du carnet');
        const data = JSON.parse(await json.async('string'));
        if (data.format !== 'carnet-expositions') throw new Error('format inconnu');
        let n = 0;
        for (const m of data.medias || []) {
          const f = zip.file(`medias/${m.chemin}`);
          if (!f) continue;
          const b = await f.async('blob');
          await ecrire('medias', { id: m.id, blob: new Blob([b], { type: m.type || '' }), type: m.type || '', nature: m.nature, creeLe: m.creeLe });
          z.textContent = `Restauration… ${++n} médias`;
        }
        for (const e of data.elements || []) await ecrire('elements', e);
        for (const v of data.visites || []) await ecrire('visites', v);
        z.textContent = `Restauration terminée : ${pluriel((data.visites || []).length, 'visite', 'visites')}, ${pluriel(n, 'média', 'médias')}.`;
      } catch (e) {
        console.error(e);
        z.textContent = `Restauration impossible : ${e.message}.`;
      }
    });
  }

  // ---------- Démarrage ----------
  window.addEventListener('hashchange', router);
  window.addEventListener('pagehide', () => { viderEnAttente(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') viderEnAttente(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker non enregistré', e));
  }
  // Reprise d'une lecture de cartel interrompue (application fermée pendant la lecture).
  tous('elements').then((els) => els.filter((e) => e.ocr === 'en-cours').forEach((e) => traiterCartel(e.id, !e.cartel))).catch(() => {});
  router();
})();
