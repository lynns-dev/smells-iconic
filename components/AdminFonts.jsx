import Head from 'next/head';

// Admin-only typefaces, in the spirit of Claude's own: a warm book serif for
// titles and big numbers, and a clean screen sans with same-width digits for
// everything else. (Claude's actual fonts, Tiempos/Copernicus and Styrene,
// are licensed and can't be served here — Source Serif 4 and Inter are the
// closest free equivalents.) The storefront keeps its brand fonts.
// !important because admin screens set fontFamily inline from lib/theme.js.
export const ADMIN_SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const ADMIN_SANS = "'Inter', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export default function AdminFonts() {
  return (
    <>
      <Head>
        <link
          key="admin-font"
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap"
        />
      </Head>
      <style jsx global>{`
        body, body *:not(svg):not(svg *):not(.admin-serif):not(.admin-serif *) {
          font-family: ${ADMIN_SANS} !important;
          font-variant-numeric: tabular-nums;
        }
        .admin-serif, .admin-serif * {
          font-family: ${ADMIN_SERIF} !important;
          letter-spacing: normal !important;
        }
        body {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
      `}</style>
    </>
  );
}
