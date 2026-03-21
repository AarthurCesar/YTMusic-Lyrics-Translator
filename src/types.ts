export interface SongInfo {
  videoId: string;
  title: string;
  artist: string;
}

export interface LyricLine {
  original: string;
  translation: string;
}

export interface LyricsData {
  song: SongInfo;
  lines: LyricLine[];
}

export type MessageToBackground =
  | { type: 'FETCH_LYRICS'; payload: SongInfo };

export type MessageToContent =
  | { type: 'LYRICS_RESULT'; payload: LyricsData }
  | { type: 'LYRICS_ERROR'; payload: string }
  | { type: 'LYRICS_LOADING' };
