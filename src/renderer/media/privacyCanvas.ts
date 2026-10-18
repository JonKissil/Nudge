import type { CapturePolicy } from '../../shared/privacy'

/** Only a window source is drawn. Black display padding preserves OCR/overlay coordinates. */
export function paintPrivateFrame(canvas: OffscreenCanvas, video: HTMLVideoElement,
  policy: CapturePolicy, width: number): void {
  const scale = width / policy.display.width
  canvas.width = width
  canvas.height = Math.max(1, Math.round(policy.display.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(video, (policy.window.x - policy.display.x) * scale,
    (policy.window.y - policy.display.y) * scale, policy.window.width * scale, policy.window.height * scale)
  for (const mask of policy.masks) context.fillRect(Math.floor(mask.x * canvas.width), Math.floor(mask.y * canvas.height),
    Math.ceil(mask.w * canvas.width) + 1, Math.ceil(mask.h * canvas.height) + 1)
}
