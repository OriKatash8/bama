// node scripts/build-legal-site.mjs [srcDir] [outDir]
//
// Turns the four legal documents in legal-site/src/*.md into static pages for
// Firebase Hosting (default site, bama-af0a0). The Terms quote these URLs, so the
// output paths are fixed:
//   /terms, /privacy           Hebrew   (terms.html, privacy.html)
//   /en/terms, /en/privacy     English  (en/terms.html, en/privacy.html)
// plus index.html linking to all four. Fully static: no JavaScript, no cookies,
// no analytics. legal-site/public/ is build output and is not committed.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const PAGES = [
  { doc: 'terms', lang: 'he', src: 'terms.he.md', out: 'terms.html', path: '/terms' },
  { doc: 'privacy', lang: 'he', src: 'privacy.he.md', out: 'privacy.html', path: '/privacy' },
  { doc: 'terms', lang: 'en', src: 'terms.en.md', out: 'en/terms.html', path: '/en/terms' },
  { doc: 'privacy', lang: 'en', src: 'privacy.en.md', out: 'en/privacy.html', path: '/en/privacy' },
];

const COPY = {
  he: {
    terms: { title: 'תקנון ותנאי שימוש', description: 'תקנון ותנאי השימוש של BAMA.' },
    privacy: { title: 'מדיניות פרטיות', description: 'מדיניות הפרטיות של BAMA: איזה מידע נאסף, למה ומה הזכויות שלך.' },
    other: 'English',
  },
  en: {
    terms: { title: 'Terms of Use', description: 'BAMA Terms of Use.' },
    privacy: { title: 'Privacy Policy', description: 'BAMA Privacy Policy: what data is collected, why, and your rights.' },
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
header .site{color:var(--muted)}
header .site b{color:var(--fg)}
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
<span class="site"><b>BAMA</b> · ${escapeHtml(copy.title)}</span>
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
  const body = `<h1>BAMA — מסמכים משפטיים · Legal</h1>
<ul class="pages">
${PAGES.map(item).join('\n')}
</ul>`;
  return shell({
    lang: 'he',
    title: 'BAMA — מסמכים משפטיים · Legal',
    description: 'התקנון ומדיניות הפרטיות של BAMA, בעברית ובאנגלית. BAMA Terms of Use and Privacy Policy.',
    header: '<header><span class="site"><b>BAMA</b></span></header>',
    body,
  });
}

export function build(srcDir = join(ROOT, 'legal-site/src'), outDir = join(ROOT, 'legal-site/public')) {
  rmSync(outDir, { recursive: true, force: true });
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
