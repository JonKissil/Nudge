import { buildSystemInstruction } from './prompts'
import type { LiveSessionContext } from './types'
import type { LanguageCode } from '../../shared/languages'

// SDK enum values and tool declarations are attached in liveClient.ts so that it
// remains the only module importing @google/genai.
export function buildLiveConfig(context?: LiveSessionContext, handle?: string, language: LanguageCode = context?.language ?? 'en') {
  return {
    systemInstruction: buildSystemInstruction(context, language),
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: { handle },
    inputAudioTranscription: { languageCodes: [language] },
    outputAudioTranscription: {},
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
  }
}
