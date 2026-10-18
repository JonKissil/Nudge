import { z } from 'zod'

const unit = z.number().min(0).max(1)
export const PrivacyMaskSchema = z.strictObject({ x: unit, y: unit, w: unit.positive(), h: unit.positive() })
  .refine((box) => box.x + box.w <= 1.000001 && box.y + box.h <= 1.000001, 'Keep the area inside the display')
export const DomainSchema = z.string().trim().toLowerCase().min(1).max(253).refine((value) => {
  try {
    return new URL(`https://${value}`).hostname === value
      && value.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
  } catch { return false }
}, 'Enter a hostname, such as example.com')
const apps = z.array(z.string().trim().min(1).max(200)).max(100)
const domains = z.array(DomainSchema).max(100)
export const PrivacySettingsSchema = z.strictObject({
  approvedOnly: z.boolean(), shareBrowserContent: z.boolean(),
  excludedApps: apps, excludedDomains: domains, approvedApps: apps, approvedDomains: domains,
  masks: z.array(PrivacyMaskSchema).max(20),
})
export type PrivacySettings = z.infer<typeof PrivacySettingsSchema>
export const defaultPrivacySettings = (): PrivacySettings => ({ approvedOnly: true, shareBrowserContent: false,
  excludedApps: [], excludedDomains: [], approvedApps: [], approvedDomains: [], masks: [] })
export const PrivacyStateSchema = z.strictObject({
  revision: z.number().int().nonnegative(), sharing: z.boolean(),
  reason: z.enum(['sharing', 'unknown', 'excluded-app', 'excluded-site', 'unapproved', 'browser-disabled', 'paused']),
})
export type PrivacyState = z.infer<typeof PrivacyStateSchema>
const bounds = z.strictObject({ x: z.number().finite(), y: z.number().finite(), width: z.number().positive(), height: z.number().positive() })
export const CapturePolicySchema = z.strictObject({
  revision: z.number().int().nonnegative(), windowId: z.number().int().positive(),
  window: bounds, display: bounds, scaleFactor: z.number().positive(), masks: z.array(PrivacyMaskSchema).max(24),
})
export type CapturePolicy = z.infer<typeof CapturePolicySchema>
export const PRIVACY_MESSAGES: Record<PrivacyState['reason'], string> = {
  sharing: 'Sharing approved content with Gemini', unknown: 'Sharing stopped: window unavailable',
  'excluded-app': 'Sharing stopped for an excluded app', 'excluded-site': 'Sharing stopped for an excluded site',
  unapproved: 'Sharing stopped: source needs approval', 'browser-disabled': 'Browser sharing is off', paused: 'Sharing paused',
}
