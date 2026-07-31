import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href="/images/si-favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
          *{margin:0;padding:0;box-sizing:border-box}
          html{scroll-behavior:smooth}
          body{background:#FBF0EC;color:#3B2A2E;font-family:'Inter',system-ui,sans-serif;font-weight:400;line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden}
          a{color:inherit;text-decoration:none}
          img{display:block;max-width:100%}
          ::selection{background:#B15F58;color:#FFFDFB}
        `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
