import Head from 'next/head';

// Admin-only typeface, styled after Claude's sans-serif: one clean,
// low-contrast geometric sans for all admin text — headings, numbers,
// labels, buttons, tables, inputs — in sentence case rather than the
// storefront's spaced-out capitals. (Claude's own sans, Styrene / Anthropic
// Sans, is licensed and can't be served here; DM Sans is the closest free
// match.) Numbers use same-width digits so columns line up. The storefront
// keeps its brand fonts.
// !important because admin screens set fonts and capitals inline from
// lib/theme.js.
export const ADMIN_SANS = "'DM Sans', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export default function AdminFonts() {
  return (
    <>
      <Head>
        <link
          key="admin-font"
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap"
        />
      </Head>
      <style jsx global>{`
        body, body *:not(svg):not(svg *) {
          font-family: ${ADMIN_SANS} !important;
          text-transform: none !important;
          letter-spacing: normal !important;
          font-variant-numeric: lining-nums tabular-nums;
        }
        body {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
      `}</style>
    </>
  );
}
