# Privacy Policy — YTMusic Lyrics Translator

**Last updated:** 2026-03-22

## Overview

YTMusic Lyrics Translator is a browser extension that displays song lyrics and translations in real time on YouTube Music. This policy explains what data the extension accesses, how it is used, and your rights.

## Data Collection

This extension **does not collect, store, or transmit any personal data** to our own servers. We do not have any backend or analytics infrastructure.

### Data Accessed Locally

The extension reads the following information **only from the active YouTube Music tab**:

- **Song metadata**: title, artist name, album art URL, and playback progress — used solely to fetch matching lyrics and display the mini player.
- **User preferences**: display colors, font sizes, translation language, and display mode — stored locally via `chrome.storage.local` and never transmitted externally.

All locally stored data remains on your device and is never sent to any server we operate.

## Third-Party Services

To provide lyrics and translations, the extension sends **song title and artist name** (not personal data) to the following third-party APIs:

| Service | Purpose | Data Sent | Privacy Policy |
|---------|---------|-----------|----------------|
| **YouTube Music API** | Fetch original lyrics from YouTube | Video ID (already in the page URL) | [Google Privacy Policy](https://policies.google.com/privacy) |
| **LRCLib** (lrclib.net) | Fetch synced/timed lyrics | Song title + artist name | [LRCLib](https://lrclib.net) |
| **Genius** (genius.com) | Fetch plain lyrics (fallback) | Song title + artist name | [Genius Privacy Policy](https://genius.com/static/privacy_policy) |
| **Letras.com** (letras.com) | Fetch plain lyrics (fallback) | Song title + artist name (via URL slug) | [Letras.com Privacy Policy](https://www.letras.com/privacy) |
| **Google Translate** (translate.googleapis.com) | Translate lyrics text | Lyrics text + target language | [Google Privacy Policy](https://policies.google.com/privacy) |

### Important Notes

- **No personal information** (name, email, browsing history, IP address) is ever collected or transmitted by this extension.
- Song metadata sent to third-party services is limited to what is already publicly visible on the YouTube Music page.
- The extension does not use cookies, tracking pixels, or analytics of any kind.
- The extension does not inject ads or affiliate links.

## Data Storage

- All user preferences are stored locally on your device using Chrome's `chrome.storage.local` API.
- No data is stored on external servers.
- You can clear all stored data by removing the extension.

## Permissions Justification

| Permission | Reason |
|-----------|--------|
| `storage` | Save user preferences (colors, font sizes, language) locally |
| `scripting` | Re-inject content script into already-open YouTube Music tabs |
| `tabs` | Detect active YouTube Music tabs for script injection |
| `windows` | Create detachable popup/mini player window |
| `host_permissions` | Access YouTube Music page content and fetch lyrics/translations from listed APIs |

## Children's Privacy

This extension is not directed at children under 13 and does not knowingly collect data from children.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last updated" date above.

## Contact

If you have questions about this privacy policy, please open an issue at:
https://github.com/AarthurCesar/YTMusic-Lyrics-Translator/issues
