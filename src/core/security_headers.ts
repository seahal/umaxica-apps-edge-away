const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
};

// Shared visual language with Jump; navigation remains script-free.
export const AWAY_CSS =
  ':root{color-scheme:light;--splash-bg:#1c1917;--paper:#f6f4ef;--ink:#1c1917;--border:#e4e0d8;--muted:#57534e;--alert-bg:#fff7ed;--alert-border:#9a3412;--alert-ink:#9a3412;--panel:#fffdf8;--control:#78716c;--hover:#e7e5e4}*{box-sizing:border-box}a:focus-visible,button:focus-visible{outline:3px solid var(--ink);outline-offset:4px}main{overflow-wrap:anywhere}a{color:inherit}a,button{touch-action:manipulation}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--splash-bg:#0c0a09;--paper:#1c1917;--ink:#f6f4ef;--border:#78716c;--muted:#d6d3d1;--alert-bg:#431407;--alert-border:#fdba74;--alert-ink:#fed7aa;--panel:#292524;--control:#a8a29e;--hover:#44403c}}body.splash{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--splash-bg);color:var(--ink);font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI","Yu Gothic",YuGothic,system-ui,sans-serif;padding:1.25rem}body.splash main{width:min(26rem,100%);box-sizing:border-box;padding:1.25rem 1.5rem 1.75rem;background:var(--paper)}body.splash .bar{display:grid;grid-template-columns:2.75rem 1fr 2.75rem;align-items:center;margin:0 0 1.25rem}body.splash .brand{grid-column:2;text-align:center;font-size:.75rem;letter-spacing:.14em;font-weight:700;color:var(--muted)}body.splash .back,body.splash .about{display:grid;place-items:center;box-sizing:border-box;width:2.75rem;height:2.75rem;padding:0;border:1px solid var(--control);border-radius:50%;background:none;color:var(--muted);cursor:pointer}body.splash .back{grid-column:1}body.splash .about{grid-column:3}body.splash .back[hidden]{display:none}body.splash .back:hover,body.splash .about:hover{background:var(--hover)}body.splash .back:focus-visible,body.splash .about:focus-visible{outline:2px solid var(--ink);outline-offset:3px}body.splash h1{font-size:1.25rem;line-height:1.3;margin:0 0 .75rem}body.splash p{margin:0 0 1.25rem;color:var(--muted);line-height:1.65}body.splash p:last-child{margin-bottom:0}body.splash .actions{display:flex;justify-content:center}body.splash .primary{display:inline-block;padding:.7rem 1.1rem;background:var(--ink);color:var(--paper);text-decoration:none;font-weight:600}body.splash .primary:hover{background:var(--muted)}body.splash .primary:focus{outline:2px solid var(--ink);outline-offset:3px}' +
  'body.splash main.card{width:min(42rem,100%)}.host{font-size:1.25rem;font-weight:700;overflow-wrap:anywhere}dl{margin:0 0 1.5rem;padding:1rem;background:var(--panel);border:1px solid var(--border)}dt{font-size:.75rem;color:var(--muted);margin-bottom:.25rem}dd{margin:0 0 1rem;overflow-wrap:anywhere;word-break:break-word}dd:last-child{margin-bottom:0}body.splash .actions{flex-wrap:wrap;gap:1rem;align-items:center}body.splash .actions a{min-height:2.75rem;display:inline-flex;align-items:center}body.splash .about{text-decoration:none;font-weight:700}';

export function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.delete('Set-Cookie');
  headers.delete('Server');
  headers.delete('X-Powered-By');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// About-page presentation adapted from Jump; no Jump runtime or trust data.
export const ABOUT_CSS =
  ':root{color-scheme:light;--splash-bg:#1c1917;--paper:#f6f4ef;--ink:#1c1917;--border:#e4e0d8;--muted:#57534e;--alert-bg:#fff7ed;--alert-border:#9a3412;--alert-ink:#9a3412;--panel:#fffdf8;--control:#78716c;--hover:#e7e5e4}*{box-sizing:border-box}a:focus-visible,button:focus-visible{outline:3px solid var(--ink);outline-offset:4px}main{overflow-wrap:anywhere}a{color:inherit}a,button{touch-action:manipulation}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--splash-bg:#0c0a09;--paper:#1c1917;--ink:#f6f4ef;--border:#78716c;--muted:#d6d3d1;--alert-bg:#431407;--alert-border:#fdba74;--alert-ink:#fed7aa;--panel:#292524;--control:#a8a29e;--hover:#44403c}}body.product{margin:0;min-height:100dvh;display:flex;flex-direction:column;background:var(--paper);color:var(--ink);font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI","Yu Gothic",YuGothic,system-ui,sans-serif;line-height:1.65}body.product header,body.product footer{padding:1rem 1.25rem}body.product header{border-bottom:1px solid var(--border)}body.product header a{color:inherit;text-decoration:none;font-weight:700;letter-spacing:.12em}body.product main{flex:1;width:min(40rem,calc(100% - 2.5rem));margin:2.5rem auto}body.product h1{font-size:clamp(1.5rem,4vw,2rem);line-height:1.25;margin:0 0 1rem}body.product p{margin:0 0 1rem}body.product dl{margin:0 0 1.5rem;padding:1rem 1.15rem;background:var(--panel);border:1px solid var(--border)}body.product dt{font-size:.75rem;color:var(--muted);margin:0 0 .15rem}body.product dd{margin:0 0 .85rem;word-break:break-all}body.product dd:last-child{margin-bottom:0}body.product footer{margin-top:auto;border-top:1px solid var(--border);color:var(--muted);font-size:.875rem}@media (min-width:40rem){body.product header,body.product footer{padding:1.1rem 2rem}}body.product main{margin-block:clamp(1.5rem,5vw,2.5rem)}body.product header a{display:inline-flex;align-items:center;min-height:2.75rem}body.product dl{border-radius:.25rem}body.product dd{overflow-wrap:anywhere}';
