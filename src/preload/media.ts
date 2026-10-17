import { contextBridge } from 'electron'
import type { MediaApi } from '../shared/bridge'
import { IPC, IpcSchemas } from '../shared/ipc'
import { send, subscribe } from './index'

const api: MediaApi = {
  kind: 'media',
  sendFrame: (frame) => send(IPC.frame, frame),
  sendFullFrame: (frame) => send(IPC.frameFull, frame),
  sendMicChunk: (chunk) => send(IPC.micChunk, chunk),
  onMicSet: (listener) => subscribe(IPC.micSet, IpcSchemas[IPC.micSet], listener),
  onAudioPlay: (listener) => subscribe(IPC.audioPlay, IpcSchemas[IPC.audioPlay], listener),
  onAudioFlush: (listener) => subscribe(IPC.audioFlush, IpcSchemas[IPC.audioFlush], listener),
  onAudioReset: (listener) => subscribe(IPC.audioReset, IpcSchemas[IPC.audioReset], listener),
  onAudioChime: (listener) => subscribe(IPC.audioChime, IpcSchemas[IPC.audioChime], listener),
  onFullFrameRequest: (listener) => subscribe(IPC.frameRequestFull, IpcSchemas[IPC.frameRequestFull], listener),
  onCaptureSet: (listener) => subscribe(IPC.captureSet, IpcSchemas[IPC.captureSet], listener),
  sendCaptureStatus: (status) => send(IPC.captureStatus, status),
  onMicTestStart: (listener) => subscribe(IPC.micTestStart, IpcSchemas[IPC.micTestStart], listener),
  sendMicTestResult: (result) => send(IPC.micTestResult, result),
  ready: () => send(IPC.mediaReady, {}),
}
contextBridge.exposeInMainWorld('nudge', api)
