import Head from 'next/head';
import { T } from '../lib/adminTheme';

// Admin-only look (tokens in lib/adminTheme.js), styled after Claude: DM
// Sans for everything in sentence case with same-width digits, Source
// Serif 4 for page titles (.admin-serif), a near-white canvas and rounded
// black-and-white controls. The storefront keeps its brand fonts.
// The font rule is !important because some admin screens still set fonts
// and capitals inline; the shape rules aren't, so a control that sets its
// own corners keeps them.
export const ADMIN_SANS = T.sans;

export default function AdminFonts() {
  return (
    <>
      <Head>
        <link
          key="admin-font"
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap"
        />
      </Head>
      <style jsx global>{`
        body, body *:not(svg):not(svg *) {
          font-family: ${ADMIN_SANS} !important;
          font-style: normal !important;
          text-transform: none !important;
          letter-spacing: normal !important;
          font-variant-numeric: tabular-nums;
        }
        body .admin-serif { font-family: ${T.serif} !important; font-weight: 400; letter-spacing: -0.01em !important; }
        body {
          background: ${T.paper};
          color: ${T.ink};
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        input, select, textarea { border-radius: 10px; }
        input[type='checkbox'], input[type='radio'] { accent-color: ${T.accent}; width: 16px; height: 16px; }
        button { border-radius: 10px; transition: background-color .15s, opacity .15s, box-shadow .15s; }
        button:disabled { cursor: default; }
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: ${T.accent} !important;
          box-shadow: 0 0 0 3px rgba(0,0,0,0.1);
        }
        button:focus-visible, a:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(0,0,0,0.15); }
        a { color: inherit; }
        ::selection { background: ${T.accentSoft}; }

        /* App shell (pages/admin/index.jsx in both stores): sidebar on
           desktop, frosted bottom tab bar on phones. */
        .admin-page { padding: 24px 24px 80px; }
        .admin-shell { display: flex; gap: 28px; max-width: 1320px; margin: 0 auto; align-items: flex-start; }
        .admin-main { flex: 1; min-width: 0; }
        .admin-nav {
          position: sticky; top: 24px; width: 228px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px;
          padding: 14px 10px; border-radius: 18px; background: rgba(255,255,255,0.72);
          -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
          box-shadow: ${T.shadow}; max-height: calc(100vh - 48px); overflow-y: auto;
        }
        .admin-brand, .admin-nav-logo { padding: 6px 10px 16px; font-size: 20px; color: ${T.ink}; }
        body .admin-brand { font-family: ${T.serif} !important; font-weight: 400; }
        .admin-brand span { display: block; font-size: 12px; font-weight: 500; color: ${T.soft}; margin-top: 1px; }
        .admin-nav-item {
          display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border: none; border-radius: 10px;
          background: none; font-size: 14px; font-weight: 500; color: ${T.ink}; cursor: pointer; text-decoration: none; opacity: 1;
        }
        .admin-nav-item svg { color: ${T.soft}; }
        .admin-nav-item:hover { background: rgba(0,0,0,0.04); }
        .admin-nav-item.active { background: ${T.ink}; color: #fff; box-shadow: none; font-weight: 600; }
        .admin-nav-item.active .admin-nav-badge { background: #fff; color: ${T.ink}; }
        .admin-nav-item.active svg { color: #fff; }
        .admin-nav-label { flex: 1; min-width: 0; }
        .admin-nav-badge { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: ${T.ink}; color: #fff; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
        .admin-nav-count { margin-left: auto; font-size: 13px; color: ${T.soft}; }
        .admin-nav-item.active .admin-nav-count { color: rgba(255,255,255,0.8); }
        .admin-nav-gap, .admin-nav-signout { margin-top: 14px; }
        .admin-nav-quiet, .admin-nav-quiet svg { color: ${T.soft}; }
        .admin-nav-signout svg, .admin-nav-signout { color: ${T.soft}; }
        @media (max-width: 760px) {
          .admin-page { padding: 16px 16px calc(96px + env(safe-area-inset-bottom)); }
          .admin-shell { display: block; }
          .admin-nav {
            position: fixed; top: auto; left: 0; right: 0; bottom: 0; z-index: 50; width: auto; max-height: none;
            flex-direction: row; gap: 0; overflow-x: auto; overflow-y: hidden; border-radius: 0;
            padding: 6px 6px calc(6px + env(safe-area-inset-bottom)); background: rgba(250,250,252,0.85);
            border-top: 1px solid ${T.line}; box-shadow: none; scrollbar-width: none;
          }
          .admin-nav::-webkit-scrollbar { display: none; }
          .admin-brand, .admin-nav-logo { display: none; }
          .admin-nav-item {
            position: relative; flex: 1 0 64px; flex-direction: column; gap: 3px; width: auto; padding: 4px 6px;
            font-size: 10px; font-weight: 500; color: ${T.soft}; text-align: center; white-space: nowrap;
          }
          .admin-nav-item svg { color: ${T.soft}; width: 24px; height: 24px; }
          .admin-nav-item:hover { background: none; }
          .admin-nav-item.active { background: none; color: ${T.ink}; font-weight: 600; }
          .admin-nav-item.active svg { color: ${T.ink}; }
          .admin-nav-item.active .admin-nav-badge { background: ${T.ink}; color: #fff; }
          .admin-nav-label { flex: none; }
          .admin-nav-badge { position: absolute; top: 0; left: calc(50% + 4px); margin: 0; min-width: 18px; height: 18px; font-size: 11px; border: 2px solid #fff; }
          .admin-nav-count { display: none; }
          .admin-nav-gap, .admin-nav-signout { margin-top: 0; }
        }
      `}</style>
    </>
  );
}
