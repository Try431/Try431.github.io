const test = require('node:test');
const assert = require('node:assert');
const S = require('../site.js');

test('normalizePath strips index.html and ensures trailing slash', () => {
    assert.equal(S.normalizePath('/pct--2017/the-trail'), '/pct--2017/the-trail/');
    assert.equal(S.normalizePath('/pct--2017/the-trail/index.html'), '/pct--2017/the-trail/');
    assert.equal(S.normalizePath('/'), '/');
    assert.equal(S.normalizePath('/scotland/'), '/scotland/');
});

test('renderNav marks active entry and renders groups', () => {
    const nav = [{label: 'Scotland', url: '/scotland/'},
                 {label: 'PCT - 2017', children: [{label: 'The Trail', url: '/pct--2017/the-trail/'}]}];
    const html = S.renderNav(nav, '/pct--2017/the-trail/index.html');
    assert.match(html, /<li class="gallery active"><a href="\/pct--2017\/the-trail\/"><span>The Trail<\/span><\/a><\/li>/);
    assert.match(html, /<li class="gallery"><a href="\/scotland\/">/);
    assert.match(html, /<li><span class="label">PCT - 2017<\/span><ul>/);
    assert.match(S.renderNav([{label: 'A & <B>', url: '/a/'}], '/'), /A &amp; &lt;B&gt;/);
});

test('isPhone detects narrow or coarse+short viewports', () => {
    assert.equal(S.isPhone({width: 390, height: 844, coarse: true}), true);
    assert.equal(S.isPhone({width: 844, height: 390, coarse: true}), true);
    assert.equal(S.isPhone({width: 390, height: 844, coarse: false}), true); // narrow still counts
    assert.equal(S.isPhone({width: 1024, height: 400, coarse: false}), false);
    assert.equal(S.isPhone({width: 1440, height: 900, coarse: false}), false);
});

test('captionMode defaults to below on phone portrait, overlay elsewhere', () => {
    assert.equal(S.captionMode(undefined, true), 'below');
    assert.equal(S.captionMode('overlay', true), 'overlay');
    assert.equal(S.captionMode('below', true), 'below');
    assert.equal(S.captionMode('below', false), 'overlay');
    assert.equal(S.captionMode('garbage', true), 'below');
});

test('captionFontSize scales with width and respects floors', () => {
    assert.deepEqual(S.captionFontSize(1280), {fontSize: 14, lineHeight: 22});
    assert.deepEqual(S.captionFontSize(390), {fontSize: 11, lineHeight: 14});
    assert.deepEqual(S.captionFontSize(2560), {fontSize: 28, lineHeight: 44});
});

test('videoPreloadCount reduces on phones and save-data', () => {
    assert.equal(S.videoPreloadCount({phone: false, saveData: false}), 8);
    assert.equal(S.videoPreloadCount({phone: true, saveData: false}), 2);
    assert.equal(S.videoPreloadCount({phone: false, saveData: true}), 1);
    assert.equal(S.videoPreloadCount({phone: true, saveData: true}), 1);
});

test('pickResolution picks smallest dense-enough size', () => {
    const res = [3840, 2560, 1920, 1280];
    assert.equal(S.pickResolution(res, 1440, 1, 170), 1280);   // 1270px -> 1280
    assert.equal(S.pickResolution(res, 1440, 2, 170), 2560);   // 2540px -> 2560
    assert.equal(S.pickResolution(res, 390, 3, 0), 1280);      // phone, no sidebar
    assert.equal(S.pickResolution(res, 3000, 2, 170), 3840);   // none dense enough -> largest
});

test('fitBox fits image inside viewport preserving aspect', () => {
    assert.deepEqual(S.fitBox(1920, 1080, 844, 390), {width: 693, height: 390});
    assert.deepEqual(S.fitBox(1080, 1920, 390, 844), {width: 390, height: 693});
    assert.deepEqual(S.fitBox(100, 100, 400, 300), {width: 300, height: 300});
});

test('showRotateHint only for wide slides in portrait', () => {
    assert.equal(S.showRotateHint({landscape: false, imgW: 1920, imgH: 1080}), true);
    assert.equal(S.showRotateHint({landscape: false, imgW: 1080, imgH: 1920}), false);
    assert.equal(S.showRotateHint({landscape: true, imgW: 1920, imgH: 1080}), false);
});


