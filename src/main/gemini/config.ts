import { buildSystemInstruction } from './prompts'
import type { LiveSessionContext } from './types'

// SDK enum values and tool declarations are attached in liveClient.ts so that it
// remains the only module importing @google/genai.
export function buildLiveConfig(context: LiveSessionContext, handle?: string) {
  return {
    systemInstruction: buildSystemInstruction(context),
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: { handle },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
  }
}
