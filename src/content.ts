// ─── State ────────────────────────────────────────────────────────────────────

const SUPPORTED_LANGS = ['pt', 'en', 'es', 'fr', 'de', 'ja'];

function detectBrowserLang(): string {
  const raw = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.())
    || navigator.language
    || 'en';
  const lang = raw.split('-')[0].toLowerCase();
  return SUPPORTED_LANGS.includes(lang) ? lang : 'en';
}

function effectiveLang(): string {
  return targetLang === 'auto' ? detectBrowserLang() : targetLang;
}

// ─── Proteção de contexto ─────────────────────────────────────────────────────

let contextValid = true;

function safeStorageSet(data: Record<string, unknown>) {
  if (!contextValid) return;
  try {
    chrome.storage.local.set(data);
  } catch {
    contextValid = false;
  }
}

let targetLang = 'auto';
let isTranslating = false;
let translatedHtml = '';
let originalText = '';
let lastTranslatedLines: string[] = [];
let lastCacheKey = '';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let protectObserver: MutationObserver | null = null;
let lyricsStatus: 'idle' | 'loading' | 'ready' | 'none' = 'idle';

let origColor  = '#ffffff';
let transColor = '#7a7a7a';
let showOrig   = true;
let showTrans  = true;
let sizeOrig   = 14;
let sizeTrans  = 13;

// Carrega configurações salvas
chrome.storage.local.get(['lyricsColors', 'displayMode', 'targetLang', 'lyricsFontSize']).then((data: Record<string, unknown>) => {
  if (data['targetLang']) targetLang = data['targetLang'] as string;
  const c = data['lyricsColors'] as { orig?: string; trans?: string } | undefined;
  if (c?.orig)  origColor  = c.orig;
  if (c?.trans) transColor = c.trans;
  const m = data['displayMode'] as { showOrig?: boolean; showTrans?: boolean } | undefined;
  if (m?.showOrig  != null) showOrig  = m.showOrig;
  if (m?.showTrans != null) showTrans = m.showTrans;
  const fs = data['lyricsFontSize'] as { orig?: number; trans?: number } | undefined;
  if (fs?.orig  != null) sizeOrig  = fs.orig;
  if (fs?.trans != null) sizeTrans = fs.trans;
});

// Reaplica quando mudam
chrome.storage.onChanged.addListener((changes: Record<string, chrome.storage.StorageChange>) => {
  let rebuild = false;
  if (changes['lyricsColors']) {
    const c = changes['lyricsColors'].newValue as { orig?: string; trans?: string };
    if (c?.orig)  origColor  = c.orig;
    if (c?.trans) transColor = c.trans;
    rebuild = true;
  }
  if (changes['displayMode']) {
    const m = changes['displayMode'].newValue as { showOrig?: boolean; showTrans?: boolean };
    if (m?.showOrig  != null) showOrig  = m.showOrig;
    if (m?.showTrans != null) showTrans = m.showTrans;
    rebuild = true;
  }
  if (changes['lyricsFontSize']) {
    const fs = changes['lyricsFontSize'].newValue as { orig?: number; trans?: number };
    if (fs?.orig  != null) sizeOrig  = fs.orig;
    if (fs?.trans != null) sizeTrans = fs.trans;
    rebuild = true;
  }
  if (rebuild && originalText && lastTranslatedLines.length > 0) {
    translatedHtml = buildHtml(originalText, lastTranslatedLines);
    const el = getLyricsEl();
    if (el) showTranslated(el, translatedHtml);
  }
});

const OUTPUT_ID = 'ytmlt-output';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getLyricsEl(): HTMLElement | null {
  // O elemento visível é o non-expandable; o dentro do button é o fallback
  return document.querySelector<HTMLElement>(
    'ytmusic-description-shelf-renderer yt-formatted-string.non-expandable.description'
  ) ?? document.querySelector<HTMLElement>(
    'ytmusic-description-shelf-renderer yt-formatted-string.description'
  );
}

