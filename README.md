# YTMusic Lyrics Translator

Extensão para Opera/Chrome que exibe a letra das músicas do **YouTube Music** com tradução em tempo real — linha por linha, original em cima e tradução em baixo.

## ✨ Funcionalidades

- Tradução automática da letra diretamente no painel do YouTube Music
- Suporte a 6 idiomas: Português, English, Español, Français, Deutsch, 日本語
- Popup com mini player: capa, título, artista, progresso, play/pause/anterior/próxima
- Personalização de cores da letra e da tradução
- Funciona em qualquer aba (popup) sem precisar estar no YouTube Music

## 📦 Instalação (modo descompactado)

1. Baixe ou clone este repositório
2. Instale as dependências e faça o build:
   ```bash
   npm install
   npm run build
   ```
3. Abra `opera://extensions` (ou `chrome://extensions`)
4. Ative o **Modo de desenvolvedor**
5. Clique em **Carregar extensão descompactada** e selecione a pasta `dist/`

## 🛠️ Desenvolvimento

```bash
npm install       # instala dependências
npm run build     # compila para dist/
```

Arquivos principais:
- `src/content.ts` — lógica de tradução e injeção na página
- `src/popup.ts` — lógica do popup (player + configurações)
- `public/popup.html` — interface do popup

## 🌐 Idiomas suportados

| Código | Idioma     |
|--------|------------|
| pt     | Português  |
| en     | English    |
| es     | Español    |
| fr     | Français   |
| de     | Deutsch    |
| ja     | 日本語      |

## 📄 Licença

MIT
