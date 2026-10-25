const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const nav = require('../nav.js');

const repoRoot = path.join(__dirname, '..');
const SITE = 'https://idgarza.com';

function* leaves(entries){
    for (const e of entries){
        if (e.children){
            yield* leaves(e.children);
        }
        else{
            yield e;
        }
    }
}

function ogContent(html, prop){
    const m = html.match(new RegExp("property='og:" + prop + "' content=(['\"])(.*?)\\1"));
    return m ? m[2] : null;
}

test('mobile layout-viewport guard', () => {
    // #main's desktop min-width must be cleared by a media query, or mobile
    // browsers expand the layout viewport to ~1000px and body.phone never
    // applies (innerWidth reports "desktop")
    const css = fs.readFileSync(path.join(repoRoot, 'global.css'), 'utf8');
    assert.ok(/@media[^{]*max-width:\s*768px[^{]*\{[\s\S]*#main\{[^}]*min-width:\s*0/.test(css),
        'missing media-query min-width override for #main');
});

test('bio page /', () => {
    const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    for (const script of ['jquery.min.js', 'nav.js', 'site.js', 'global.js']){
        assert.ok(html.includes(`src="${script}"`) || html.includes(`src="./${script}"`),
            `missing ${script}`);
    }
    assert.match(html, /<ul id="nav">\s*<\/ul>/);
    assert.match(html, /<h1><a href="\/">/);
    assert.ok(!html.includes('bootstrap'), 'still uses bootstrap');
    assert.ok(!html.includes('landing_page.css'), 'still uses landing_page.css');
    assert.ok(!/not optimized for mobile/i.test(html), 'still has mobile disclaimer');
    assert.equal(ogContent(html, 'url'), 'https://idgarza.com/');
    assert.ok(!html.includes('CHANGE ME'));
});

for (const e of leaves(nav)){
    test(`gallery page ${e.url}`, () => {
        const file = path.join(repoRoot, e.url, 'index.html');
        const html = fs.readFileSync(file, 'utf8');
        const depth = e.url.split('/').filter(Boolean).length;
        const prefix = '../'.repeat(depth);

        // viewport
        assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);

        // jQuery is vendored at the repo root — no CDN dependency
        assert.ok(html.includes(`src="${prefix}jquery.min.js"`),
            `missing local jquery in ${e.url}`);

        // script order: nav.js, site.js, viewer.js, global.js after jquery/cookie
        for (const script of ['nav.js', 'site.js', 'viewer.js', 'global.js']){
            assert.ok(html.includes(`src="${prefix}${script}"`),
                `missing ${prefix}${script} in ${e.url}`);
        }
        const order = ['nav.js', 'site.js', 'viewer.js', 'global.js'].map(s => html.indexOf(prefix + s));
        assert.ok(order.every((v, i) => i === 0 || order[i - 1] < v), `scripts out of order in ${e.url}`);

        // shared nav: ul is empty in the file, filled by global.js at runtime
        assert.match(html, /<ul id="nav">\s*<\/ul>/);

        // title links to bio page
        assert.match(html, /<h1><a href="\/">/);

        // og tags
        assert.equal(ogContent(html, 'url'), SITE + e.url);
        assert.ok(ogContent(html, 'title'), 'missing og:title');
        assert.ok(ogContent(html, 'description'), 'missing og:description');
        assert.ok(!html.includes('CHANGE ME'), 'unfilled template value');
        const img = ogContent(html, 'image');
        assert.ok(img && img.startsWith(SITE + e.url), `bad og:image ${img}`);
        const rel = img.slice(SITE.length);
        const m = rel.match(/\/(\d+)\.jpg$/);
        assert.ok(m && parseInt(m[1]) <= 1920, `og:image too large: ${img}`);
        assert.ok(fs.existsSync(path.join(repoRoot, rel)), `og:image missing on disk: ${rel}`);
    });
}
