# 07 · Every language

> A German passenger asks about hotel vouchers. A Hindi speaker says the rebooking desk has opened. Both are read by
> someone who speaks neither language.

## Translation, built in

Limbo uses **Nexconn's built-in translation**. Each reader picks their language (it starts from their browser's), and
messages from people writing in other languages are translated for them:

- The sender's language travels with every message: in the text message's sender info, and in the `lang` field of
  every update.
- A message is translated automatically when it is in another language, short (up to 280 characters) and recent (the
  last six hours). Anything else gets a **Translate** action, one tap away.
- Requests are batched (up to 10 per call to `translateModule.translateMessages`) and the results arrive through
  `TranslateHandler.onTranslationCompleted`.
- Each translation is cached on the device per language, so a message is never translated, or billed, twice.
- The original is always one tap away ("Translated from Hindi"). If translation fails, the original is shown with a
  quiet "Couldn't translate".
- Updates on the board are translated the same way as chat.

The code is in [`src/lib/client/room-store.ts`](../src/lib/client/room-store.ts) (`translate`, `flushTranslations`,
`maybeAutoTranslate`) and [`translation-cache.ts`](../src/lib/client/translation-cache.ts).

Twelve languages are offered: English, Hindi, Bengali, Tamil, Telugu, Marathi, Spanish, French, German, Arabic,
Chinese and Japanese. Every code was checked against Nexconn's supported-languages list.

## Talk instead of type

The microphone button uses the browser's speech recognition in the reader's own language (Hindi as `hi-IN`, Tamil as
`ta-IN`, and so on). The transcript appears in the message box to check before sending, then it is translated for
everyone else like any other message ([`Composer.tsx`](../src/components/room/Composer.tsx)).

## For tired eyes and unfamiliar phones

- **Large text**: Normal, Large and Largest, applied before the first paint so nothing jumps.
- **Dark mode** that follows the phone, or can be set by hand, for night travel.
- **Contrast**: every text colour was measured against WCAG AA (4.5:1) in both themes, and fixed where it fell short.
- **Writing direction** follows each message (`dir="auto"`), so Arabic reads right to left.
- **Touch targets**: the main controls are 40 px or more, and every control meets WCAG 2.2's 24 px minimum. Real
  buttons everywhere, labelled for screen readers, focus rings for keyboards, and no animation for people who ask
  their phone to reduce motion.
- **System fonts**: crisp on every phone, and nothing to download on weak airport Wi-Fi.

**Next:** [08 · How Nexconn is used →](../08_how_nexconn_is_used)
