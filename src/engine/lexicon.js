/**
 * Kypzer lexicon — categories, keywords (English + Hinglish) and colors.
 * Pure data + tiny helpers so it can run in the browser and in Node tests.
 */

/** v1 palette, still used for "other" tasks so unknown titles keep a stable color. */
export const PALETTE = ['#00e5ff', '#f43f5e', '#7c3aed', '#f0a840', '#3ecf8e', '#e06cd6', '#ffd166', '#5ac8fa'];

/**
 * energy: deep | active | light | rest | sleep — used by the scheduler and the analyzer.
 * defDur: default minutes when no end/duration is given and it is the last block.
 * cap: max minutes a "point" entry may stretch until the next start.
 * words: keywords; a trailing * means prefix match (padh* → padhai, padhna).
 */
export const CATEGORIES = {
  sleep: {
    label: 'Sleep', color: '#6c7cff', energy: 'sleep', defDur: 480, cap: 720, emoji: '😴',
    words: ['sleep*', 'nap', 'naps', 'bed', 'bedtime', 'so ja*', 'sona', 'neend', 'nind', 'nindiya', 'power nap'],
  },
  break: {
    label: 'Break', color: '#2dd4bf', energy: 'rest', defDur: 15, cap: 45, emoji: '☕',
    words: ['break', 'breaks', 'rest', 'relax*', 'chill', 'aaram', 'araam', 'pause', 'breather', 'tea break', 'chai break'],
  },
  fitness: {
    label: 'Fitness', color: '#3ecf8e', energy: 'active', defDur: 60, cap: 150, emoji: '🏋️',
    words: ['gym', 'workout', 'work out', 'exercise', 'run', 'running', 'jog*', 'walk', 'walking', 'yoga', 'cricket',
      'football', 'badminton', 'swim*', 'cycl*', 'sport*', 'stretch*', 'cardio', 'pushups', 'push ups', 'kasrat',
      'vyayam', 'training', 'hiit', 'basketball', 'tennis', 'dance', 'zumba', 'pilates', 'trek*', 'hike', 'hiking'],
  },
  call: {
    label: 'Call', color: '#e06cd6', energy: 'light', defDur: 30, cap: 90, emoji: '📞',
    words: ['call*', 'phone', 'video call', 'facetime', 'wife', 'husband', 'gf', 'bf', 'girlfriend', 'boyfriend', 'lavuu',
      'baat', 'whatsapp'],
  },
  meeting: {
    label: 'Meeting', color: '#f0a840', energy: 'light', defDur: 45, cap: 150, emoji: '🤝',
    words: ['meeting*', 'meet', 'standup', 'stand up', 'stand-up', 'sync', 'interview*', 'zoom', 'gmeet', 'teams',
      'discussion', 'review', 'demo', 'scrum', '1:1', 'one on one', 'presentation'],
  },
  code: {
    label: 'Code', color: '#5ac8fa', energy: 'deep', defDur: 90, cap: 240, emoji: '💻',
    words: ['code', 'coding', 'dev', 'develop*', 'programming', 'program', 'debug*', 'deploy*', 'leetcode', 'dsa',
      'hackathon', 'github', 'build', 'refactor*', 'frontend', 'backend', 'side project'],
  },
  study: {
    label: 'Study', color: '#9b6bff', energy: 'deep', defDur: 60, cap: 240, emoji: '📚',
    words: ['study*', 'studies', 'padh*', 'class', 'classes', 'lecture*', 'revision', 'revise', 'exam*', 'homework', 'hw',
      'assignment*', 'tuition', 'coaching', 'notes', 'learn*', 'course', 'school', 'college', 'test', 'mock*',
      'syllabus', 'chapter*', 'practice', 'lab', 'physics', 'chemistry', 'maths', 'math', 'biology', 'history',
      'geography', 'science', 'economics', 'accounts', 'jee', 'neet', 'upsc'],
  },
  work: {
    label: 'Work', color: '#00e5ff', energy: 'deep', defDur: 60, cap: 240, emoji: '💼',
    words: ['work', 'working', 'office', 'kaam', 'job', 'shift', 'project*', 'report*', 'client*', 'email*', 'mail*',
      'admin', 'deadline', 'ppt', 'excel', 'task*', 'duty', 'business', 'dukaan', 'deep work', 'focus', 'write',
      'writing', 'design*', 'research', 'planning', 'plan'],
  },
  food: {
    label: 'Food', color: '#ffd166', energy: 'light', defDur: 45, cap: 90, emoji: '🍽️',
    words: ['breakfast', 'lunch', 'dinner', 'brunch', 'snack*', 'khana', 'khaana', 'nashta', 'naashta', 'chai', 'tea',
      'coffee', 'eat', 'eating', 'meal*', 'food', 'tiffin', 'supper'],
  },
  chores: {
    label: 'Chores', color: '#94a3b8', energy: 'light', defDur: 45, cap: 150, emoji: '🧺',
    words: ['chore*', 'laundry', 'clean*', 'groceries', 'grocery', 'shopping', 'bank', 'errand*', 'bill*', 'cook*',
      'dishes', 'bartan', 'safai', 'kapde', 'market', 'sabzi', 'ration', 'iron*', 'repair*', 'pay rent', 'rent'],
  },
  commute: {
    label: 'Commute', color: '#fb8c3c', energy: 'light', defDur: 30, cap: 120, emoji: '🚇',
    words: ['commute', 'travel*', 'drive', 'driving', 'bus', 'metro', 'train', 'auto', 'cab', 'uber', 'ola', 'rapido',
      'go to', 'come to', 'reach*', 'return*', 'ghar ja*', 'office ja*', 'room', 'flight', 'airport', 'station',
      'leave for', 'head to', 'pickup', 'pick up', 'drop'],
  },
  mind: {
    label: 'Mind', color: '#c4a7ff', energy: 'rest', defDur: 20, cap: 90, emoji: '🧘',
    words: ['meditat*', 'pray*', 'puja', 'pooja', 'namaz', 'namaaz', 'journal*', 'read', 'reading', 'book*', 'dhyan',
      'dhyaan', 'mandir', 'temple', 'church', 'gurudwara', 'mosque', 'masjid', 'aarti', 'gratitude', 'reflect*'],
  },
  fun: {
    label: 'Fun', color: '#ff5fa2', energy: 'rest', defDur: 60, cap: 240, emoji: '🎮',
    words: ['game', 'games', 'gaming', 'pubg', 'bgmi', 'valorant', 'freefire', 'minecraft', 'movie*', 'netflix',
      'youtube', 'series', 'anime', 'music', 'song*', 'guitar', 'piano', 'instagram', 'reels', 'tv', 'fun', 'masti',
      'hobby', 'paint*', 'draw*', 'sketch*', 'podcast'],
  },
  social: {
    label: 'Social', color: '#f43f5e', energy: 'light', defDur: 90, cap: 240, emoji: '💞',
    words: ['friend*', 'family', 'party', 'date', 'hangout', 'hang out', 'dost*', 'yaar', 'mom', 'mummy', 'dad',
      'papa', 'maa', 'parents', 'kids', 'bhai', 'didi', 'wedding', 'shaadi', 'birthday', 'outing', 'visit*',
      'relatives', 'guests', 'date night'],
  },
  routine: {
    label: 'Routine', color: '#a3e635', energy: 'light', defDur: 20, cap: 60, emoji: '🌅',
    words: ['wake*', 'uth*', 'shower', 'bath', 'nahana', 'nahaana', 'naha', 'brush', 'get ready', 'ready', 'taiyar',
      'tayyar', 'skincare', 'dress', 'freshen up', 'fresh'],
  },
};

