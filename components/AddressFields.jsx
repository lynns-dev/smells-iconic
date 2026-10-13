import React from 'react';
import { T } from '../lib/theme';
import { fetchAddressSuggestions } from '../lib/addressAutocomplete';

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

// Shared shipping/billing address form used by checkout.jsx, checkout-qb.jsx,
// and offer3.jsx — previously duplicated near-identically in each file;
// pulled out here so the Address-field autocomplete below only needs to be
// built (and fixed, if it ever needs fixing) once.
//
// Autocomplete: typing 4+ characters into the Address field debounces a
// lookup (lib/addressAutocomplete.js, Mapbox's Geocoding API) and shows a dropdown of
// matching full addresses below the field; selecting one fills
// address/city/state/zip in one action. Manual typing always still works
// whether or not autocomplete returns anything (no key set, network
// failure, no matches) — this only ever adds a shortcut, never blocks the
// plain form fields underneath it.
//
// inputStyle: passed in by each page rather than imported from a shared
// constant, since each page's `input` style is defined locally (though
// currently identical in shape/values across all three) — keeps this
// component decoupled from any one page's style module.
// rowClass2/rowClass3: the CSS grid classes each page defines in its own
// <style jsx> block for the two-column (name) and three-column
// (city/state/zip) rows — named differently per page (offer3.jsx uses an
// "o3-" prefix to avoid colliding with its own other grids), so these are
// passed in rather than hardcoded.
//
// simplified: opt-in (pages/checkout.jsx only — checkout-qb.jsx/offer3.jsx
// keep the classic First/Last + City/State/ZIP layout above) shorter form:
// one Name field, Address, optional Apt, then ZIP. Entering a 5-digit ZIP
// fills City and State automatically (/api/zip-lookup) so those two
// collapse into a single confirmed "Austin, TX" line instead of a city
// input plus a 50-option dropdown. Nothing here can trap a shopper — if the
// lookup misses, errors, or is slow, plain City/State inputs are revealed
// and the order completes by hand exactly as before; an "Edit" control does
// the same on demand if the lookup guessed a city the shopper doesn't want.
export default function AddressFields({
  value, onChange, idPrefix, inputStyle,
  rowClass2 = 'row-2', rowClass3 = 'row-3',
  simplified = false,
}) {
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });
  const section = idPrefix === 'bill' ? 'billing' : 'shipping';

  const [suggestions, setSuggestions] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef(null);
  const wrapRef = React.useRef(null);

  // simplified-mode ZIP lookup state. 'idle' | 'loading' | 'resolved' | 'failed'
  const [zipStatus, setZipStatus] = React.useState(value.city && value.state ? 'resolved' : 'idle');
  const [showCityState, setShowCityState] = React.useState(false);
  const zipRequestRef = React.useRef(0);

  React.useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  React.useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleAddressChange = (e) => {
    const raw = e.target.value;
    onChange({ ...value, address: raw });
    clearTimeout(debounceRef.current);
    if (raw.trim().length < 4) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await fetchAddressSuggestions(raw);
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 250);
  };

  const handleSelect = (suggestion) => {
    onChange({
      ...value,
      address: suggestion.address,
      city: suggestion.city,
      state: suggestion.state,
      zip: suggestion.zip,
    });
    setSuggestions([]);
    setOpen(false);
    if (simplified && suggestion.city && suggestion.state) setZipStatus('resolved');
  };

  const handleZipChange = async (e) => {
    const zip = e.target.value.replace(/[^\d]/g, '').slice(0, 5);
    // City/State are cleared alongside an edited ZIP so a stale pair from
    // the previous ZIP can never ride along with the new one.
    onChange({ ...value, zip, city: '', state: '' });

    if (zip.length !== 5) {
      setZipStatus('idle');
      return;
    }

    // Guards against an earlier, slower lookup landing after a later one
    // and overwriting the newer ZIP's city/state.
    const requestId = zipRequestRef.current + 1;
    zipRequestRef.current = requestId;
    setZipStatus('loading');
    try {
      const res = await fetch(`/api/zip-lookup?zip=${zip}`);
      if (zipRequestRef.current !== requestId) return;
      if (!res.ok) throw new Error('lookup failed');
      const { city, state } = await res.json();
      if (!city || !state) throw new Error('incomplete');
      onChange({ ...value, zip, city, state });
      setZipStatus('resolved');
    } catch {
      if (zipRequestRef.current !== requestId) return;
      setZipStatus('failed');
      setShowCityState(true);
    }
  };

  const cityStateVisible = showCityState || zipStatus === 'failed';

  if (simplified) {
    return (
      <>
        <input
          placeholder="Full name"
          value={value.name || ''}
          onChange={set('name')}
          style={inputStyle}
          autoComplete={`${section} name`}
          required
        />
        <div ref={wrapRef} style={{ position: 'relative', marginTop: 8 }}>
          <input
            placeholder="Address"
            value={value.address}
            onChange={handleAddressChange}
            onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
            style={inputStyle}
            autoComplete={`${section} address-line1`}
            required
          />
          {open && (
            <ul style={suggestionList}>
              {suggestions.map((s, i) => (
                <li key={`${s.label}-${i}`}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelect(s)} style={suggestionItem}>
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input placeholder="Apartment, suite, etc. (optional)" value={value.apt} onChange={set('apt')} style={{ ...inputStyle, marginTop: 8 }} autoComplete={`${section} address-line2`} />

        <input
          placeholder="ZIP code"
          value={value.zip}
          onChange={handleZipChange}
          style={{ ...inputStyle, marginTop: 8 }}
          autoComplete={`${section} postal-code`}
          inputMode="numeric"
          maxLength={5}
          required
        />

        {zipStatus === 'loading' && (
          <p style={zipNote}>Looking up your city…</p>
        )}
        {zipStatus === 'resolved' && !cityStateVisible && (
          <p style={zipNote}>
            <span style={{ color: T.ink }}>{value.city}, {value.state}</span>
            <button type="button" onClick={() => setShowCityState(true)} style={editButton}>Edit</button>
          </p>
        )}
        {zipStatus === 'failed' && (
          <p style={{ ...zipNote, color: T.soft }}>We couldn’t find that ZIP — please enter your city and state.</p>
        )}

        {/* Kept mounted only while actually needed: `required` on an input
            that isn't in the DOM is ignored by native form validation, so
            these must be present whenever they're the shopper's own
            responsibility to fill in. */}
        {cityStateVisible && (
          <div className={rowClass2} style={{ marginTop: 8 }}>
            <input placeholder="City" value={value.city} onChange={set('city')} style={inputStyle} autoComplete={`${section} address-level2`} required />
            <select value={value.state} onChange={set('state')} style={inputStyle} autoComplete={`${section} address-level1`} required>
              <option value="">State</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <input
          placeholder="Phone (optional)"
          value={value.phone}
          onChange={set('phone')}
          style={{ ...inputStyle, marginTop: 8 }}
          autoComplete={`${section} tel`}
          id={idPrefix ? `${idPrefix}-phone` : undefined}
        />
      </>
    );
  }

  return (
    <>
      <div className={rowClass2}>
        <input placeholder="First name" value={value.firstName} onChange={set('firstName')} style={inputStyle} autoComplete={`${section} given-name`} required />
        <input placeholder="Last name" value={value.lastName} onChange={set('lastName')} style={inputStyle} autoComplete={`${section} family-name`} required />
      </div>
      <div ref={wrapRef} style={{ position: 'relative', marginTop: 8 }}>
        <input
          placeholder="Address"
          value={value.address}
          onChange={handleAddressChange}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          style={inputStyle}
          autoComplete={`${section} address-line1`}
          required
        />
        {open && (
          <ul style={suggestionList}>
            {suggestions.map((s, i) => (
              <li key={`${s.label}-${i}`}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelect(s)} style={suggestionItem}>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input placeholder="Apartment, suite, etc. (optional)" value={value.apt} onChange={set('apt')} style={{ ...inputStyle, marginTop: 8 }} autoComplete={`${section} address-line2`} />
      <div className={rowClass3} style={{ marginTop: 8 }}>
        <input placeholder="City" value={value.city} onChange={set('city')} style={inputStyle} autoComplete={`${section} address-level2`} required />
        <select value={value.state} onChange={set('state')} style={inputStyle} autoComplete={`${section} address-level1`} required>
          <option value="">State</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input placeholder="ZIP code" value={value.zip} onChange={set('zip')} style={inputStyle} autoComplete={`${section} postal-code`} required />
      </div>
      <input
        placeholder="Phone (optional)"
        value={value.phone}
        onChange={set('phone')}
        style={{ ...inputStyle, marginTop: 8 }}
        autoComplete={`${section} tel`}
        id={idPrefix ? `${idPrefix}-phone` : undefined}
      />
    </>
  );
}

const suggestionList = {
  listStyle: 'none', margin: 0, padding: 4, position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
  background: T.white, border: `1px solid ${T.line}`, borderRadius: 4, boxShadow: '0 8px 20px rgba(22,20,15,0.12)',
  maxHeight: 220, overflowY: 'auto',
};
const suggestionItem = {
  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: 'none',
  cursor: 'pointer', fontFamily: T.sans, fontSize: 14, color: T.ink, borderRadius: 3,
};
const zipNote = {
  display: 'flex', alignItems: 'center', gap: 10,
  fontSize: 13, color: T.soft, marginTop: 8,
};
const editButton = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: T.sans,
  fontSize: 12, color: T.soft, textDecoration: 'underline', textUnderlineOffset: 3,
};
