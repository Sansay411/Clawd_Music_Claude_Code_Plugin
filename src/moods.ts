// Mood keywords for /music mood, the mood input and the mood chips. Matching
// is substring based over lowercase text, English and Russian. A group that
// matches adds its genre weights once. Russian inflection breaks substrings
// (for example 'сон' does not match 'сну'); the keywords list the common forms.

export type MoodGroup = {
  words: readonly string[]
  genres: Readonly<Record<string, number>>
}

export const MOOD_TABLE: readonly MoodGroup[] = [
  {
    words: ['focus', 'фокус', 'study', 'studying', 'учеб', 'учи', 'deep work', 'concentrat', 'концентр'],
    genres: { lofi: 3, ambient: 2, classical: 2, electronic: 1 },
  },
  {
    words: ['work', 'работ', 'code', 'coding', 'код', 'program', 'программ', 'debug', 'отлад'],
    genres: { lofi: 2, ambient: 2, classical: 1, electronic: 1 },
  },
  {
    words: ['chill', 'relax', 'calm', 'easy', 'спокой', 'расслаб', 'отдых', 'тихо', 'quiet', 'мягк'],
    genres: { ambient: 3, lofi: 2, lounge: 2, jazz: 1 },
  },
  {
    words: ['rain', 'дожд', 'storm', 'гроз', 'cozy', 'уют'],
    genres: { lofi: 2, ambient: 2, jazz: 1 },
  },
  {
    words: ['late', 'night', 'ночь', 'ночн', 'поздн', 'midnight', 'полноч'],
    genres: { synthwave: 3, electronic: 2, lounge: 2, jazz: 1 },
  },
  {
    words: ['sleep', 'сон', 'спат', 'спать', 'drift', 'bed'],
    genres: { ambient: 3, classical: 2 },
  },
  {
    words: ['energy', 'energ', 'hype', 'workout', 'gym', 'драйв', 'энерг', 'бодр', 'активн', 'power', 'спорт'],
    genres: { electronic: 3, synthwave: 2, indie: 2 },
  },
  {
    words: ['dance', 'party', 'танц', 'вечерин', 'клуб', 'club'],
    genres: { electronic: 3, synthwave: 2 },
  },
  {
    words: ['happy', 'fun', 'sunny', 'весел', 'радост', 'счаст', 'солнеч', 'bright', 'upbeat'],
    genres: { indie: 3, jazz: 1 },
  },
  {
    words: ['sad', 'melanch', 'грус', 'печал', 'тоск'],
    genres: { classical: 3, ambient: 2 },
  },
  {
    words: ['coffee', 'morning', 'кофе', 'утр', 'breakfast', 'завтрак', 'cafe', 'кафе'],
    genres: { jazz: 3, lounge: 2, indie: 1 },
  },
  {
    words: ['retro', 'ретро', '80s', 'neon', 'неон', 'synth', 'синт'],
    genres: { synthwave: 3, electronic: 1 },
  },
  {
    words: ['piano', 'пиан', 'classic', 'класс', 'orchestra', 'оркестр', 'symphon', 'симфон'],
    genres: { classical: 3 },
  },
  {
    words: ['space', 'космос', 'космич', 'dream', 'мечт', 'drone'],
    genres: { ambient: 3, electronic: 1 },
  },
  {
    words: ['jazz', 'джаз', 'bossa', 'босса'],
    genres: { jazz: 3, lounge: 1 },
  },
  {
    words: ['lounge', 'лаунж'],
    genres: { lounge: 3, jazz: 1 },
  },
  {
    words: ['indie', 'инди', 'folk', 'фолк', 'acoustic', 'акуст', 'guitar', 'гитар'],
    genres: { indie: 3 },
  },
  {
    words: ['lofi', 'lo-fi', 'лоуфай'],
    genres: { lofi: 3 },
  },
]

// Summed genre scores for a text. Empty object when nothing matches.
export function scoreMood(text: string): Record<string, number> {
  const lower = text.trim().toLowerCase()
  const scores: Record<string, number> = {}
  if (!lower) return scores
  for (const group of MOOD_TABLE) {
    if (!group.words.some(word => lower.includes(word))) continue
    for (const [genre, weight] of Object.entries(group.genres)) {
      scores[genre] = (scores[genre] ?? 0) + weight
    }
  }
  return scores
}

// The top-scoring genre, picked at random among ties and never the last genre
// when another tie is available. `matched` is false when no keyword matched;
// the caller then picks a vibe.
export function pickMoodGenre(
  text: string,
  lastGenre: string | null,
  rand: number,
  available?: readonly string[],
): { genre: string | null; matched: boolean } {
  const scores = scoreMood(text)
  // With the catalog's genre names, only genres the config still lists can win.
  const entries = Object.entries(scores).filter(([genre]) => available === undefined || available.includes(genre))
  if (entries.length === 0) return { genre: null, matched: false }
  const top = Math.max(...entries.map(([, score]) => score))
  let candidates = entries.filter(([, score]) => score === top).map(([genre]) => genre)
  const others = candidates.filter(genre => genre !== lastGenre)
  if (others.length > 0) candidates = others
  const index = Math.min(Math.max(Math.floor(rand * candidates.length), 0), candidates.length - 1)
  return { genre: candidates[index] ?? null, matched: true }
}
