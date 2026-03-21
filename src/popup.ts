import { t } from './i18n';

const DEFAULT_ORIG      = '#ffffff';
const DEFAULT_TRANS     = '#7a7a7a';
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

function timeToSeconds(t: string): number {
  const parts = t.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

let lastIsPlaying = false;

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
  playerUI.style.display = '';

  // Limpa cache do lyricsEl se status mudou para loading (nova música)
  const lyricsEl2 = document.getElementById('lyrics')!;
  if (info.lyricsStatus === 'loading' && lyricsEl2.dataset.cacheKey !== 'loading') {
    lyricsEl2.dataset.cacheKey = '';
  }

  (document.getElementById('thumb') as HTMLImageElement).src = info.thumbnail || '';
  document.getElementById('song-title')!.textContent = info.title;
  document.getElementById('song-artist')!.textContent = info.artist;

  const cur = timeToSeconds(info.currentTime);
  const tot = timeToSeconds(info.totalTime);
  const pct = tot > 0 ? (cur / tot) * 100 : 0;
  (document.getElementById('progress-fill') as HTMLElement).style.width = `${pct}%`;
  document.getElementById('time-current')!.textContent = info.currentTime;
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
    if (lyricsEl.dataset.cacheKey !== info.lyrics.slice(0, 40)) {
      lyricsEl.innerHTML = info.lyrics;
      lyricsEl.dataset.cacheKey = info.lyrics.slice(0, 40);
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
}

document.getElementById('btn-play')!.addEventListener('click', () => sendControl('play'));
document.getElementById('btn-prev')!.addEventListener('click', () => sendControl('prev'));
document.getElementById('btn-next')!.addEventListener('click', () => sendControl('next'));

document.getElementById('lang-select')!.addEventListener('change', e => {
  const lang = (e.target as HTMLSelectElement).value;
  sendControl('setLang', { lang });
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

applyI18n();
loadColors();
refresh();
setInterval(refresh, 1000);
