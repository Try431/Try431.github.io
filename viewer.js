// Full-screen slide viewer: a sideways scroll-snap strip of the current
// gallery's slides, one per screen. Tapping a photo opens it; swiping moves
// between slides. Pinch, double-tap and trackpad-pinch zoom the current
// photo; while zoomed, one finger pans instead of swiping.
// Used by global.js via window.Viewer.
var Viewer = (function(){

	var $root = null;
	var $track = null;
	var slides = [];
	var currentIndex_ = 0;
	var pushedState = false;
	var relayouting = false;

	// zoom state for the current frame: translate(x,y) scale(s), origin 0 0
	var zoom = {scale: 1, x: 0, y: 0};
	var ZOOM_TAP_MS = 300;
	var DOUBLE_TAP_SCALE = 2.5;
	var tapTimer = null;
	var lastTap = {t: 0, x: 0, y: 0};
	var recentTouchEnd = 0;
	var pinch = null;
	var pan = null;
	var touchMoved = false;
	var mousePan = null;

	function isOpen(){
		return $root !== null;
	}

	function currentIndex(){
		return currentIndex_;
	}

	function slideUrl(slide){
		var res = current_resolution;
		if(parseInt($(slide).data('imagewidth')) < res){
			res = parseInt($(slide).data('imagewidth'));
		}
		return resourcepath + $(slide).find('img.image').data('url') + '/' + res + '.jpg';
	}

	function mountImage($frame, index){
		if($frame.find('img.viewer-img').length === 0){
			$frame.append('<img class="viewer-img" src="' + slideUrl(slides[index]) + '" alt="" />');
		}
	}

	function mountVideo($frame, index){
		var slide = slides[index];
		if($frame.find('video').length > 0 || $(slide).data('type') !== 'video'){
			return;
		}
		var res = current_resolution;
		if(parseInt($(slide).data('imagewidth')) < res){
			res = parseInt($(slide).data('imagewidth'));
		}
		var base = resourcepath + $(slide).find('img.image').data('url');
		var formats = String($(slide).data('videoformats')).split(' ');
		var vid = document.createElement('video');
		vid.className = 'viewer-img';
		vid.autoplay = true;
		vid.muted = true;
		vid.loop = true;
		vid.setAttribute('playsinline', '');
		vid.poster = base + '/' + res + '.jpg';
		// phones try the decoder-friendly -mobile encode first (site.js)
		var sources = Site.videoSources({
			base: base, res: res, imageWidth: parseInt($(slide).data('imagewidth')),
			formats: formats, phone: phoneState().phone, videoFormats: video_formats
		});
		sources.forEach(function(s){
			var src = document.createElement('source');
			src.src = s.src;
			src.type = s.type;
			vid.appendChild(src);
		});
		$frame.append(vid);
	}

	function mountCaption($frame, index){
		if($frame.find('.viewer-post').length > 0){
			return;
		}
		var slide = slides[index];
		var $post = $(slide).find('.post').first().clone();
		$post.removeClass('hidden').addClass('viewer-post');
		// the viewer is on-photo, so it wants the authored caption, not the
		// below-mode cleanup the page may be showing
		var orig = $(slide).find('.post .content').first().data('origHtml');
		if(orig !== undefined){
			$post.find('.content').first().html(orig);
		}
		$post.find('.polygon').remove();
		$post.find('.content').show();
		// the clone leaves the slide, so its inherited color has to be set
		var textcolor = $(slide).data('textcolor');
		if(textcolor){
			$post.css('color', textcolor);
		}
		// lay out at the page's slide width and font, then scale to the frame
		var stage = Site.captionStage($frame.width(), $frame.height(), pageSlideWidth());
		var size = Site.captionFontSize($(window).width());
		var $stage = $('<div class="viewer-stage"></div>').css({
			width: stage.width + 'px',
			height: stage.height + 'px',
			'font-size': size.fontSize + 'px',
			'line-height': size.lineHeight + 'px'
		});
		$stage.append($post);
		$frame.append($stage);
		// polygon fill measures positions, so run it before the transform
		var polygon = $(slide).data('polygon');
		if(polygon && $.isArray(polygon) && polygon.length >= 3){
			fillpolygon($post.find('.content').eq(0), polygon.slice());
		}
		$stage.css('transform', 'scale(' + stage.scale + ')');
	}

	// width a slide has on the scrolling page (the layout captions are designed
	// against); computed rather than measured since the page sits under the viewer
	function pageSlideWidth(){
		if(phoneState().phone){
			return window.innerWidth;
		}
		return window.innerWidth - ($('#marker').outerWidth() || 0) - ($('#sidebar').outerWidth() || 0);
	}

	function currentFrame(){
		return $track.find('.viewer-slide').eq(currentIndex_).find('.viewer-frame');
	}

	function frameGeom(){
		var f = currentFrame().get(0);
		return f ? {w: f.offsetWidth, h: f.offsetHeight} : null;
	}

	// pointer coords relative to the current slide's top-left (the space the
	// zoom math works in)
	function slidePoint(clientX, clientY){
		var r = $track.find('.viewer-slide').eq(currentIndex_).get(0).getBoundingClientRect();
		return {x: clientX - r.left, y: clientY - r.top};
	}

	function applyZoom(){
		var $frame = currentFrame();
		$frame.css('transform', 'translate(' + zoom.x + 'px,' + zoom.y + 'px) scale(' + zoom.scale + ')');
		$root.toggleClass('zoomed', zoom.scale > 1.01);
	}

	function resetZoom(){
		zoom = {scale: 1, x: 0, y: 0};
		if($root){
			$track.find('.viewer-frame').css('transform', '');
			$root.removeClass('zoomed');
		}
	}

	function zoomTo(newScale, clientX, clientY){
		var g = frameGeom();
		if(!g){
			return;
		}
		var pt = slidePoint(clientX, clientY);
		zoom = Site.zoomAbout(zoom, pt.x, pt.y, newScale, g.w, g.h, window.innerWidth, window.innerHeight);
		applyZoom();
	}

	function isZoomed(){
		return zoom.scale > 1.01;
	}

	function cancelPendingTap(){
		if(tapTimer){
			clearTimeout(tapTimer);
			tapTimer = null;
		}
	}

	function requestClose(){
		if(pushedState){
			history.back();
		}
		else{
			close();
		}
	}

	// only the centered slide's video plays
	function syncViewerVideos(){
		if(!$track){
			return;
		}
		$track.find('.viewer-slide').each(function(i){
			var v = $(this).find('video').get(0);
			if(!v){
				return;
			}
			if(i === currentIndex_){
				if(v.paused){
					v.play().catch(function(){});
				}
			}
			else if(!v.paused){
				v.pause();
			}
		});
	}

	function layoutFrames(){
		if(!isOpen()){
			return;
		}
		// ignore scroll-derived index updates until the track has been
		// re-scrolled — mid-rotation it reads the wrong slide
		relayouting = true;
		resetZoom();
		var vpW = window.innerWidth;
		var vpH = window.innerHeight;
		$track.find('.viewer-frame').each(function(i){
			var slide = slides[i];
			var box = Site.fitBox(parseInt($(slide).data('imagewidth')),
				parseInt($(slide).data('imageheight')), vpW, vpH);
			$(this).css({width: box.width + 'px', height: box.height + 'px'});
			// captions were sized for the old frame; remount the mounted ones
			if($(this).find('.viewer-post').length){
				$(this).find('.viewer-stage').remove();
				mountCaption($(this), i);
			}
		});
		// keep the current slide in view after the layout change
		$track.scrollLeft(currentIndex_ * window.innerWidth);
		updateHint();
		setTimeout(function(){ relayouting = false; }, 200);
	}

	function updateHint(){
		if(!isOpen()){
			return;
		}
		var slide = slides[currentIndex_];
		var show = Site.showRotateHint({
			landscape: window.innerWidth > window.innerHeight,
			imgW: parseInt($(slide).data('imagewidth')),
			imgH: parseInt($(slide).data('imageheight'))
		});
		$root.find('.rotate-hint').toggle(show);
	}

	function loadAround(index){
		for(var i = Math.max(0, index - 2); i <= Math.min(slides.length - 1, index + 2); i++){
			var $frame = $track.find('.viewer-frame').eq(i);
			mountImage($frame, i);
			mountCaption($frame, i);
		}
		var vidCount = Site ? Site.videoPreloadCount({
			phone: phoneState().phone,
			saveData: !!(navigator.connection && navigator.connection.saveData)
		}) : 2;
		for(var v = Math.max(0, index - vidCount); v <= Math.min(slides.length - 1, index + vidCount); v++){
			mountVideo($track.find('.viewer-frame').eq(v), v);
		}
		// unmount far videos to bound memory, same as the page does
		$track.find('.viewer-frame').each(function(i){
			if(Math.abs(i - index) > vidCount){
				$(this).find('video').remove();
			}
		});
		syncViewerVideos();
	}

	// the current slide is whichever the track has scrolled to; scrollLeft is
	// exact (slides are 100vw snap points), unlike an IntersectionObserver
	// which misreads during rotation/layout changes
	function onTrackScroll(){
		if(relayouting || !isOpen()){
			return;
		}
		var i = Math.round($track.get(0).scrollLeft / window.innerWidth);
		i = Math.min(Math.max(i, 0), slides.length - 1);
		if(i !== currentIndex_){
			currentIndex_ = i;
			resetZoom();
			updateHint();
			loadAround(i);
		}
	}

	function touchDist(a, b){
		var dx = a.clientX - b.clientX;
		var dy = a.clientY - b.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function touchMid(a, b){
		return {x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2};
	}

	function onTouchStart(e){
		if(e.touches.length === 2){
			cancelPendingTap();
			pinch = {
				dist: touchDist(e.touches[0], e.touches[1]),
				zoom: {scale: zoom.scale, x: zoom.x, y: zoom.y}
			};
			pan = null;
			touchMoved = true;
		}
		else if(e.touches.length === 1){
			pinch = null;
			touchMoved = false;
			pan = {x: e.touches[0].clientX, y: e.touches[0].clientY, zx: zoom.x, zy: zoom.y};
		}
	}

	function onTouchMove(e){
		if(e.touches.length === 2 && pinch){
			e.preventDefault();
			var d = touchDist(e.touches[0], e.touches[1]);
			var m = touchMid(e.touches[0], e.touches[1]);
			var pt = slidePoint(m.x, m.y);
			var g = frameGeom();
			if(g){
				zoom = Site.zoomAbout(pinch.zoom, pt.x, pt.y,
					pinch.zoom.scale * d / pinch.dist,
					g.w, g.h, window.innerWidth, window.innerHeight);
				applyZoom();
			}
			touchMoved = true;
		}
		else if(e.touches.length === 1 && pan){
			var t = e.touches[0];
			var dx = t.clientX - pan.x;
			var dy = t.clientY - pan.y;
			if(Math.abs(dx) + Math.abs(dy) > 10){
				touchMoved = true;
			}
			if(isZoomed()){
				e.preventDefault();
				var g2 = frameGeom();
				if(g2){
					zoom = Site.clampPan({scale: zoom.scale, x: pan.zx + dx, y: pan.zy + dy},
						g2.w, g2.h, window.innerWidth, window.innerHeight);
					applyZoom();
				}
			}
		}
	}

	function onTouchEnd(e){
		recentTouchEnd = Date.now();
		if(e.touches.length > 0){
			// lifted one finger of a pinch: the remaining finger pans from here
			if(e.touches.length === 1){
				pinch = null;
				pan = {x: e.touches[0].clientX, y: e.touches[0].clientY, zx: zoom.x, zy: zoom.y};
			}
			return;
		}
		if(pinch){
			if(zoom.scale < 1.05){
				resetZoom();
			}
			pinch = null;
			pan = null;
			touchMoved = false;
			return;
		}
		pan = null;
		if(touchMoved){
			touchMoved = false;
			return;
		}
		if($(e.target).closest('a').length){
			return;
		}
		var t = e.changedTouches[0];
		var now = Date.now();
		if(now - lastTap.t < ZOOM_TAP_MS &&
			Math.abs(t.clientX - lastTap.x) < 25 && Math.abs(t.clientY - lastTap.y) < 25){
			cancelPendingTap();
			lastTap = {t: 0, x: 0, y: 0};
			if(isZoomed()){
				resetZoom();
			}
			else{
				zoomTo(DOUBLE_TAP_SCALE, t.clientX, t.clientY);
			}
			return;
		}
		lastTap = {t: now, x: t.clientX, y: t.clientY};
		if(isZoomed()){
			return;
		}
		// a single tap closes, but only once it's clearly not a double-tap
		tapTimer = setTimeout(function(){
			tapTimer = null;
			requestClose();
		}, ZOOM_TAP_MS);
	}

	function onTouchCancel(){
		pinch = null;
		pan = null;
		touchMoved = false;
		if(zoom.scale < 1.05){
			resetZoom();
		}
	}

	function open(index, by){
		if(isOpen()){
			return;
		}
		slides = $('.slide').toArray();
		currentIndex_ = index;

		$root = $('<div id="viewer"><div class="viewer-track"></div>' +
			'<button class="viewer-close" aria-label="Close">&times;</button>' +
			'<div class="rotate-hint"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#eee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M17 8l3-3-3-3"/><path d="M20 5a8 8 0 0 1-8 8"/></svg></div></div>');
		$track = $root.find('.viewer-track');
		slides.forEach(function(slide, i){
			$track.append('<div class="viewer-slide"><div class="viewer-frame"></div></div>');
		});
		$('body').append($root).addClass('viewer-open');

		layoutFrames();
		loadAround(index);
		$track.scrollLeft(index * window.innerWidth);

		var trackEl = $track.get(0);
		trackEl.addEventListener('scroll', function(){
			onTrackScroll();
		});
		trackEl.addEventListener('touchstart', onTouchStart, {passive: true});
		trackEl.addEventListener('touchmove', onTouchMove, {passive: false});
		trackEl.addEventListener('touchend', onTouchEnd);
		trackEl.addEventListener('touchcancel', onTouchCancel);

		// mouse click on the photo or its caption closes the viewer; links pass
		// through, and synthesized post-touch clicks are ignored (touchend
		// handles taps, with a delay for double-tap detection)
		$track.on('click', '.viewer-frame', function(e){
			if($(e.target).closest('a').length){
				return;
			}
			if(Date.now() - recentTouchEnd < 700 || isZoomed() || (mousePan && mousePan.moved)){
				return;
			}
			requestClose();
		});

		// mouse drag pans while zoomed
		$track.on('mousedown', '.viewer-frame', function(e){
			if(!isZoomed() || $(e.target).closest('a').length){
				return;
			}
			mousePan = {x: e.clientX, y: e.clientY, zx: zoom.x, zy: zoom.y, moved: false};
			e.preventDefault();
		});
		$(window).on('mousemove.viewer', function(e){
			if(!mousePan){
				return;
			}
			var dx = e.clientX - mousePan.x;
			var dy = e.clientY - mousePan.y;
			if(Math.abs(dx) + Math.abs(dy) > 4){
				mousePan.moved = true;
			}
			var g = frameGeom();
			if(g){
				zoom = Site.clampPan({scale: zoom.scale, x: mousePan.zx + dx, y: mousePan.zy + dy},
					g.w, g.h, window.innerWidth, window.innerHeight);
				applyZoom();
			}
		});
		$(window).on('mouseup.viewer', function(){
			setTimeout(function(){ mousePan = null; }, 0);
		});

		// wheel: trackpad pinch (ctrlKey) zooms, otherwise one slide per gesture
		var lastWheelStep = 0;
		trackEl.addEventListener('wheel', function(e){
			e.preventDefault();
			if(e.ctrlKey){
				zoomTo(zoom.scale * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
				return;
			}
			if(isZoomed()){
				return;
			}
			var delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
			var now = Date.now();
			if(!delta || now - lastWheelStep < 300){
				return;
			}
			lastWheelStep = now;
			go(delta > 0 ? 1 : -1);
		}, {passive: false});
		$root.find('.viewer-close').click(requestClose);

		// browser back closes the viewer instead of leaving the gallery;
		// disable scroll restoration so it can't override where close() lands
		try{
			if('scrollRestoration' in history){
				history.scrollRestoration = 'manual';
			}
			history.pushState({viewer: true}, '');
			pushedState = true;
			$(window).on('popstate.viewer', function(){
				pushedState = false;
				close();
			});
		}
		catch(e){
			pushedState = false;
		}

		// Android: real fullscreen + landscape lock, best effort
		if(phoneState().phone && by === 'tap'){
			try{
				var p = $root.get(0).requestFullscreen && $root.get(0).requestFullscreen();
				if(p && p.catch){ p.catch(function(){}); }
				if(screen.orientation && screen.orientation.lock){
					screen.orientation.lock('landscape').catch(function(){});
				}
			}
			catch(e){}
		}

		// the page's videos keep playing under the overlay; pause them
		if(window.pausePageVideos){
			window.pausePageVideos(true);
		}

		$(window).on('resize.viewer orientationchange.viewer', layoutFrames);
	}

	function close(){
		if(!isOpen()){
			return;
		}
		var hadState = pushedState;
		pushedState = false;
		cancelPendingTap();
		$(window).off('resize.viewer orientationchange.viewer popstate.viewer mousemove.viewer mouseup.viewer');
		zoom = {scale: 1, x: 0, y: 0};
		pinch = null;
		pan = null;
		mousePan = null;
		var target = currentIndex_;
		$root.remove();
		$root = null;
		$track = null;
		$('body').removeClass('viewer-open');

		if(screen.orientation && screen.orientation.unlock){
			try{ screen.orientation.unlock(); }catch(e){}
		}
		if(document.fullscreenElement && document.exitFullscreen){
			document.exitFullscreen().catch(function(){});
		}
		if(window.pausePageVideos){
			window.pausePageVideos(false);
		}

		// land the page on the slide the viewer ended on; deferred so any
		// browser scroll restoration from the history navigation can't win
		var slide = $('.slide').eq(target).get(0);
		if(slide){
			var anchor = function(){
				window.scrollTo(0, $(slide).offset().top);
			};
			setTimeout(function(){
				anchor();
				activateSlide(slide);
			}, 50);
			// exiting fullscreen / unlocking orientation can resize and reflow
			// after that first scroll (caption mode can flip too), so keep
			// re-anchoring until things settle or the user takes over
			var anchoring = true;
			var timer = null;
			var stop = function(){
				if(!anchoring){
					return;
				}
				anchoring = false;
				clearTimeout(timer);
				$(window).off('.anchor');
				$(document).off('.anchor');
			};
			timer = setTimeout(stop, 1500);
			$(window).on('resize.anchor orientationchange.anchor', anchor)
				.on('wheel.anchor touchstart.anchor keydown.anchor', stop);
			$(document).on('fullscreenchange.anchor webkitfullscreenchange.anchor', anchor);
		}

		// pop the history entry pushed at open unless we're already inside
		// a popstate (back button / close button path)
		if(hadState){
			history.back();
		}
	}

	function go(delta){
		if(!isOpen()){
			return;
		}
		var next = Math.min(Math.max(currentIndex_ + delta, 0), slides.length - 1);
		resetZoom();
		$track.scrollLeft(next * window.innerWidth);
		currentIndex_ = next;
		loadAround(next);
		updateHint();
	}

	return {
		open: open,
		close: close,
		isOpen: isOpen,
		currentIndex: currentIndex,
		go: go
	};
})();
