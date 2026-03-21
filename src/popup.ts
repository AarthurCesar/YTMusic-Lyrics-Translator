import { t } from './i18n';

const DEFAULT_ORIG       = '#ffffff';
const DEFAULT_TRANS      = '#7a7a7a';
const DEFAULT_SIZE_ORIG  = 14;
const DEFAULT_SIZE_TRANS = 13;

function applyI18n() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle!);
  });
  // No-song text (has <br> so use innerHTML)
  const noSongText = document.getElementById('no-song-text');
  if (noSongText) noSongText.innerHTML = t('no_song').replace('\n', '<br>');
}

async function loadColors() {
  const data = await chrome.storage.local.get(['lyricsColors', 'displayMode', 'lyricsFontSize']);
  const c = (data['lyricsColors'] as { orig?: string; trans?: string }) || {};
  (document.getElementById('color-orig') as HTMLInputElement).value  = c.orig  ?? DEFAULT_ORIG;
  (document.getElementById('color-trans') as HTMLInputElement).value = c.trans ?? DEFAULT_TRANS;

  const m = (data['displayMode'] as { showOrig?: boolean; showTrans?: boolean }) || {};
  (document.getElementById('show-orig')  as HTMLInputElement).checked = m.showOrig  ?? true;
  (document.getElementById('show-trans') as HTMLInputElement).checked = m.showTrans ?? true;

  const fs = (data['lyricsFontSize'] as { orig?: number; trans?: number }) || {};
  const sizeOrig  = fs.orig  ?? DEFAULT_SIZE_ORIG;
  const sizeTrans = fs.trans ?? DEFAULT_SIZE_TRANS;
  (document.getElementById('size-orig')  as HTMLInputElement).value = String(sizeOrig);
  (document.getElementById('size-trans') as HTMLInputElement).value = String(sizeTrans);
  document.getElementById('size-orig-val')!.textContent  = `${sizeOrig}px`;
  document.getElementById('size-trans-val')!.textContent = `${sizeTrans}px`;

}

async function saveDisplayMode() {
  const showOrig  = (document.getElementById('show-orig')  as HTMLInputElement).checked;
  const showTrans = (document.getElementById('show-trans') as HTMLInputElement).checked;
  await chrome.storage.local.set({ displayMode: { showOrig, showTrans } });
}

async function saveColors(patch: { orig?: string; trans?: string }) {
  const data = await chrome.storage.local.get('lyricsColors');
  const current = (data['lyricsColors'] as object) || {};
  await chrome.storage.local.set({ lyricsColors: { ...current, ...patch } });
}

async function getYTMTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
  return tabs[0] ?? null;
}

async function sendControl(action: string, extra?: Record<string, unknown>) {
  const tab = await getYTMTab();
  if (tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { action, ...extra }).catch(() => {});
  }
}

async function translateTitle(text: string, lang: string): Promise<string> {
  if (!text || !lang || lang === 'off' || lang === 'auto') return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url);
    const d = await r.json();
    return (d[0] as Array<[string]>).map(x => x[0]).join('') || text;
  } catch { return text; }
}

let cachedTitleTranslation = { orig: '', lang: '', result: '' };

async function getTranslatedTitle(title: string, lang: string): Promise<string> {
  // For title in side-by-side mode, always translate; default to browser lang or 'pt'
  const effectiveLang = (lang === 'auto' || lang === 'off' || !lang)
    ? (navigator.language.split('-')[0] || 'pt')
    : lang;
  if (cachedTitleTranslation.orig === title && cachedTitleTranslation.lang === effectiveLang) {
    return cachedTitleTranslation.result;
  }
  const result = await translateTitle(title, effectiveLang);
  cachedTitleTranslation = { orig: title, lang: effectiveLang, result };
  return result;
}

