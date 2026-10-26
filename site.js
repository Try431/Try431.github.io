// Pure helpers for the site: no DOM access, so these run under Node's
// test runner as well as in the browser. Consumed by global.js, viewer.js,
// and the landing page.
(function(root, factory){
	var api = factory();
	if (typeof module !== 'undefined' && module.exports){
		module.exports = api;
	}
	root.Site = api;
}(typeof self !== 'undefined' ? self : this, function(){

	function normalizePath(pathname){
		var p = String(pathname || '/');
		p = p.replace(/index\.html$/, '');
		if (p.charAt(0) !== '/'){
			p = '/' + p;
		}
		if (p.charAt(p.length - 1) !== '/'){
			p += '/';
		}
		return p;
	}

	function escapeHtml(s){
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function renderNav(entries, pathname){
		var here = normalizePath(pathname);
		var html = '';
		entries.forEach(function(e){
			if (e.children){
				html += '<li><span class="label">' + escapeHtml(e.label) + '</span><ul>' + renderNav(e.children, pathname) + '</ul></li>';
			}
			else{
				var active = normalizePath(e.url) === here ? ' active' : '';
				html += '<li class="gallery' + active + '"><a href="' + e.url + '"><span>' + escapeHtml(e.label) + '</span></a></li>';
			}
		});
		return html;
	}

	function isPhone(state){
		if (state.width <= 768){
			return true;
		}
		if (state.coarse && state.height <= 500){
			return true;
		}
		return false;
	}

	function captionMode(cookieValue, phonePortrait){
		if (!phonePortrait){
			return 'overlay';
		}
		return cookieValue === 'overlay' ? 'overlay' : 'below';
	}

	function captionFontSize(width){
		return {
			fontSize: Math.max(11, Math.floor(14 * (width / 1280))),
			lineHeight: Math.max(14, Math.floor(22 * (width / 1280)))
		};
	}

	function videoPreloadCount(state){
		if (state.saveData){
			return 1;
		}
		return state.phone ? 2 : 8;
	}

	// Video <source> list for a slide, in try-order.
	// Desktop: one source per format at min(res, imageWidth), as always.
	// Phone: the decoder-friendly "-mobile" h264 encode first (capped at
	// 1920 = 1080p, the sizes we generate), then the normal h264 file capped
	// at 2560 (1440p) as a fallback for unconverted galleries, then any other
	// formats at that same capped size. Photos are unaffected — this only
	// applies to the <video> sources.
	var MOBILE_VIDEO_RES = 1920;
	var PHONE_VIDEO_CAP = 2560;
	function videoSources(opts){
		var res = Math.min(opts.res, opts.imageWidth);
		var out = [];
		var videoFormats = opts.videoFormats;
		var capped = res;
		if (opts.phone){
			capped = Math.min(res, PHONE_VIDEO_CAP);
			if (opts.formats.indexOf('h264') >= 0 && videoFormats.h264){
				out.push({
					src: opts.base + '/' + Math.min(capped, MOBILE_VIDEO_RES) + '-h264-mobile.mp4',
					type: videoFormats.h264.type
				});
			}
		}
		opts.formats.forEach(function(f){
			var fmt = videoFormats[f];
			if (!f || !fmt){
				return;
			}
			out.push({src: opts.base + '/' + capped + '-' + f + '.' + fmt.extension, type: fmt.type});
		});
		return out;
	}

	// Which page video should be playing (phones play only one at a time).
	// entries: [{id, ratio}]; returns the id of the most-visible video that is
	// at least a quarter on screen, or null. The current video wins a near-tie
	// so playback doesn't flip between two half-visible videos while scrolling.
	function pickPlayingVideo(entries, current){
		var best = null;
		var bestRatio = 0;
		var currentRatio = -1;
		entries.forEach(function(e){
			if (e.ratio > bestRatio){
				bestRatio = e.ratio;
				best = e.id;
			}
			if (e.id === current){
				currentRatio = e.ratio;
			}
		});
		if (currentRatio >= 0.25 && best !== null && bestRatio - currentRatio <= 0.05){
			return current;
		}
		return bestRatio >= 0.25 ? best : null;
	}

	// pick the smallest resolution that is at least 90% as dense as the
	// adjusted viewport needs; fall back to the largest available.
	function pickResolution(resolutions, viewportWidth, dpr, sidebarWidth){
		var needed = (viewportWidth - sidebarWidth) * (dpr || 1);
		var picked = null;
		resolutions.forEach(function(res){
			if (res / needed >= 0.9){
				if (picked === null || res < picked){
					picked = res;
				}
			}
		});
		if (picked === null){
			resolutions.forEach(function(res){
				if (picked === null || res > picked){
					picked = res;
				}
			});
		}
		return picked;
	}

	// fit a box of imgW x imgH inside vpW x vpH, preserving aspect ("contain")
	function fitBox(imgW, imgH, vpW, vpH){
		var scale = Math.min(vpW / imgW, vpH / imgH);
		return {width: Math.round(imgW * scale), height: Math.round(imgH * scale)};
	}

	function showRotateHint(state){
		return !state.landscape && state.imgW > state.imgH;
	}

	// Viewer zoom: a zoomed frame is transformed translate(x,y) scale(s) with
	// transform-origin at its top-left, inside a viewport-sized slide where its
	// unzoomed position is centered. Coordinates below are in that slide's
	// space, so the unzoomed frame's top-left sits at ((vpW-frameW)/2, ...).
	var ZOOM_MAX = 5;

	// constrain translate so the scaled frame never pulls an edge inside the
	// viewport; when smaller than the viewport on an axis it stays centered
	function clampPan(state, frameW, frameH, vpW, vpH){
		function axis(t, size, vp){
			var o = (vp - size) / 2;
			var span = state.scale * size;
			if (span <= vp){
				return (vp - span) / 2 - o;
			}
			return Math.min(Math.max(t, vp - span - o), -o);
		}
		return {
			scale: state.scale,
			x: axis(state.x, frameW, vpW),
			y: axis(state.y, frameH, vpH)
		};
	}

	// change scale while keeping the frame point under (px, py) fixed
	function zoomAbout(state, px, py, newScale, frameW, frameH, vpW, vpH){
		var s = Math.min(Math.max(newScale, 1), ZOOM_MAX);
		var ox = (vpW - frameW) / 2;
		var oy = (vpH - frameH) / 2;
		var fx = (px - ox - state.x) / state.scale;
		var fy = (py - oy - state.y) / state.scale;
		return clampPan({scale: s, x: px - ox - s * fx, y: py - oy - s * fy},
			frameW, frameH, vpW, vpH);
	}


	function keyAction(key, shiftKey, viewerOpen){
		if (viewerOpen){
			if (key === 'Escape'){
				return 'close';
			}
		}
		if (key === ' '){
			return shiftKey ? 'prev' : 'next';
		}
		switch (key){
			case 'ArrowDown':
			case 'PageDown':
			case 'j':
				return 'next';
			case 'ArrowUp':
			case 'PageUp':
			case 'k':
				return 'prev';
			case 'ArrowRight':
				return viewerOpen ? 'next' : null;
			case 'ArrowLeft':
				return viewerOpen ? 'prev' : null;
			default:
				return null;
		}
	}

	// Captions are authored for on-photo placement, using runs of hard
	// spaces, stacked <br>s etc. to line text up with the picture. Below the
	// photo those hacks just push text out of the box, so strip them.
	var HARD_SPACE = '(?:&nbsp;|&#160;|&ensp;|&#8194;|&emsp;|&#8195;|&thinsp;|&#8201;|[\\u00a0\\u2002\\u2003\\u2009])';
	var BR = '<br\\s*\\/?>';
	function belowCaptionHtml(html){
		return String(html)
			// 2+ hard spaces (with any normal whitespace mixed in) -> one space
			.replace(new RegExp('(?:\\s*' + HARD_SPACE + '){2,}\\s*', 'g'), ' ')
			// stacked line breaks -> one
			.replace(new RegExp('(?:' + BR + '\\s*){2,}', 'g'), '<br>')
			// no whitespace or hard spaces hugging a line break
			.replace(new RegExp('(?:\\s|' + HARD_SPACE + ')*(' + BR + ')(?:\\s|' + HARD_SPACE + ')*', 'g'), '$1')
			// no line breaks or leading space at the start/end of a paragraph
			.replace(new RegExp('(<p[^>]*>)(?:\\s|' + HARD_SPACE + '|' + BR + ')+', 'g'), '$1')
			.replace(new RegExp('(?:\\s|' + HARD_SPACE + '|' + BR + ')+(<\\/p>)', 'g'), '$1')
			// drop paragraphs the cleanup emptied
			.replace(/\s*<p[^>]*>\s*<\/p>/g, '')
			.trim();
	}

	// The viewer lays captions out on a "stage" as wide as the page's slide
	// (same font, same line breaks as scrolling), then scales the stage to the
	// viewer frame, so the caption layout matches the page, just resized.
	function captionStage(frameW, frameH, refW){
		if (!(refW > 0)){
			return {width: frameW, height: frameH, scale: 1};
		}
		return {width: refW, height: refW * frameH / frameW, scale: frameW / refW};
	}

	return {
		captionStage: captionStage,
		belowCaptionHtml: belowCaptionHtml,
		normalizePath: normalizePath,
		renderNav: renderNav,
		isPhone: isPhone,
		captionMode: captionMode,
		captionFontSize: captionFontSize,
		videoPreloadCount: videoPreloadCount,
		videoSources: videoSources,
		pickPlayingVideo: pickPlayingVideo,
		pickResolution: pickResolution,
		fitBox: fitBox,
		showRotateHint: showRotateHint,
		clampPan: clampPan,
		zoomAbout: zoomAbout,
		keyAction: keyAction
	};
}));
