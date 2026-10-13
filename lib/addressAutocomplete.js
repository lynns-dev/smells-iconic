// Client-side address-suggestion lookup via Mapbox's Geocoding API
// (api.mapbox.com) — as a shopper types into the checkout Address field,
// this returns candidate full addresses; selecting one fills
// address/city/state/ZIP automatically instead of typing every field by
// hand. Requires NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN — a Mapbox access token
// generated directly from a free, self-serve Mapbox account (no sales
// contact required — Radar was tried first but its signup flow required
// booking a demo, so this switched to Mapbox instead).
//
// Endpoint/response shape confirmed by reading Mapbox's own SDK source
// (github.com/mapbox/mapbox-sdk-js services/geocoding.js) rather than
// guessed: GET /geocoding/v5/mapbox.places/{query}.json, access_token as a
// query param (not a header), response.features[] with place_name/text/
// address plus a context[] array whose entries are matched by id prefix
// ("postcode.", "place.", "region.") to pull out zip/city/state — this is
// unverified against a real token from this session, so treat as
// unverified until tested end-to-end with a real
// NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN.
//
// Fails silently (returns an empty list) on any error — missing token,
// network failure, non-OK response — so a slow or unavailable autocomplete
// service never blocks manual address entry, which always still works.
const MIN_QUERY_LENGTH = 4;

function contextValue(context, idPrefix) {
  const entry = (context || []).find((c) => c.id?.startsWith(idPrefix));
  return entry?.text || '';
}

// Mapbox's region context often carries a "US-NY" short_code — the state
// dropdown here only wants the two-letter code.
function stateCode(context) {
  const entry = (context || []).find((c) => c.id?.startsWith('region.'));
  if (entry?.short_code) return entry.short_code.replace(/^US-/, '');
  return entry?.text || '';
}

export async function fetchAddressSuggestions(query) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token || !query || query.trim().length < MIN_QUERY_LENGTH) return [];

  try {
    const params = new URLSearchParams({
      access_token: token,
      autocomplete: 'true',
      country: 'US',
      types: 'address',
      limit: '5',
    });
    const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map((f) => ({
      label: f.place_name || f.text || '',
      address: [f.address, f.text].filter(Boolean).join(' ').trim() || f.place_name || '',
      city: contextValue(f.context, 'place.'),
      state: stateCode(f.context),
      zip: contextValue(f.context, 'postcode.'),
    }));
  } catch {
    return [];
  }
}
