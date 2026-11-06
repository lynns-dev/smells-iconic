// The SMS marketing disclosure shown next to every text opt-in, and saved
// with each opt-in (lib/email/smsStore.js) — SMS marketing law (TCPA)
// puts the burden of proving consent on the sender. Kept in its own file
// with no server imports so checkout can show the exact same words.
export const SMS_CONSENT_TEXT =
  'By entering your number, you agree to receive recurring automated marketing text messages from Smells Iconic at this number. '
  + 'Consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. '
  + 'Reply STOP to cancel, HELP for help.';