test('keyAction maps keys to slide actions', () => {
    assert.equal(S.keyAction(' ', false, false), 'next');
    assert.equal(S.keyAction(' ', true, false), 'prev');
    assert.equal(S.keyAction('ArrowDown', false, false), 'next');
    assert.equal(S.keyAction('ArrowUp', false, false), 'prev');
    assert.equal(S.keyAction('PageDown', false, false), 'next');
    assert.equal(S.keyAction('PageUp', false, false), 'prev');
    assert.equal(S.keyAction('j', false, false), 'next');
    assert.equal(S.keyAction('k', false, false), 'prev');
    assert.equal(S.keyAction('ArrowRight', false, true), 'next');
    assert.equal(S.keyAction('ArrowLeft', false, true), 'prev');
    assert.equal(S.keyAction('ArrowDown', false, true), 'next');
    assert.equal(S.keyAction('ArrowUp', false, true), 'prev');
    assert.equal(S.keyAction('PageDown', false, true), 'next');
    assert.equal(S.keyAction(' ', false, true), 'next');
    assert.equal(S.keyAction(' ', true, true), 'prev');
    assert.equal(S.keyAction('ArrowRight', false, false), null);
    assert.equal(S.keyAction('ArrowLeft', false, false), null);
    assert.equal(S.keyAction('Escape', false, true), 'close');
    assert.equal(S.keyAction('Escape', false, false), null);
    assert.equal(S.keyAction('x', false, false), null);
});

test('belowCaptionHtml strips on-photo spacing hacks', () => {
    // runs of non-breaking/em spaces collapse to one normal space
    assert.equal(S.belowCaptionHtml('<p>Peak. &nbsp;&nbsp;&nbsp;&nbsp;Whitney</p>'), '<p>Peak. Whitney</p>');
    assert.equal(S.belowCaptionHtml('<p>a&emsp;&emsp;&ensp;b</p>'), '<p>a b</p>');
    assert.equal(S.belowCaptionHtml('<p>a\u00a0\u00a0\u2003b</p>'), '<p>a b</p>');
    // single &nbsp; between words is kept (intentional no-break)
    assert.equal(S.belowCaptionHtml('<p>Mt.&nbsp;Whitney</p>'), '<p>Mt.&nbsp;Whitney</p>');
    // stacked <br> spacers collapse; leading/trailing ones in a paragraph go
    assert.equal(S.belowCaptionHtml('<p>a<br><br><br>b</p>'), '<p>a<br>b</p>');
    assert.equal(S.belowCaptionHtml('<p><br><br>&emsp;&emsp;Ben!</p>'), '<p>Ben!</p>');
    assert.equal(S.belowCaptionHtml('<p>wife.<br><br></p>'), '<p>wife.</p>');
    // no stray space right after a line break
    assert.equal(S.belowCaptionHtml('<p>Whitney -- <br>&nbsp;&nbsp;&nbsp;turns</p>'), '<p>Whitney --<br>turns</p>');
    // paragraphs emptied by the cleanup are dropped
    assert.equal(S.belowCaptionHtml('<p>x</p> <p>&nbsp;&nbsp;</p>'), '<p>x</p>');
    // links and attributes survive
    assert.equal(S.belowCaptionHtml('<p><a href="https://a.com/?x=1">a</a></p>'), '<p><a href="https://a.com/?x=1">a</a></p>');
});

test('captionStage lays captions out at page width, then scales to the frame', () => {
    // phone landscape: page slide 915 wide, viewer frame 549x412 (4:3)
    const s = S.captionStage(549, 412, 915);
    assert.equal(s.width, 915);
    assert.equal(Math.round(s.height), 687);
    assert.ok(Math.abs(s.scale - 549 / 915) < 1e-9);
    // frame keeps its aspect ratio inside the stage
    assert.ok(Math.abs(s.width / s.height - 549 / 412) < 1e-9);
    // frame wider than the page column (desktop viewer has no sidebar): scale up
    assert.ok(S.captionStage(1280, 720, 1110).scale > 1);
    // no usable reference width: lay out at frame size
    assert.deepEqual(S.captionStage(600, 400, 0), {width: 600, height: 400, scale: 1});
});
