// Edit these to change the name, contact details and legal entity shown on the public site.
export const BRAND = {
  product: 'Live Golf Scoring',
  tagline: 'Live scoring for golf days, charity events and club competitions',
  company: 'Live Golf Scoring',                 // the legal business that sells the service
  companyDetails: 'Registered in the United States', // e.g. "JONDOSPORT USA LLC, Mooresville, NC, USA"
  email: 'hello@example.com',                   // where organisers can reach you
  country: 'United States',                     // governing law for the terms
  defaultPrice: { cents: 5000, currency: 'usd' },
  refundDays: 7,                                // full refund if asked this many days before the event
};

export function money(cents, currency = 'usd') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`; }
}
