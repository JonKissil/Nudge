# Gorilla mascot

The Gorilla theme uses the supplied assets directly, without regenerating, resizing, or
combining them:

- `gorilla1.png`: closed-mouth frame; home page, brand, theme picker, and idle nudge mascot.
- `gorilla2.png`: open-mouth frame; alternates with `gorilla1.png` while Nudge speaks.

Both PNGs are 256 × 256 with transparency. The overlay displays them at 128 × 128 (64 × 64
on narrow displays), with pixelated scaling. Both images load together; visibility switches
every 240ms so transparent parts of one frame never show the other underneath.

Generation completion, interruption, reconnect/disconnect, or End restores the closed frame.
Warmup and captions alone do not animate it. Reduced motion uses the static closed frame.
The Settings nudge preview demonstrates both frames. The previously generated assets are
no longer referenced.
