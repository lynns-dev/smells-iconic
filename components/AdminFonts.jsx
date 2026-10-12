import Head from 'next/head';

// Admin-only typeface, styled after Claude's: one warm book serif for all
// admin text — headings, numbers, labels, buttons, tables, inputs — in
// sentence case rather than the storefront's spaced-out capitals.
// (Claude's own fonts are licensed and can't be served here; Source Serif 4
// is the closest free match.) The storefront keeps its brand fonts.
// !important because admin screens set fonts and capitals inline from
// lib/theme.js.
export const ADMIN_SERIF = "'Source Serif 4', 'Iowan Old Style', Georgia, 'Times New Roman', serif";

export default function AdminFonts() {
  return (
    <>
      <Head>
        <link
          key="admin-font"
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,400&display=swap"
        />
      </Head>
      <style jsx global>{`
        body, body *:not(svg):not(svg *) {
          font-family: ${ADMIN_SERIF} !important;
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
