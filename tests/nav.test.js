const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const nav = require('../nav.js');

const repoRoot = path.join(__dirname, '..');

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

test('every nav leaf points to a gallery that exists on disk', () => {
    const seen = new Set();
    for (const e of leaves(nav)){
        assert.match(e.url, /^\/[a-z0-9-]+(\/[a-z0-9-]+)*\/$/, `bad url ${e.url}`);
        assert.ok(!seen.has(e.url), `duplicate url ${e.url}`);
        seen.add(e.url);
        assert.ok(fs.existsSync(path.join(repoRoot, e.url, 'index.html')),
            `missing index.html for ${e.url}`);
    }
});
