// Keeps another store's branding out of this store's email. Both stores
// share this email system, and the one-time import from the old email
// app (which was set up for one store) could copy one store's automations,
// sender settings and campaigns into the other. Anything carrying the
// other brand's markers (lib/email/brand.js foreignMarkers) is repaired
// when it's read: automations get this store's own starter copy back
// (keeping each flow's on/off switch), sender/logo fields are cleared
// back to this store's defaults, and a not-yet-sent campaign is
// unscheduled instead of going out to the wrong list.
import { BRAND } from './brand';

export function looksForeign(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return (BRAND.foreignMarkers || []).some((marker) => marker.test(text));
}

export function repairFlows(flows, seeds) {
  let changed = false;
  const repaired = flows.map((flow) => {
    if (!looksForeign(flow)) return flow;
    changed = true;
    const seed = seeds.find((s) => s.id === flow.id);
    if (!seed) return { ...flow, enabled: false };
    return { ...seed, enabled: Boolean(flow.enabled) };
  });
  return { flows: repaired, changed };
}

const SETTINGS_DEFAULTS = () => ({
  senderEmail: '',
  senderName: '',
  companyName: BRAND.name,
  logoUrl: BRAND.logoUrl || '',
  physicalAddress: '',
});

export function repairSettings(settings) {
  const defaults = SETTINGS_DEFAULTS();
  const next = { ...settings };
  let changed = false;
  for (const field of Object.keys(defaults)) {
    if (next[field] && looksForeign(next[field])) {
      next[field] = defaults[field];
      changed = true;
    }
  }
  if (!next.logoUrl || (BRAND.legacyLogoUrls || []).includes(next.logoUrl)) {
    if (next.logoUrl !== defaults.logoUrl) {
      next.logoUrl = defaults.logoUrl;
      changed = true;
    }
  }
  if (next.sendingDomain && looksForeign(next.sendingDomain)) {
    next.sendingDomain = '';
    next.sendingDomainId = '';
    changed = true;
  }
  return { settings: next, changed };
}

export function repairCampaigns(campaigns) {
  let changed = false;
  const repaired = campaigns.map((campaign) => {
    if (campaign.status !== 'scheduled' || !looksForeign(campaign)) return campaign;
    changed = true;
    return { ...campaign, status: 'draft', scheduledAt: null };
  });
  return { campaigns: repaired, changed };
}
