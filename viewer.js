// Full-screen slide viewer: a sideways scroll-snap strip of the current
// gallery's slides, one per screen. Tapping a photo opens it; swiping moves
// between slides. Used by global.js via window.Viewer.
var Viewer = (function(){

	var $root = null;
	var $track = null;
	var slides = [];
	var currentIndex_ = 0;
	var observer = null;
	var pushedState = false;

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
		formats.forEach(function(f){
			if(!f || !video_formats[f]){
				return;
			}
			var src = document.createElement('source');
			src.src = base + '/' + res + '-' + f + '.' + video_formats[f].extension;
			src.type = video_formats[f].type;
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

	function layoutFrames(){
		if(!isOpen()){
			return;
		}
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

		// track which slide is centered
		if(typeof IntersectionObserver !== 'undefined'){
			var ratios = new Map();
			observer = new IntersectionObserver(function(entries){
				entries.forEach(function(e){
					ratios.set(e.target, e.intersectionRatio);
				});
				var best = null, bestRatio = 0;
				ratios.forEach(function(r, el){
					if(r > bestRatio){ bestRatio = r; best = el; }
				});
				if(best){
					currentIndex_ = $track.find('.viewer-slide').index(best);
					updateHint();
					loadAround(currentIndex_);
				}
			}, {root: $track.get(0), threshold: [0.5, 0.9]});
			$track.find('.viewer-slide').each(function(){
				observer.observe(this);
			});
		}

		// any click on the photo or its caption closes the viewer;
		// links inside captions pass through untouched
		$track.on('click', '.viewer-frame', function(e){
			if($(e.target).closest('a').length){
				return;
			}
			if(pushedState){
				history.back();
			}
			else{
				close();
			}
		});

		// mouse wheel steps one slide per gesture
		var trackEl = $track.get(0);
		var lastWheelStep = 0;
		trackEl.addEventListener('wheel', function(e){
			e.preventDefault();
			var delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
			var now = Date.now();
			if(!delta || now - lastWheelStep < 300){
				return;
			}
			lastWheelStep = now;
			go(delta > 0 ? 1 : -1);
		}, {passive: false});
		$root.find('.viewer-close').click(function(){
			if(pushedState){
				history.back();
			}
			else{
				close();
			}
		});

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

		$(window).on('resize.viewer orientationchange.viewer', layoutFrames);
	}

	function close(){
		if(!isOpen()){
			return;
		}
		var hadState = pushedState;
		pushedState = false;
		$(window).off('resize.viewer orientationchange.viewer popstate.viewer');
		if(observer){
			observer.disconnect();
			observer = null;
		}
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

		// land the page on the slide the viewer ended on; deferred so any
		// browser scroll restoration from the history navigation can't win
		var slide = $('.slide').eq(target).get(0);
		if(slide){
			setTimeout(function(){
				window.scrollTo(0, $(slide).offset().top);
				activateSlide(slide);
			}, 50);
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
