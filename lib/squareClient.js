// Square Web Payments SDK — client-side tokenization for Card, Apple Pay,
// Google Pay, and Afterpay/Clearpay.
//
// Unlike Stripe's @stripe/stripe-js (an npm package), Square's Web Payments
// SDK is a plain script tag that attaches a `Square` global — loadSquare()
// injects it once and caches the promise, same shape as loadStripe().
// NEXT_PUBLIC_SQUARE_ENVIRONMENT picks which CDN script/API host to use;
// it must match the account the access token and location ID belong to,
// same requirement as Stripe's publishable/secret key pairing.
//
// Card.tokenize() flow (payments.card() -> attach -> tokenize) confirmed
// against Square's own "Take a Card Payment" docs. Apple Pay, Google Pay,
// and Afterpay/Clearpay below were NOT verified against primary Square docs
// this session (developer.squareup.com is blocked from this environment) —
// built from Square's public SDK reference via search results and a
// third-party open-source wrapper's source (weareseeed/
// react-square-web-payments-sdk), which confirmed Afterpay follows the same
// click-button -> tokenize() -> await tokenResult shape as Apple/Google Pay
// (presented in a popup, not a full-page redirect), not the event-based
// flow Cash App Pay needed. Each wallet is wrapped so a failure to
// initialize (unsupported browser/device, that wallet not enabled on the
// Square account, order total outside Afterpay's eligible range, etc.)
// never breaks the rest of checkout — the calling page just doesn't show
// that button. The server-side CreatePayment call every token gets sent to
// (lib/squareServer.js) is also unverified — treat all of this as
// unverified until a real charge of each type has gone through end-to-end.
//
// Cash App Pay was removed after a live attempt failed with a generic
// "did not complete" error with no further diagnosis — see git history
// (lib/squareClient.js's createCashAppPayButton) if it's ever revisited.

const SDK_URL = {
  sandbox: 'https://sandbox.web.squarecdn.com/v1/square.js',
  production: 'https://web.squarecdn.com/v1/square.js',
};

let loadPromise = null;

