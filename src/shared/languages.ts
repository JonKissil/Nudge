import { z } from 'zod'

export const LANGUAGE_CODES = ['en', 'es', 'fr', 'de', 'pt-BR', 'hi', 'ja', 'ko', 'zh-Hans', 'ar'] as const
export const LanguageCodeSchema = z.enum(LANGUAGE_CODES)
export type LanguageCode = z.infer<typeof LanguageCodeSchema>

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', 'pt-BR': 'Portuguese (Brazil)',
  hi: 'Hindi', ja: 'Japanese', ko: 'Korean', 'zh-Hans': 'Chinese (Simplified)', ar: 'Arabic',
}

export const LANGUAGE_NATIVE_NAMES: Record<LanguageCode, string> = {
  en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', 'pt-BR': 'Português (Brasil)',
  hi: 'हिन्दी', ja: '日本語', ko: '한국어', 'zh-Hans': '简体中文', ar: 'العربية',
}
