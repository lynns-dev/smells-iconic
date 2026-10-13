// ZIP -> { city, state } lookup for the checkout shipping step, so a
// shopper types a postal code instead of city + state + ZIP separately.
//
// Proxied through our own server rather than called from the browser for
// three reasons: no dependence on the provider sending permissive CORS
// headers, the provider can be swapped without shipping new client code,
// and any provider that later needs a key keeps that key server-side.
//
// Two independent sources are tried in order, because this sits on the
// critical path of a checkout: Zippopotam (keyless) first, then Mapbox's
// geocoder if NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN happens to be configured
// (it powers the Address autocomplete in components/AddressFields.jsx).
// Both response shapes are read defensively — neither could be verified
// against the live services from the environment this was written in, so
// anything unexpected resolves to "not found" rather than throwing.
//
// A miss is NOT an error the shopper has to solve: AddressFields falls
// back to revealing plain City/State inputs, so checkout still completes
// if this route returns nothing at all.

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

function clean(str) {
  return typeof str === 'string' ? str.trim() : '';
}

// Only hand back a state the checkout's own <select> can actually hold —
// a full state name ("Texas") would silently fail to select an option.
function normalizeState(raw) {
  const value = clean(raw).toUpperCase().replace(/^US-/, '');
  return US_STATE_CODES.has(value) ? value : '';
}

async function fromZippopotam(zip) {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) return null;
  const data = await res.json();
  const place = (data?.places || [])[0];
  if (!place) return null;
  const city = clean(place['place name']);
  const state = normalizeState(place['state abbreviation'] || place.state);
  return city && state ? { city, state } : null;
}

async function fromMapbox(zip) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) return null;
  const params = new URLSearchParams({ access_token: token, country: 'US', types: 'postcode', limit: '1' });
  const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zip)}.json?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const feature = (data?.features || [])[0];
  if (!feature) return null;
  const context = feature.context || [];
  const city = clean(context.find((c) => c.id?.startsWith('place.'))?.text);
  const region = context.find((c) => c.id?.startsWith('region.'));
  const state = normalizeState(region?.short_code || region?.text);
  return city && state ? { city, state } : null;
}

export default async function handler(req, res) {
  const zip = clean(req.query.zip);
  if (!/^\d{5}$/.test(zip)) return res.status(400).json({ error: 'A 5-digit US ZIP code is required.' });

  for (const lookup of [fromZippopotam, fromMapbox]) {
    try {
      const match = await lookup(zip);
      if (match) {
        // Safe to cache hard: ZIP-to-city mappings effectively never move.
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
        return res.status(200).json(match);
      }
    } catch (err) {
      console.error('ZIP lookup provider failed:', err?.message || err);
    }
  }

  return res.status(404).json({ error: 'No match for that ZIP code.' });
}