function loadSquareScript(environment) {
  if (typeof window === 'undefined') return Promise.reject(new Error('Square SDK can only load in the browser.'));
  if (window.Square) return Promise.resolve(window.Square);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL[environment] || SDK_URL.production;
    script.async = true;
    script.onload = () => (window.Square ? resolve(window.Square) : reject(new Error('Square SDK loaded but window.Square is missing.')));
    script.onerror = () => reject(new Error('Failed to load the Square Web Payments SDK.'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

let paymentsPromise = null;

// Square's `payments` client is the shared entry point every payment method
// (card, wallets) is created from — cached the same way the script itself
// is, since there's never a reason to create more than one per page load.
function getSquarePayments() {
  const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID;
  const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID;
  const environment = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'production';
  if (!appId || !locationId) return Promise.reject(new Error('NEXT_PUBLIC_SQUARE_APPLICATION_ID / NEXT_PUBLIC_SQUARE_LOCATION_ID are not set.'));

  if (!paymentsPromise) {
    paymentsPromise = loadSquareScript(environment).then((Square) => Square.payments(appId, locationId));
  }
  return paymentsPromise;
}

// Resolves to an initialized Square Card instance, already attached to the
// given DOM element id — ready for tokenize() once the shopper submits.
export async function createSquareCard(containerId) {
  const payments = await getSquarePayments();
  const card = await payments.card();
  await card.attach(`#${containerId}`);
  return card;
}

// card: the object returned by createSquareCard(). details: the
// verificationDetails shape from Square's docs — amount (string, e.g.
// '45.00'), currencyCode, intent ('CHARGE'), billingContact, plus
// customerInitiated/sellerKeyedIn flags. Resolves to a single-use payment
// token string; throws with Square's own error detail on failure.
export async function tokenizeSquareCard(card, details) {
  let tokenResult;
  try {
    tokenResult = await card.tokenize(details);
  } catch (err) {
    // card.tokenize() itself throwing (rejecting) rather than resolving
    // with a non-OK status is a distinct failure mode from the one below —
    // previously nothing logged the raw error here, so a generic SDK
    // message like "An unexpected error occurred while using Card" reached
    // the shopper with no way to see what actually caused it. Logging the
    // full error (not just err.message) so the real cause — network,
    // malformed verificationDetails field, environment mismatch, etc. — is
    // visible in the browser console next time this happens.
    console.error('Square card.tokenize() threw:', err);
    throw err;
  }
  if (tokenResult.status === 'OK') {
    return tokenResult.token;
  }
  console.error('Square card tokenize returned non-OK status:', JSON.stringify(tokenResult));
  const detail = tokenResult.errors ? JSON.stringify(tokenResult.errors) : tokenResult.status;
  throw new Error(`Card verification failed: ${detail}`);
}

// Square's BillingContact.phone requires a leading "+" and country code
// ("A leading + symbol (followed by a country code)... must contain
// between 9 and 16 digits" per Square's docs). Our shipping form is a
// plain, unformatted "Phone (optional)" text field, so a normal US number
// typed without a "+1" prefix doesn't match that — the likely cause of a
// real live tokenize() failure ("An unexpected error occurred while using
// Card") traced to a 400 from Square's own pci-connect.squareup.com/v2/
// analytics/verifications endpoint, the buyer-verification request
// tokenize() fires specifically when billingContact is present. That
// lines up with the same card working fine through Google Pay, whose
// tokenize() call (lib/squareClient.js's tokenizeWallet) sends no
// billingContact at all. Normalizes a 10-digit US number to E.164
// (+1XXXXXXXXXX); anything else that doesn't already look like a valid
// +-prefixed number is dropped rather than risking another malformed-field
// rejection — phone is optional here and not load-bearing for the charge
// itself, unlike AVS/CVV.
export function normalizeUsPhoneForSquare(raw) {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 16 ? `+${digits}` : undefined;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return undefined;
}

// Shared by every wallet method below — describes the amount Apple Pay/
// Google Pay/Afterpay show the shopper in their own approval sheet.
// amount: dollars, same convention as everywhere else on this site.
// locationId is required here (not just on the `payments` client itself) —
// confirmed live: Afterpay failed to initialize with "Missing locationId
// in the payment request configuration" until this was added, while Apple
// Pay/Google Pay happened to tolerate its absence.
// requestContact: ask the wallet's own sheet to collect the shipper's
// name/address/email/phone. Off by default — the checkout pages already
// collected all of that in Step 1, and asking twice would be worse than
// useless. The cart drawer (components/CartDrawer.jsx) is the opposite
// case: there's no form there at all, so without this the tokenized
// payment would have nothing to ship to.
export async function createSquarePaymentRequest(amount, label = 'SMELLS — ICONIC', { requestContact = false } = {}) {
  const payments = await getSquarePayments();
  const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID;
  if (!locationId) throw new Error('NEXT_PUBLIC_SQUARE_LOCATION_ID is not set.');
  return payments.paymentRequest({
    countryCode: 'US',
    currencyCode: 'USD',
    locationId,
    total: { amount: Number(amount).toFixed(2), label },
    ...(requestContact ? { requestShippingContact: true, requestBillingContact: true } : {}),
  });
}

// Apple Pay — unlike Card/Google Pay/Afterpay below, Square's Apple Pay
// object has no attach() at all (confirmed live: calling it throws "attach
// is not a function"). Apple's own web integration doesn't have Square (or
// any provider) inject a button into a container the way Google Pay's
// iframe does — the page renders its own native <button> styled with
// Safari's special -apple-pay-button CSS appearance (see
// pages/checkout.jsx's .apple-pay-button style), and this just returns the
// object whose tokenize() that button's onClick calls directly. Returns
// null (rather than throwing) if this wallet can't be offered here — e.g.
// Apple Pay outside Safari, or before this domain has completed Apple's
// merchant domain verification — so calling pages can just hide the
// button instead of crashing.
// onError: optional callback, invoked with the real Error before this
// resolves to null — lets a calling page surface the actual failure reason
// on-screen (e.g. while debugging a wallet that isn't showing up) without
// needing to be at a console. Purely additive; omitting it is identical to
// the old behavior.
export async function createApplePayButton(amount, onError, { requestContact = false } = {}) {
  try {
    const payments = await getSquarePayments();
    const paymentRequest = await createSquarePaymentRequest(amount, 'SMELLS — ICONIC', { requestContact });
    const applePay = await payments.applePay(paymentRequest);
    return applePay;
  } catch (err) {
    console.error('Apple Pay unavailable:', err);
    onError?.(err);
    return null;
  }
}

// Unlike Apple Pay above, Google Pay's object does have attach() — Square
// renders its own branded iframe button into the given container, same
// shape as the card element.
export async function createGooglePayButton(amount, containerId, onError, { requestContact = false } = {}) {
  try {
    const payments = await getSquarePayments();
    const paymentRequest = await createSquarePaymentRequest(amount, 'SMELLS — ICONIC', { requestContact });
    const googlePay = await payments.googlePay(paymentRequest);
    // buttonSizeMode: 'fill' — without it Google's own button renders at
    // its default (narrower) size instead of filling walletButtonContainer's
    // full width.
    await googlePay.attach(`#${containerId}`, { buttonSizeMode: 'fill', buttonColor: 'black', buttonType: 'buy' });
    return googlePay;
  } catch (err) {
    console.error('Google Pay unavailable:', err);
    onError?.(err);
    return null;
  }
}

// Afterpay/Clearpay: same attach()-then-click-then-tokenize() shape as
// Apple/Google Pay above — Square presents the installment approval in a
// popup and resolves tokenize()'s promise once the shopper completes it
// there, not a full-page redirect away from checkout. Subject to
// Afterpay's own order-amount eligibility range (roughly $35–$2,000 in the
// US, unconfirmed against current Square docs) — an order outside that
// range is expected to fail here and simply not show the button, same as
// any other unavailable wallet.
export async function createAfterpayButton(amount, containerId, onError) {
  try {
    const payments = await getSquarePayments();
    const paymentRequest = await createSquarePaymentRequest(amount);
    const afterpay = await payments.afterpayClearpay(paymentRequest);
    await afterpay.attach(`#${containerId}`);
    return afterpay;
  } catch (err) {
    console.error('Afterpay unavailable:', err);
    onError?.(err);
    return null;
  }
}

// tokenize() on click — used for Apple Pay, Google Pay, and Afterpay,
// which all resolve the same way the card element's tokenize() does.
// Pulls the shipping name/address/email the wallet sheet collected (only
// populated when the payment request was built with requestContact) into
// the flat shape the rest of this site uses for a shipping address.
//
// Deliberately defensive about where it reads from: the exact TokenResult
// nesting isn't verifiable from this environment, so it checks the
// documented location plus the plausible neighbours rather than assuming
// one path and silently producing an address-less order. Returns null when
// the essentials (street, city, postal code) aren't all present — callers
// must treat that as "don't charge", since an order with no usable address
// can't be fulfilled.
export function extractWalletContact(tokenResult) {
  const d = tokenResult?.details || {};
  const contact = d.shipping?.contact || d.shipping || d.billing?.contact || d.contact || null;
  if (!contact) return null;

  const lines = contact.addressLines || contact.addressLine || [];
  const [line1, line2] = Array.isArray(lines) ? lines : [lines];
  const address = (line1 || contact.address || '').trim();
  const city = (contact.city || contact.locality || '').trim();
  const zip = (contact.postalCode || contact.postal_code || '').trim();
  if (!address || !city || !zip) return null;

  const firstName = (contact.givenName || contact.given_name || '').trim();
  const lastName = (contact.familyName || contact.family_name || '').trim();

  return {
    // `name` matches what the checkout form now sends (a single field);
    // firstName/lastName are kept too since that's how the wallet supplies
    // them and some consumers still read the pair.
    name: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    address,
    apt: (line2 || '').trim(),
    city,
    state: (contact.state || contact.region || '').trim(),
    zip,
    phone: (contact.phone || contact.phoneNumber || '').trim(),
    email: (contact.email || contact.emailAddress || '').trim(),
  };
}

// Same as tokenizeWallet below, but hands back the whole TokenResult so the
// caller can also read the contact info the sheet collected.
export async function tokenizeWalletWithContact(method) {
  const tokenResult = await tokenizeWalletResult(method);
  return { token: tokenResult.token, contact: extractWalletContact(tokenResult) };
}

export async function tokenizeWallet(method) {
  const tokenResult = await tokenizeWalletResult(method);
  return tokenResult.token;
}

async function tokenizeWalletResult(method) {
  let tokenResult;
  try {
    tokenResult = await method.tokenize();
  } catch (err) {
    console.error('Square wallet tokenize() threw:', err);
    throw err;
  }
  if (tokenResult.status === 'OK') return tokenResult;
  // A shopper dismissing the Apple Pay/Google Pay/Afterpay sheet themselves
  // (tapping outside it, hitting Cancel) resolves tokenize() with a non-OK
  // status rather than rejecting — Square's own status/error naming for
  // this isn't confirmed against primary docs in this environment, so this
  // matches anything with "cancel" in the status or an error's type/code
  // rather than one exact literal, and flags it distinctly (err.cancelled)
  // so callers can quietly reset instead of showing "Payment was not
  // approved" for something the shopper did on purpose.
  const cancelled = String(tokenResult.status || '').toUpperCase().includes('CANCEL')
    || (tokenResult.errors || []).some((e) => String(e?.type || e?.code || '').toUpperCase().includes('CANCEL'));
  if (cancelled) {
    const err = new Error('Payment was cancelled.');
    err.cancelled = true;
    throw err;
  }
  console.error('Square wallet tokenize returned non-OK status:', JSON.stringify(tokenResult));
  const detail = tokenResult.errors ? JSON.stringify(tokenResult.errors) : tokenResult.status;
  throw new Error(`Payment was not approved: ${detail}`);
}