/** Oculta todos os elementos originais de letra (non-expandable + o que está no button). */
function hideAllOriginals() {
  document.querySelectorAll<HTMLElement>(
    'ytmusic-description-shelf-renderer yt-formatted-string.description'
  ).forEach(el => { el.style.display = 'none'; });
  const btn = document.querySelector<HTMLElement>('button#description-button');
  if (btn) btn.style.display = 'none';
}

/** Restaura todos os elementos originais. */
function restoreAllOriginals() {
  document.querySelectorAll<HTMLElement>(
    'ytmusic-description-shelf-renderer yt-formatted-string.description'
  ).forEach(el => { el.style.display = ''; });
  const btn = document.querySelector<HTMLElement>('button#description-button');
  if (btn) btn.style.display = '';
}

function getShelf(): HTMLElement | null {
  return document.querySelector<HTMLElement>('ytmusic-description-shelf-renderer');
}

// ─── YTMusic API ─────────────────────────────────────────────────────────────

async function fetchLyricsFromYTM(videoId: string): Promise<string | null> {
  try {
    const context = { client: { clientName: 'WEB_REMIX', clientVersion: '1.20231201.01.00', hl: 'en' } };

    // Passo 1: pegar o browseId da aba de letra
    const nextRes = await fetch('https://music.youtube.com/youtubei/v1/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, context }),
    });
    if (!nextRes.ok) return null;
    const nextData = await nextRes.json();

    const tabs: unknown[] = nextData?.contents
      ?.singleColumnMusicWatchNextResultsRenderer
      ?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs ?? [];

    let browseId: string | null = null;
    for (const tab of tabs) {
      const id = (tab as any)?.tabRenderer?.endpoint?.browseEndpoint?.browseId as string | undefined;
      if (id?.startsWith('MPLY')) { browseId = id; break; }
    }
    if (!browseId) return null;

    // Passo 2: pegar a letra pelo browseId
    const browseRes = await fetch('https://music.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browseId, context }),
    });
    if (!browseRes.ok) return null;
    const browseData = await browseRes.json();

    const runs: unknown[] = browseData?.contents
      ?.sectionListRenderer?.contents?.[0]
      ?.musicDescriptionShelfRenderer?.description?.runs ?? [];

    if (!runs.length) return null;
    return runs.map((r: any) => r.text as string).join('');
  } catch {
    return null;
  }
}

async function processLyricsFromAPI(videoId: string) {
  if (isTranslating) return;
  if (effectiveLang() === 'off' || targetLang === 'off') { lyricsStatus = 'idle'; return; }

  isTranslating = true;
  lyricsStatus = 'loading';
  try {
    const raw = await fetchLyricsFromYTM(videoId);

    // Música mudou enquanto buscava — descarta
    if (videoId !== lastVideoId) return;

    if (!raw || raw.length < 5) { lyricsStatus = 'none'; return; }

    const cacheKey = `${raw}::${effectiveLang()}`;
    if (cacheKey === lastCacheKey && translatedHtml) { lyricsStatus = 'ready'; return; }

    originalText = raw;
    const nonEmpty = raw.split('\n').filter((l: string) => l.trim());
    const translated = await translate(nonEmpty.join('\n'), effectiveLang());

    // Checa novamente após o translate (operação lenta)
    if (videoId !== lastVideoId) return;

    const translatedLines = translated.split('\n');
    lastTranslatedLines = translatedLines;
    translatedHtml = buildHtml(raw, translatedLines);
    lastCacheKey = cacheKey;
    lyricsStatus = 'ready';

    console.log('[YTLyrics] ✅ Letra via API:', nonEmpty.length, 'linhas');

    const el = getLyricsEl();
    if (el) { injectLangSelector(); showTranslated(el, translatedHtml); startProtecting(el); }
  } catch {
    if (videoId === lastVideoId) {
      lyricsStatus = 'none';
    }
  } finally {
    isTranslating = false;
  }
}

