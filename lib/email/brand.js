// Which store this email setup belongs to. Everything else in lib/email/
// was copied from the Anese repo — only this file, automationsStore.js's
// starter flows and leadsSync.js differ per store.
export const BRAND = {
  id: 'smells-iconic',
  name: 'Smells Iconic',
  siteUrl: 'https://smellsiconic.com',
  // No image logo yet — lib/email/emailBlocks.js shows the text wordmark
  // (the same "SMELLS — ICONIC" header the abandoned-checkout email uses)
  // until one is set in admin → Email → Settings.
  logoUrl: '',
  wordmark: 'SMELLS — ICONIC',
  tagline: 'Bottled cultural moments.',
  // The sender the abandoned-checkout email already uses (lib/abandonedCheckout.js),
  // so every email from the store comes from the same address by default.
  defaultFrom: 'Smells Iconic <hello@smellsiconic.com>',
  replyTo: 'hello@smellsiconic.com',
  legacyLogoUrls: [],
  // The other stores' branding — see lib/email/brandRepair.js.
  foreignMarkers: [/aneseskin/i, /\bANESE\b/, /veilpuff/i, /\bVEIL\b/],
};
