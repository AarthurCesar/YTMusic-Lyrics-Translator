const DEFAULT_ORIG  = '#ffffff';
const DEFAULT_TRANS = '#7a7a7a';

async function loadColors() {
  const data = await chrome.storage.local.get('lyricsColors');
  const c = (data['lyricsColors'] as { orig?: string; trans?: string }) || {};
  (document.getElementById('color-orig') as HTMLInputElement).value  = c.orig  ?? DEFAULT_ORIG;
  (document.getElementById('color-trans') as HTMLInputElement).value = c.trans ?? DEFAULT_TRANS;
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
  if (info.lyrics) {
    if (lyricsEl.dataset.cacheKey !== info.lyrics.slice(0, 40)) {
      lyricsEl.innerHTML = info.lyrics;
      lyricsEl.dataset.cacheKey = info.lyrics.slice(0, 40);
    }
  } else {
    lyricsEl.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:12px;text-align:center;padding:20px 0">Sem letra disponível</div>';
    lyricsEl.dataset.cacheKey = '';
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
document.getElementById('btn-reset-colors')!.addEventListener('click', async () => {
  await chrome.storage.local.set({ lyricsColors: { orig: DEFAULT_ORIG, trans: DEFAULT_TRANS } });
  (document.getElementById('color-orig')  as HTMLInputElement).value = DEFAULT_ORIG;
  (document.getElementById('color-trans') as HTMLInputElement).value = DEFAULT_TRANS;
});

loadColors();
refresh();
setInterval(refresh, 1000);