function getOutputEl(): HTMLElement | null {
  return document.getElementById(OUTPUT_ID);
}

// ─── Translate ────────────────────────────────────────────────────────────────

async function translate(text: string, lang: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return (d[0] as Array<[string]>).map(x => x[0]).join('');
}

// ─── Build HTML ───────────────────────────────────────────────────────────────

function buildHtml(raw: string, translatedLines: string[]): string {
  const lines = raw.split('\n');
  let html = '';
  let i = 0;
  for (const line of lines) {
    if (!line.trim()) {
      html += `<div style="height:10px"></div>`;
    } else {
      const trans = escapeHtml(translatedLines[i]?.trim() || '');
      i++;
      const origDiv  = showOrig  ? `<div style="color:${origColor};font-size:${sizeOrig}px;line-height:1.5">${escapeHtml(line)}</div>` : '';
      const transDiv = showTrans ? `<div style="color:${transColor};font-size:${sizeTrans}px;font-style:italic;line-height:1.4">${trans}</div>` : '';
      if (origDiv || transDiv) html += `<div style="margin-bottom:14px">${origDiv}${transDiv}</div>`;
    }
  }
  return html;
}

// ─── Output div ───────────────────────────────────────────────────────────────

function ensureOutputDiv(lyricsEl: HTMLElement): HTMLElement {
  let out = getOutputEl();
  if (!out) {
    out = document.createElement('div');
    out.id = OUTPUT_ID;
    out.style.cssText = 'padding:4px 0;width:100%;';
    // Insere após o elemento de letra (non-expandable já está fora de button)
    lyricsEl.insertAdjacentElement('afterend', out);
  }
  return out;
}

function showTranslated(lyricsEl: HTMLElement, html: string) {
  const out = ensureOutputDiv(lyricsEl);
  out.innerHTML = html;
  hideAllOriginals();
}

function showOriginal(_lyricsEl: HTMLElement) {
  restoreAllOriginals();
  getOutputEl()?.remove();
}

// ─── Protege contra re-render do Polymer ─────────────────────────────────────

