// node scripts/build-legal-site.mjs [srcDir] [outDir]
//
// Turns the four legal documents in legal-site/src/*.md into static pages for
// Firebase Hosting (default site, bama-af0a0). The Terms quote these URLs, so the
// output paths are fixed:
//   /terms, /privacy, /refunds            Hebrew   (terms.html, privacy.html, refunds.html)
//   /en/terms, /en/privacy, /en/refunds   English  (en/*.html)
// plus index.html linking to all six. Fully static: no JavaScript, no cookies,
// no analytics. legal-site/public/ is build output and is not committed.
//
// The one exception to "no JavaScript" is legal-site/static/c.html, the invite landing page
// served for /c/** (firebase.json rewrite). Its few inline lines only read the token from the
// address and build a bama://c/<token> link; it makes no network request and loads nothing.
//
// legal-site/static/ (logo, favicon, apple-touch-icon) is copied as is. The logo is
// the app's gradient wordmark on a transparent background, the same in light and dark.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** logo.webp is 701×176 (88px on the index at 2x); width/height keep the layout from jumping. */
const LOGO = { src: '/logo.webp', ratio: 701 / 176 };

function logo(height, cls) {
  const width = Math.round(height * LOGO.ratio);
  return `<img class="${cls}" src="${LOGO.src}" alt="BAMA" width="${width}" height="${height}">`;
}

export const PAGES = [
  { doc: 'terms', lang: 'he', src: 'terms.he.md', out: 'terms.html', path: '/terms' },
  { doc: 'privacy', lang: 'he', src: 'privacy.he.md', out: 'privacy.html', path: '/privacy' },
  { doc: 'refunds', lang: 'he', src: 'refunds.he.md', out: 'refunds.html', path: '/refunds' },
  { doc: 'terms', lang: 'en', src: 'terms.en.md', out: 'en/terms.html', path: '/en/terms' },
  { doc: 'privacy', lang: 'en', src: 'privacy.en.md', out: 'en/privacy.html', path: '/en/privacy' },
  { doc: 'refunds', lang: 'en', src: 'refunds.en.md', out: 'en/refunds.html', path: '/en/refunds' },
];

const COPY = {
  he: {
    terms: { title: 'תקנון ותנאי שימוש', description: 'תקנון ותנאי השימוש של BAMA.' },
    privacy: { title: 'מדיניות פרטיות', description: 'מדיניות הפרטיות של BAMA: איזה מידע נאסף, למה ומה הזכויות שלך.' },
    refunds: { title: 'מדיניות ביטולים והחזרים', description: 'מדיניות הביטולים וההחזרים של BAMA.' },
    other: 'English',
  },
  en: {
    terms: { title: 'Terms of Use', description: 'BAMA Terms of Use.' },
    privacy: { title: 'Privacy Policy', description: 'BAMA Privacy Policy: what data is collected, why, and your rights.' },
    refunds: { title: 'Cancellation & Refund Policy', description: 'BAMA Cancellation and Refund Policy.' },
    other: 'עברית',
  },
};

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
:root{--bg:#fff;--fg:#1a1a1a;--muted:#5f6368;--border:#d9dce1;--head:#f4f5f7;--link:#004aad}
@media (prefers-color-scheme:dark){:root{--bg:#121316;--fg:#e8e9ec;--muted:#a0a4ab;--border:#3a3d44;--head:#1d1f24;--link:#8ab4ff}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 Heebo,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:0 16px 64px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);margin-bottom:24px;font-size:14px}
header .brand{display:flex;align-items:center;gap:12px;min-width:0;color:var(--muted)}
header .home{display:block;line-height:0;flex:none}
.logo{display:block;max-width:100%;background:none;border:0}
.logo-header{height:36px;width:auto}
.home-index{display:flex;justify-content:center;margin:40px 0 24px}
.logo-index{width:min(350px,100%);height:auto}
.index-page{text-align:center}
a{color:var(--link)}
h1{font-size:1.75rem;line-height:1.5;margin:0 0 16px}
h2{font-size:1.3rem;line-height:1.5;margin:32px 0 8px}
h3{font-size:1.1rem;line-height:1.5;margin:24px 0 8px}
p,li{overflow-wrap:break-word}
hr{border:0;border-top:1px solid var(--border);margin:32px 0}
blockquote{margin:16px 0;padding:4px 16px;border-inline-start:3px solid var(--border);color:var(--muted)}
.table-wrap{overflow-x:auto;margin:16px 0;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;min-width:100%;font-size:15px}
th,td{border:1px solid var(--border);padding:8px 10px;text-align:start;vertical-align:top}
th{background:var(--head)}
ul.pages{padding:0;list-style:none}
ul.pages li{margin:8px 0}
@media (max-width:480px){body{font-size:15px}h1{font-size:1.45rem}}
`;

function shell({ lang, title, description, header, body }) {
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
${header}
<main>
${body}
</main>
</div>
</body>
</html>
`;
}

/** Markdown → HTML, with every table wrapped so it scrolls sideways on a narrow screen. */
export function renderMarkdown(md) {
  const html = marked.parse(md, { gfm: true, async: false });
  return html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
}

export function renderPage(page, md) {
  const copy = COPY[page.lang][page.doc];
  const other = PAGES.find((p) => p.doc === page.doc && p.lang !== page.lang);
  const otherLang = other.lang;
  const header = `<header>
<span class="brand"><a class="home" href="/">${logo(36, 'logo logo-header')}</a><span>${escapeHtml(copy.title)}</span></span>
<a href="${other.path}" hreflang="${otherLang}" lang="${otherLang}">${COPY[page.lang].other}</a>
</header>`;
  return shell({
    lang: page.lang,
    title: `${copy.title} | BAMA`,
    description: copy.description,
    header,
    body: renderMarkdown(md),
  });
}

export function renderIndex() {
  const item = (p) => `<li><a href="${p.path}" lang="${p.lang}" hreflang="${p.lang}">${escapeHtml(COPY[p.lang][p.doc].title)}</a></li>`;
  const body = `<div class="index-page">
<a class="home home-index" href="/">${logo(88, 'logo logo-index')}</a>
<h1>מסמכים משפטיים · Legal</h1>
<ul class="pages">
${PAGES.map(item).join('\n')}
</ul>
</div>`;
  return shell({
    lang: 'he',
    title: 'BAMA — מסמכים משפטיים · Legal',
    description: 'התקנון, מדיניות הפרטיות ומדיניות הביטולים וההחזרים של BAMA, בעברית ובאנגלית. BAMA Terms of Use, Privacy Policy and Cancellation & Refund Policy.',
    header: '',
    body,
  });
}

export function build(
  srcDir = join(ROOT, 'legal-site/src'),
  outDir = join(ROOT, 'legal-site/public'),
  staticDir = join(ROOT, 'legal-site/static'),
) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  if (existsSync(staticDir)) cpSync(staticDir, outDir, { recursive: true });
  const written = [];
  for (const page of PAGES) {
    const md = readFileSync(join(srcDir, page.src), 'utf8');
    const file = join(outDir, page.out);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, renderPage(page, md));
    written.push(file);
  }
  const index = join(outDir, 'index.html');
  writeFileSync(index, renderIndex());
  written.push(index);
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [srcDir, outDir] = process.argv.slice(2).map((p) => resolve(p));
  for (const f of build(srcDir, outDir)) console.log('wrote', f.replace(ROOT + '/', ''));
}