function timeToSeconds(t: string): number {
  const parts = t.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

let lastIsPlaying = false;
let userScrolling = false;
let scrollTimer: ReturnType<typeof setTimeout>;

function highlightActiveLine(currentTimeStr: string) {
  
  const lyricsEl = document.getElementById('lyrics')!;
  const timedDivs = lyricsEl.querySelectorAll<HTMLElement>('[data-start-ms]');
  if (timedDivs.length === 0) return;

  const currentMs = timeToSeconds(currentTimeStr) * 1000 + 1992; // compensate storage delay

  let activeIdx = -1;
  for (let i = 0; i < timedDivs.length; i++) {
    const ms = parseInt(timedDivs[i].dataset.startMs || '0');
    if (ms <= currentMs) activeIdx = i;
    else break;
  }

  const prevActive = lyricsEl.querySelector('.active-line');
  const newActive = activeIdx >= 0 ? timedDivs[activeIdx] : null;
  if (prevActive === newActive) return;

  prevActive?.classList.remove('active-line');
  if (newActive) {
    newActive.classList.add('active-line');
    if (!userScrolling) {
      newActive.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

async function refresh() {
  const data = await chrome.storage.local.get('songInfo');
  const info = data['songInfo'] as {
    title: string; artist: string; thumbnail: string;
    currentTime: string; totalTime: string; progress: number;
    isPlaying: boolean; lyrics: string; targetLang: string;
    lyricsStatus: 'idle' | 'loading' | 'ready' | 'none';
  } | undefined;

  const noSong = document.getElementById('no-song')!;
  const playerUI = document.getElementById('player-ui')!;

  if (!info?.title) {
    noSong.style.display = '';
    playerUI.style.display = 'none';
    return;
  }

  noSong.style.display = 'none';
  playerUI.style.display = document.body.classList.contains('detached') ? 'flex' : '';

  // Limpa cache quando status muda
  const lyricsEl2 = document.getElementById('lyrics')!;
  if (info.lyricsStatus !== 'ready' && lyricsEl2.dataset.cacheKey && lyricsEl2.dataset.cacheKey !== info.lyricsStatus) {
    lyricsEl2.dataset.cacheKey = '';
  }

  (document.getElementById('thumb') as HTMLImageElement).src = info.thumbnail || '';
  document.getElementById('song-title')!.textContent = info.title;
  document.getElementById('song-artist')!.textContent = info.artist;


  const cur = timeToSeconds(info.currentTime);
  const tot = timeToSeconds(info.totalTime);
  const pct = tot > 0 ? (cur / tot) * 100 : 0;
  if (!seeking && !seekCooldown) {
    (document.getElementById('progress-fill') as HTMLElement).style.width = `${pct}%`;
    document.getElementById('time-current')!.textContent = info.currentTime;
  }
  document.getElementById('time-total')!.textContent = info.totalTime;

  const playBtn = document.getElementById('btn-play')!;
  playBtn.textContent = info.isPlaying ? '⏸' : '▶';
  lastIsPlaying = info.isPlaying;

  const langSelect = document.getElementById('lang-select') as HTMLSelectElement;
  if (info.targetLang && langSelect.value !== info.targetLang) {
    langSelect.value = info.targetLang;
  }

  const lyricsEl = document.getElementById('lyrics')!;
  if (info.lyrics && info.lyricsStatus === 'ready') {
    // Usa tamanho + snippet do meio como cache key (detecta mudanças de estilo)
    const key = `${info.lyrics.length}:${info.lyrics.slice(50, 120)}`;
    if (lyricsEl.dataset.cacheKey !== key) {
      const isSide = lyricsEl.classList.contains('side-by-side');
      if (isSide) {
        getTranslatedTitle(info.title, info.targetLang).then(translatedTitle => {
          const songHeader = `
            <div style="margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.1)">
              <div style="display:flex;gap:0;align-items:flex-start">
                <div style="flex:1;padding-right:12px;border-right:1px solid rgba(255,255,255,0.12);text-align:center">
                  <div style="font-size:1.1em;font-weight:700;line-height:1.4">${info.title}</div>
                  <div style="font-size:0.85em;color:rgba(255,255,255,0.5);margin-top:3px">${info.artist}</div>
                </div>
                <div style="flex:1;padding-left:12px;text-align:center">
                  <div style="font-size:1.1em;font-weight:700;line-height:1.4">${translatedTitle}</div>
                  <div style="font-size:0.85em;color:rgba(255,255,255,0.5);margin-top:3px">${info.artist}</div>
                </div>
              </div>
            </div>`;
          lyricsEl.innerHTML = songHeader + info.lyrics;
        });
      } else {
        lyricsEl.innerHTML = info.lyrics;
      }
      lyricsEl.dataset.cacheKey = key;
    }
  } else if (info.lyricsStatus === 'loading') {
    if (lyricsEl.dataset.cacheKey !== 'loading') {
      lyricsEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:28px 0">
          <div id="lyrics-spinner" style="
            width:22px;height:22px;border-radius:50%;
            border:2px solid rgba(255,255,255,0.1);
            border-top-color:#8A5CFF;
            animation:spin 0.8s linear infinite">
          </div>
          <span style="color:rgba(255,255,255,0.35);font-size:11px">${t('translating')}</span>
        </div>`;
      lyricsEl.dataset.cacheKey = 'loading';
    }
  } else if (info.lyricsStatus === 'none') {
    if (lyricsEl.dataset.cacheKey !== 'none') {
      lyricsEl.innerHTML = `<div style="color:rgba(255,255,255,0.3);font-size:12px;text-align:center;padding:20px 0">${t('no_lyrics')}</div>`;
      lyricsEl.dataset.cacheKey = 'none';
    }
  }

  // Highlight synced lyrics
  if (info.currentTime) {
    highlightActiveLine(info.currentTime);
  }
}

document.getElementById('btn-play')!.addEventListener('click', () => sendControl('play'));
document.getElementById('btn-prev')!.addEventListener('click', () => sendControl('prev'));
document.getElementById('btn-next')!.addEventListener('click', () => sendControl('next'));

// ── Seek by click + drag on progress bar ────────────────────────────────────
const progressBar = document.querySelector('.progress-bg') as HTMLElement;
let seeking = false;
let seekCooldown = false;

async function seekToPosition(clientX: number) {
  const rect = progressBar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  // Atualiza visual imediatamente
  (document.getElementById('progress-fill') as HTMLElement).style.width = `${pct * 100}%`;
  const data = await chrome.storage.local.get('songInfo');
  const info = data['songInfo'] as { totalTime: string } | undefined;
  if (!info?.totalTime) return;
  const total = timeToSeconds(info.totalTime);
  if (total > 0) {
    const secs = Math.floor(pct * total);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    document.getElementById('time-current')!.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    sendControl('seekTo', { seconds: secs });
  }
}

progressBar.addEventListener('pointerdown', (e) => {
  seeking = true;
  progressBar.setPointerCapture(e.pointerId);
  seekToPosition(e.clientX);
  e.preventDefault();
});

progressBar.addEventListener('pointermove', (e) => {
  if (!seeking) return;
  seekToPosition(e.clientX);
});

progressBar.addEventListener('pointerup', () => {
  seeking = false;
  seekCooldown = true;
  setTimeout(() => { seekCooldown = false; }, 1500);
});



document.getElementById('lang-select')!.addEventListener('change', e => {
  const lang = (e.target as HTMLSelectElement).value;
  sendControl('setLang', { lang });
});

// ── Pop out: abre popup como janela independente ─────────────────────────────
document.getElementById('btn-popout')!.addEventListener('click', async () => {
  const w = 360;
  const h = 640;
  const left = Math.round((window.screen.availWidth  - w) / 2);
  const top  = Math.round((window.screen.availHeight - h) / 2);
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html') + '?detached=1',
    type: 'popup',
    width: w,
    height: h,
    left,
    top,
  });
  window.close();
});

// ── Settings panel ──────────────────────────────────────────────────────────
const settingsBtn   = document.getElementById('btn-settings')!;
const settingsPanel = document.getElementById('settings-panel')!;

settingsBtn.addEventListener('click', () => {
  const open = settingsPanel.style.display === 'none';
  settingsPanel.style.display = open ? '' : 'none';
  settingsBtn.style.color = open ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)';
});

document.getElementById('color-orig')!.addEventListener('input', e =>
  saveColors({ orig: (e.target as HTMLInputElement).value })
);
document.getElementById('color-trans')!.addEventListener('input', e =>
  saveColors({ trans: (e.target as HTMLInputElement).value })
);
document.getElementById('show-orig')!.addEventListener('change',  saveDisplayMode);
document.getElementById('show-trans')!.addEventListener('change', saveDisplayMode);

document.getElementById('size-orig')!.addEventListener('input', async e => {
  const v = Number((e.target as HTMLInputElement).value);
  document.getElementById('size-orig-val')!.textContent = `${v}px`;
  const data = await chrome.storage.local.get('lyricsFontSize');
  const cur = (data['lyricsFontSize'] as object) || {};
  await chrome.storage.local.set({ lyricsFontSize: { ...cur, orig: v } });
});

document.getElementById('size-trans')!.addEventListener('input', async e => {
  const v = Number((e.target as HTMLInputElement).value);
  document.getElementById('size-trans-val')!.textContent = `${v}px`;
  const data = await chrome.storage.local.get('lyricsFontSize');
  const cur = (data['lyricsFontSize'] as object) || {};
  await chrome.storage.local.set({ lyricsFontSize: { ...cur, trans: v } });
});

document.getElementById('btn-reset-colors')!.addEventListener('click', async () => {
  await chrome.storage.local.set({
    lyricsColors:   { orig: DEFAULT_ORIG, trans: DEFAULT_TRANS },
    displayMode:    { showOrig: true, showTrans: true },
    lyricsFontSize: { orig: DEFAULT_SIZE_ORIG, trans: DEFAULT_SIZE_TRANS },
  });
  (document.getElementById('color-orig')  as HTMLInputElement).value   = DEFAULT_ORIG;
  (document.getElementById('color-trans') as HTMLInputElement).value   = DEFAULT_TRANS;
  (document.getElementById('show-orig')   as HTMLInputElement).checked = true;
  (document.getElementById('show-trans')  as HTMLInputElement).checked = true;
  (document.getElementById('size-orig')   as HTMLInputElement).value   = String(DEFAULT_SIZE_ORIG);
  (document.getElementById('size-trans')  as HTMLInputElement).value   = String(DEFAULT_SIZE_TRANS);
  document.getElementById('size-orig-val')!.textContent  = `${DEFAULT_SIZE_ORIG}px`;
  document.getElementById('size-trans-val')!.textContent = `${DEFAULT_SIZE_TRANS}px`;
});

// Detecta janela destacada (largura maior que popup padrão)
// Detecta modo destacado via parâmetro de URL (confiável)
if (new URLSearchParams(location.search).has('detached')) {
  document.body.classList.add('detached');

  // Botão de layout lado a lado
  const layoutBtn = document.getElementById('btn-layout')!;
  layoutBtn.style.display = 'block';
  const lyricsEl = document.getElementById('lyrics')!;

  chrome.storage.local.get('lyricsLayout').then((data: Record<string, unknown>) => {
    if (data['lyricsLayout'] === 'side') {
      lyricsEl.classList.add('side-by-side');
      layoutBtn.style.color = '#8A5CFF';
    }
  });

  layoutBtn.addEventListener('click', async () => {
    const isSide = lyricsEl.classList.toggle('side-by-side');
    layoutBtn.style.color = isSide ? '#8A5CFF' : 'rgba(255,255,255,0.35)';
    // Force re-render by clearing cache key
    lyricsEl.dataset.cacheKey = '';
    await chrome.storage.local.set({ lyricsLayout: isSide ? 'side' : 'stacked' });
  });

  // Mostra botão de reload apenas na janela destacada
  const reloadBtn = document.getElementById('btn-reload-detached')!;
  reloadBtn.style.display = 'block';
  reloadBtn.addEventListener('click', () => location.reload());
  // Escala das letras proporcional à largura da janela
  function updateLyricsScale() {
    const scale = Math.min(2.5, Math.max(1, window.innerWidth / 320));
    document.documentElement.style.setProperty('--lyrics-scale', String(scale));
  }
  updateLyricsScale();
  window.addEventListener('resize', updateLyricsScale);
}

// Detect user scrolling to pause auto-scroll
document.getElementById('lyrics')!.addEventListener('scroll', () => {
  userScrolling = true;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => { userScrolling = false; }, 4000);
}, { passive: true });

applyI18n();
loadColors();
refresh();
setInterval(refresh, 1000);
