// The built-in copy of config/sources.yml. The catalog is read from that file
// at session start (parseSources in catalog.ts); this copy stands in only when
// the file cannot be read, and it supplies the genre tones. It must match the
// file: tests/catalog.test.ts parses the file's text and compares the two.
// Genres keep the file's order; commented-out stations are left out, as the
// file leaves them out.

import type { CatalogGenre } from '../types'

export const CATALOG_DATA: CatalogGenre[] = [
  {
    name: 'lofi',
    tone: '#C9899B',
    stations: [
      { name: 'Lofi Girl', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk', kind: 'youtube' },
      { name: 'Chillhop Music', url: 'https://www.youtube.com/watch?v=5yx6BWlEVcY', kind: 'youtube' },
    ],
  },
  {
    name: 'jazz',
    tone: '#D9A441',
    stations: [
      { name: 'Coffee Shop Radio', url: 'https://www.youtube.com/watch?v=VMAPTo7RVCo', kind: 'youtube' },
      { name: 'SomaFM - Fluid', url: 'http://ice4.somafm.com/fluid-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Bossa Beyond', url: 'http://ice4.somafm.com/bossa-128-mp3', kind: 'direct' },
      { name: 'WDCB Jazz', url: 'http://wdcb-ice.streamguys.org:80/wdcb128', kind: 'direct' },
    ],
  },
  {
    name: 'classical',
    tone: '#E9E2D0',
    stations: [
      {
        name: 'Classical Piano Music & Fireplace 24/7 - Mozart, Chopin, Beethoven, Bach, Grieg, Schumann, Satie',
        url: 'https://www.youtube.com/watch?v=y6TZHLAzg5o',
        kind: 'youtube',
      },
      { name: 'All Classical Portland', url: 'http://allclassical-ice.streamguys.com/ac96kmp3', kind: 'direct' },
      { name: 'France Musique', url: 'http://direct.francemusique.fr/live/francemusique-midfi.mp3', kind: 'direct' },
    ],
  },
  {
    name: 'ambient',
    tone: '#6FA8A3',
    stations: [
      { name: 'SomaFM - Groove Salad', url: 'http://ice2.somafm.com/groovesalad-128-mp3', kind: 'direct' },
      { name: 'Relaxing Ambient', url: 'https://www.youtube.com/watch?v=S_MOd40zlYU', kind: 'youtube' },
      { name: 'SomaFM - Drone Zone', url: 'http://ice2.somafm.com/dronezone-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Deep Space One', url: 'http://ice4.somafm.com/deepspaceone-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Mission Control', url: 'http://ice2.somafm.com/missioncontrol-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Dark Zone', url: 'http://ice2.somafm.com/darkzone-128-mp3', kind: 'direct' },
      { name: 'Stereoscenic Ambient', url: 'http://radio.stereoscenic.com/asp-h', kind: 'direct' },
    ],
  },
  {
    name: 'electronic',
    tone: '#5B8FD9',
    stations: [
      { name: 'SomaFM - Beat Blender', url: 'http://ice2.somafm.com/beatblender-128-mp3', kind: 'direct' },
      { name: 'SomaFM - The Trip', url: 'http://ice2.somafm.com/thetrip-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Cliqhop IDM', url: 'http://ice2.somafm.com/cliqhop-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Dub Step Beyond', url: 'http://ice2.somafm.com/dubstep-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Suburbs of Goa', url: 'http://ice2.somafm.com/suburbsofgoa-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Groove Salad Classic', url: 'http://ice2.somafm.com/gsclassic-128-mp3', kind: 'direct' },
    ],
  },
  {
    name: 'synthwave',
    tone: '#B65FC9',
    stations: [
      { name: 'Synthwave Radio', url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY', kind: 'youtube' },
      { name: 'Nightwave Plaza', url: 'http://radio.plaza.one/mp3', kind: 'direct' },
      { name: 'SomaFM - Synphaera', url: 'http://ice2.somafm.com/synphaera-128-mp3', kind: 'direct' },
    ],
  },
  {
    name: 'lounge',
    tone: '#C07A4F',
    stations: [
      { name: 'SomaFM - Secret Agent', url: 'http://ice2.somafm.com/secretagent-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Illinois Street Lounge', url: 'http://ice2.somafm.com/illstreet-128-mp3', kind: 'direct' },
    ],
  },
  {
    name: 'indie',
    tone: '#8DB05A',
    stations: [
      { name: 'SomaFM - Lush', url: 'http://ice2.somafm.com/lush-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Indie Pop Rocks', url: 'http://ice2.somafm.com/indiepop-128-mp3', kind: 'direct' },
      { name: 'SomaFM - Folk Forward', url: 'http://ice2.somafm.com/folkfwd-128-mp3', kind: 'direct' },
      { name: 'SomaFM - BAGeL Radio', url: 'http://ice2.somafm.com/bagel-128-mp3', kind: 'direct' },
    ],
  },
]

// No local loops ship with the repo (no audio of unknown origin); a genre with no
// working stream reports an error. Add assets/<genre>_fallback.mp3 and list the genre here to enable one.
export const FALLBACK_GENRES: readonly string[] = []

// Typed alias map for /music play edm and similar.
export const GENRE_ALIASES: Readonly<Record<string, string>> = {
  edm: 'electronic',
  dance: 'electronic',
  synth: 'synthwave',
  ambience: 'ambient',
}
