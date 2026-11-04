/**
 * Words that say nothing about a fact's topic, in the languages beyond English (V2 #7 multilingual
 * memory, dev plan Phase 4). Without them, any two Hinglish facts would look related because both say
 * "hai", "ke liye", "change mat karna".
 *
 * Only non-English words are listed, so English word matching does not change (the English stop words
 * stay where they were). Words a common English prompt uses with a meaning ("have", "go", "os", "pan") are left out.
 * Lowercase, NFC.
 */

/** Single words of the lock phrases in fact-extractor.ts (the English ones are already stop words). */
export const MULTILINGUAL_LOCK_WORDS: readonly string[] = [
  // Hindi / Hinglish
  'फ़ैसला', 'फैसला', 'पक्का', 'नियम', 'निर्णय', 'अंतिम', 'फ़ाइनल', 'बदलना', 'faisla', 'pakka', 'niyam', 'badalna', 'chhedna', 'chedna',
  // Gujarati / Gujlish
  'નિર્ણય', 'નિયમ', 'પાકો', 'અંતિમ', 'ફાઇનલ', 'બદલવાનું', 'બદલશો', 'nirnay', 'pako', 'badalvanu', 'badalso',
  // Spanish / Portuguese
  'decidido', 'definitivo', 'decisión', 'decisão', 'decisao', 'cambia', 'cambien', 'cambies', 'mexam', 'mexa', 'nisso', 'muda',
  // Swahili / Sheng
  'uamuzi', 'mwisho', 'imeamuliwa', 'usibadilishe', 'msibadilishe', 'msiibadilishe', 'usiguze', 'msiguze',
  // Hausa
  'yanke', 'shawara', 'ƙarshe', 'karshe', 'canza',
  // Amharic
  'የመጨረሻ', 'ውሳኔ', 'አትቀይሩት', 'አትቀይረው',
];

/** Grammar words of Hindi, Hinglish, Gujarati and Gujlish (the user's own forms, team-checked). */
export const MULTILINGUAL_FILLER_WORDS: readonly string[] = [
  // Hindi (Devanagari)
  'यह', 'ये', 'है', 'हैं', 'था', 'थी', 'के', 'की', 'का', 'को', 'से', 'में', 'पर', 'और', 'भी', 'ही', 'तो', 'हो', 'कर',
  'करना', 'करो', 'करें', 'करेंगे', 'नहीं', 'मत', 'लिए', 'सिर्फ़', 'सिर्फ', 'इसे', 'इस', 'इसको', 'रहेगा', 'रहेगी', 'होगा',
  'होगी', 'होंगी', 'होंगे', 'जाएगा', 'वाला', 'वाले', 'सब', 'सारी', 'हर', 'अब', 'मुझे', 'हमें', 'चाहिए',
  // Hinglish
  'ye', 'yeh', 'hai', 'hain', 'tha', 'thi', 'ke', 'ki', 'ka', 'ko', 'se', 'me', 'mein', 'pe', 'aur', 'bhi', 'hi', 'toh',
  'ho', 'kar', 'karo', 'karna', 'karenge', 'nahi', 'nahin', 'mat', 'liye', 'sirf', 'isko', 'iske', 'isse', 'rahega',
  'rahegi', 'hoga', 'hogi', 'hongi', 'jayega', 'wala', 'wale', 'wali', 'sab', 'saari', 'har', 'ab', 'bhai', 'mujhe',
  'chahiye', 'kya',
  // Gujarati (script)
  'આ', 'છે', 'હતું', 'હતી', 'ના', 'ની', 'નું', 'નો', 'ને', 'થી', 'માં', 'માટે', 'પર', 'અને', 'પણ', 'જ', 'તો', 'કર',
  'કરો', 'કરવું', 'કરવાનું', 'નથી', 'નહીં', 'ન', 'ફક્ત', 'રહેશે', 'થશે', 'જશે', 'બધી', 'બધા', 'દરેક', 'હવે', 'મને',
  'જોઈએ',
  // Gujlish
  'aa', 'che', 'chhe', 'hatu', 'na', 'ni', 'nu', 'ne', 'thi', 'ma', 'mate', 'par', 'ane', 'j', 'karo', 'karvu',
  'karvanu', 'nathi', 'fakt', 'rahese', 'thase', 'jase', 'badhi', 'badha', 'darek', 'mane', 'joie', 'shu',
];

/** Lock words + grammar words: never evidence that two texts share a topic. */
export const MULTILINGUAL_STOP_WORDS: ReadonlySet<string> = new Set(
  [...MULTILINGUAL_LOCK_WORDS, ...MULTILINGUAL_FILLER_WORDS].map((w) => w.normalize('NFC').toLowerCase()),
);
