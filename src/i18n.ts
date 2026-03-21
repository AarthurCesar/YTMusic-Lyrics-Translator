export const SUPPORTED_LANGS = ['pt', 'en', 'es', 'fr', 'de', 'ja'];

export const translations: Record<string, Record<string, string>> = {
  pt: {
    font_size_orig:  'Tamanho letra original',
    font_size_trans: 'Tamanho tradução',
    no_song:       'Abra o YouTube Music\ne toque uma música',
    trans_label:   'Tradução:',
    orig_color:    'Cor da letra original',
    trans_color:   'Cor da tradução',
    show_orig:     'Mostrar letra original',
    show_trans:    'Mostrar tradução',
    reset:         '↺ Restaurar padrão',
    no_lyrics:     'Sem letra disponível',
    settings:      'Configurações',
    translating:   '⏳ Traduzindo...',
  },
  en: {
    font_size_orig:  'Original lyrics size',
    font_size_trans: 'Translation size',
    no_song:       'Open YouTube Music\nand play a song',
    trans_label:   'Translation:',
    orig_color:    'Original lyrics color',
    trans_color:   'Translation color',
    show_orig:     'Show original lyrics',
    show_trans:    'Show translation',
    reset:         '↺ Reset to default',
    no_lyrics:     'No lyrics available',
    settings:      'Settings',
    translating:   '⏳ Translating...',
  },
  es: {
    font_size_orig:  'Tamaño letra original',
    font_size_trans: 'Tamaño traducción',
    no_song:       'Abre YouTube Music\ny reproduce una canción',
    trans_label:   'Traducción:',
    orig_color:    'Color de la letra original',
    trans_color:   'Color de la traducción',
    show_orig:     'Mostrar letra original',
    show_trans:    'Mostrar traducción',
    reset:         '↺ Restablecer',
    no_lyrics:     'Sin letra disponible',
    settings:      'Configuración',
    translating:   '⏳ Traduciendo...',
  },
  fr: {
    font_size_orig:  'Taille des paroles originales',
    font_size_trans: 'Taille de la traduction',
    no_song:       'Ouvrez YouTube Music\net lisez une chanson',
    trans_label:   'Traduction :',
    orig_color:    'Couleur des paroles originales',
    trans_color:   'Couleur de la traduction',
    show_orig:     'Afficher les paroles originales',
    show_trans:    'Afficher la traduction',
    reset:         '↺ Restaurer par défaut',
    no_lyrics:     'Pas de paroles disponibles',
    settings:      'Paramètres',
    translating:   '⏳ Traduction en cours...',
  },
  de: {
    font_size_orig:  'Schriftgröße Originaltext',
    font_size_trans: 'Schriftgröße Übersetzung',
    no_song:       'Öffne YouTube Music\nund spiele einen Song',
    trans_label:   'Übersetzung:',
    orig_color:    'Farbe des Originaltexts',
    trans_color:   'Farbe der Übersetzung',
    show_orig:     'Originaltext anzeigen',
    show_trans:    'Übersetzung anzeigen',
    reset:         '↺ Standard wiederherstellen',
    no_lyrics:     'Keine Liedtexte verfügbar',
    settings:      'Einstellungen',
    translating:   '⏳ Übersetzung...',
  },
  ja: {
    font_size_orig:  '元の歌詞のサイズ',
    font_size_trans: '翻訳のサイズ',
    no_song:       'YouTube Musicを開いて\n曲を再生してください',
    trans_label:   '翻訳：',
    orig_color:    '元の歌詞の色',
    trans_color:   '翻訳の色',
    show_orig:     '元の歌詞を表示',
    show_trans:    '翻訳を表示',
    reset:         '↺ デフォルトに戻す',
    no_lyrics:     '歌詞がありません',
    settings:      '設定',
    translating:   '⏳ 翻訳中...',
  },
};

export function getUILang(): string {
  const raw = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.())
    || navigator.language
    || 'en';
  const lang = raw.split('-')[0].toLowerCase();
  return SUPPORTED_LANGS.includes(lang) ? lang : 'en';
}

export function t(key: string): string {
  const lang = getUILang();
  return translations[lang]?.[key] ?? translations['en'][key] ?? key;
}