function startProtecting(el: HTMLElement) {
  protectObserver?.disconnect();
  protectObserver = new MutationObserver(() => {
    if (!translatedHtml || isTranslating) return;
    // Polymer resetou o yt-formatted-string — re-oculta e re-aplica output
    protectObserver!.disconnect();
    showTranslated(el, translatedHtml);
    Promise.resolve().then(() => {
      const fresh = getLyricsEl();
      if (fresh) startProtecting(fresh);
    });
  });
  // Observa apenas o yt-formatted-string para detectar reset do Polymer
  protectObserver.observe(el, { childList: true, subtree: true, characterData: true });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function processLyrics() {
  if (isTranslating) return;

  const el = getLyricsEl();
  if (!el) return;

  // Se o output já existe e tem conteúdo, não re-processar
  const existing = getOutputEl();
  if (existing && existing.children.length > 0) return;

  // Captura texto — o yt-formatted-string deve estar visível neste momento
  const raw = el.textContent?.trim() || '';
  if (!raw || raw.length < 5 || raw.includes('⏳')) return;

  const cacheKey = `${raw}::${effectiveLang()}`;

  if (cacheKey === lastCacheKey && translatedHtml) {
    showTranslated(el, translatedHtml);
    startProtecting(el);
    return;
  }

  if (effectiveLang() === 'off' || targetLang === 'off') {
    protectObserver?.disconnect();
    translatedHtml = '';
    showOriginal(el);
    return;
  }

  isTranslating = true;
  originalText = raw;

  // Loading
  const out = ensureOutputDiv(el);
  out.innerHTML = `<span style="color:rgba(255,255,255,0.4);font-style:italic">⏳ Traduzindo...</span>`;
  hideAllOriginals();

  try {
    const nonEmpty = originalText.split('\n').filter(l => l.trim());
    const translated = await translate(nonEmpty.join('\n'), effectiveLang());
    const translatedLines = translated.split('\n');

    lastTranslatedLines = translatedLines;
    translatedHtml = buildHtml(originalText, translatedLines);
    lastCacheKey = cacheKey;

    showTranslated(el, translatedHtml);
    startProtecting(el);

    console.log('[YTLyrics] ✅ Tradução aplicada:', nonEmpty.length, 'linhas');
  } catch (err) {
    console.error('[YTLyrics] Erro:', err);
    translatedHtml = '';
    lastCacheKey = `${originalText}::${targetLang}`;
    showOriginal(el);
  } finally {
    isTranslating = false;
  }
}

// ─── Language selector ────────────────────────────────────────────────────────

function injectLangSelector() {
  if (document.getElementById('ytmlt-lang-selector')) return;
  const shelf = getShelf();
  if (!shelf) return;

  const header = shelf.querySelector<HTMLElement>('h2, [class*="title"]');
  const wrap = document.createElement('div');
  wrap.id = 'ytmlt-lang-selector';
  wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:8px;vertical-align:middle;';
  wrap.innerHTML = `
    <label style="font-size:11px;color:rgba(255,255,255,0.5)">Tradução:</label>
    <select id="ytmlt-lang" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;font-size:11px;padding:2px 6px;cursor:pointer;outline:none">
      <option value="auto">🌐 Auto</option>
      <option value="pt">Português</option>
      <option value="en">English</option>
      <option value="es">Español</option>
      <option value="fr">Français</option>
      <option value="de">Deutsch</option>
      <option value="ja">日本語</option>
      <option value="off">Off</option>
    </select>`;

  if (header) { header.style.cssText += ';display:flex;align-items:center'; header.appendChild(wrap); }
  else shelf.prepend(wrap);

  document.getElementById('ytmlt-lang')?.addEventListener('change', e => {
    targetLang = (e.target as HTMLSelectElement).value;
    safeStorageSet({ targetLang });
    lastCacheKey = '';
    translatedHtml = '';
    protectObserver?.disconnect();
    const el = getLyricsEl();
    if (el) showOriginal(el);
    if (lastVideoId) processLyricsFromAPI(lastVideoId);
    else processLyrics();
  });
}

// ─── Observer principal ───────────────────────────────────────────────────────

const mainObserver = new MutationObserver(() => {
  if (isTranslating) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (isTranslating) return;
    const el = getLyricsEl();
    if (!el) return;
    injectLangSelector();
    // Se já temos letra em cache (API), mostra imediatamente
    if (translatedHtml && lastCacheKey) {
      showTranslated(el, translatedHtml);
      startProtecting(el);
    } else {
      processLyrics();
    }
  }, 500);
});

mainObserver.observe(document.body, { subtree: true, childList: true });

// ─── Troca de música ──────────────────────────────────────────────────────────

/** Tenta pegar o video ID de múltiplas fontes */
function getCurrentVideoId(): string | null {
  // 1. URL
  const urlId = new URLSearchParams(location.search).get('v');
  if (urlId) return urlId;

  // 2. Link do título dentro do player (modo compacto)
  const titleLink = document.querySelector<HTMLAnchorElement>('#movie_player .ytp-title-link[href*="v="]');
  if (titleLink?.href) {
    const m = titleLink.href.match(/[?&]v=([^&]+)/);
    if (m) return m[1];
  }

  return null;
}

let lastVideoId: string | null = getCurrentVideoId();
let lastSongTitle = '';

// Carrega letra da música já aberta ao iniciar
if (lastVideoId) setTimeout(() => processLyricsFromAPI(lastVideoId!), 1500);