/** Order matters: first match wins ("work out" → fitness, "lunch break" → break, "call mom" → call). */
export const CATEGORY_ORDER = ['sleep', 'break', 'fitness', 'call', 'meeting', 'code', 'study', 'work', 'food',
  'chores', 'commute', 'mind', 'fun', 'social', 'routine'];

export const OTHER = { label: 'Task', energy: 'light', defDur: 45, cap: 180, emoji: '📌' };

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordToRe(w) {
  const prefix = w.endsWith('*');
  const core = escapeRe(prefix ? w.slice(0, -1) : w).replace(/\s+/g, '\\s+');
  return prefix ? core + '[a-z]*' : core;
}

const CATEGORY_RES = CATEGORY_ORDER.map((id) => ({
  id,
  re: new RegExp('(?:^|[^a-z0-9])(?:' + CATEGORIES[id].words.map(wordToRe).join('|') + ')(?![a-z0-9])', 'i'),
}));

/** Category id for a free-text title ("other" when nothing matches). */
export function categorize(title) {
  const t = String(title || '').toLowerCase();
  if (!t.trim()) return 'other';
  for (const { id, re } of CATEGORY_RES) {
    if (re.test(t)) return id;
  }
  return 'other';
}

export function hashColor(str) {
  let h = 0;
  const s = String(str || '').toLowerCase();
  for (let i = 0; i < s.length; i++) h = (s.charCodeAt(i) + ((h << 5) - h)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/** Full metadata for a category id; "other" gets a hashed color from the title. */
export function categoryInfo(id, title = '') {
  if (id && CATEGORIES[id]) return { id, ...CATEGORIES[id] };
  return { id: 'other', ...OTHER, color: hashColor(title) };
}

export const ENERGY_TYPES = ['deep', 'active', 'light', 'rest', 'sleep'];

/** Meal detection is keyword based so "lunch break" still counts as lunch. */
export const MEAL_WORDS = {
  breakfast: /\b(breakfast|nashta|naashta|brunch)\b/i,
  lunch: /\b(lunch|brunch|tiffin)\b/i,
  dinner: /\b(dinner|supper)\b/i,
  any: /\b(breakfast|lunch|dinner|brunch|khana|khaana|nashta|naashta|meal|meals|eat|eating|food|tiffin|supper)\b/i,
};