setInterval(() => {
  if (!contextValid) return;
  const vid = getCurrentVideoId();
  const titleEl = document.querySelector<HTMLElement>('ytmusic-player-bar .content-info-wrapper .title');
  const title = titleEl?.textContent?.trim() || '';

  const songChanged = vid !== lastVideoId || (!!title && title !== lastSongTitle && lastSongTitle !== '');

  if (songChanged) {
    lastVideoId = vid;
    lastSongTitle = title;
    lastCacheKey = '';
    translatedHtml = '';
    originalText = '';
    isTranslating = false;
    lyricsStatus = vid ? 'loading' : 'idle';
    protectObserver?.disconnect();
    document.getElementById('ytmlt-lang-selector')?.remove();
    const el = getLyricsEl();
    if (el) showOriginal(el);
    console.log('[YTLyrics] Nova música:', vid, title);
    if (vid) setTimeout(() => processLyricsFromAPI(vid), 1500);
  }
}, 1000);

// ─── Song state → storage ─────────────────────────────────────────────────────

// Seletores robustos — cobre YTM em qualquer idioma
const PAUSE_LABELS = ['pausar', 'pause', 'pausieren', 'pauzeren'];

function getPlayPauseBtn(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    'ytmusic-player-bar button[aria-label="Pausar"],' +
    'ytmusic-player-bar button[aria-label="Pause"],' +
    'ytmusic-player-bar button[aria-label="Reproduzir"],' +
    'ytmusic-player-bar button[aria-label="Tocar"],' +
    'ytmusic-player-bar button[aria-label="Play"]'
  );
}

function getSongInfo() {
  const titleEl  = document.querySelector<HTMLElement>('ytmusic-player-bar .content-info-wrapper .title');
  const artistEl = document.querySelector<HTMLElement>('ytmusic-player-bar .content-info-wrapper .subtitle yt-formatted-string');
  const thumbEl  = document.querySelector<HTMLImageElement>('ytmusic-player-bar img.image');
  const timeEl   = document.querySelector<HTMLElement>('ytmusic-player-bar .time-info');
  const playBtn  = getPlayPauseBtn();

  const timeText = timeEl?.textContent?.trim() || '0:00 / 0:00';
  const [currentTime, totalTime] = timeText.split('/').map(s => s.trim());
  const label = (playBtn?.getAttribute('aria-label') || '').toLowerCase();
  const isPlaying = PAUSE_LABELS.some(l => label.includes(l));

  return {
    title: titleEl?.textContent?.trim() || '',
    artist: artistEl?.textContent?.trim() || '',
    thumbnail: thumbEl?.src || '',
    currentTime: currentTime || '0:00',
    totalTime: totalTime || '0:00',
    isPlaying,
    lyrics: translatedHtml,
    targetLang,
    lyricsStatus,
  };
}

setInterval(() => {
  if (!contextValid) return;
  const info = getSongInfo();
  if (info.title) safeStorageSet({ songInfo: info });
}, 1000);

// ─── Mensagens do popup ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: { action: string; lang?: string }) => {
  switch (msg.action) {
    case 'play':
      getPlayPauseBtn()?.click();
      break;
    case 'next':
      document.querySelector<HTMLElement>(
        'ytmusic-player-bar button[aria-label="Avançar"]:not([aria-label*="segundos"]),' +
        'ytmusic-player-bar button[aria-label="Next"]'
      )?.click();
      break;
    case 'prev':
      document.querySelector<HTMLElement>(
        'ytmusic-player-bar button[aria-label="Anterior"],' +
        'ytmusic-player-bar button[aria-label="Previous"]'
      )?.click();
      break;
    case 'setLang': {
      if (!msg.lang) break;
      targetLang = msg.lang;
      safeStorageSet({ targetLang });
      lastCacheKey = '';
      translatedHtml = '';
      protectObserver?.disconnect();
      const el = getLyricsEl();
      if (el) showOriginal(el);
      const sel = document.getElementById('ytmlt-lang') as HTMLSelectElement | null;
      if (sel) sel.value = msg.lang;
      if (lastVideoId) processLyricsFromAPI(lastVideoId);
      else processLyrics();
      break;
    }
  }
});

console.log('[YTLyrics] Extensão carregada.');
