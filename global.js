var loadnext = 6 // preload next 6 slides
var loadprev = 3; // keep previous 3 slides in case user scrolls up

var videoloadnext=8; // preload videos

var resourcepath;

var current_resolution = 1920;
var resolution = [];

var current_slide = $('.slide').get(0);

// true on gallery pages, false on the bio page (which shares this file)
function isGalleryPage(){
	return $('.slide').length > 0;
}

function phoneState(){
	var coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
	return {
		phone: window.Site ? Site.isPhone({width: window.innerWidth, height: window.innerHeight, coarse: coarse}) : false,
		landscape: window.innerWidth > window.innerHeight
	};
}

function currentSlideIndex(){
	return $('.slide').index(current_slide);
}

var video_formats={
	h265: { extension: "mp4", type: "video/mp4; codecs=hev1.1.2.L93.B0"},
	h264: { extension: "mp4", type: "video/mp4"},
	vp9: { extension: "webm", type: "video/webm; codecs=vp9"},
	vp8: { extension: "webm", type: "video/webm; codecs=vp8"},
	ogv: { extension: "ogv", type: "video/ogg"}
};

function drawtext(){
	var screen_width = $(window).width();
	
	// set font size based on actual resolution, normalized at 14px/22px for 720
	var size = window.Site ? Site.captionFontSize(screen_width) : {fontSize: 14, lineHeight: 22};
	var fontsize = size.fontSize;
	var lineheight = size.lineHeight;

	$('body').css('font-size',fontsize+'px');
	$('body').css('line-height',lineheight+'px');
	
	// polygon boundary feature (skipped in captions-below mode)
	if(!$('body').hasClass('captions-below')){
		$('.slide').each(function(){
			var polygon = $(this).data('polygon');

			if(polygon && $.isArray(polygon) && polygon.length >= 3){
				fillpolygon($(this).find('.content').eq(0),polygon);
			}
		});
	}
}

function redrawtext(){
	$('.slide .polygon').remove();
	$('.slide .content').show();
	
	drawtext();
}

$(document).ready(function(){

	// render the shared nav (nav.js + site.js) before any handlers bind to it
	if(window.SITE_NAV && window.Site){
		var $nav = $('#nav');
		if($nav.length){
			$nav.html(Site.renderNav(SITE_NAV, location.pathname));
		}
	}

	if(isGalleryPage()){

	// set slide heights to prevent reflow
	$('.slide').each(function(){
		$(this).css('padding-top', (100*$(this).data('imageheight')/$(this).data('imagewidth')) + '%');
	});

	resourcepath = $('body').data('respath');

	// detect resolution
	var saved_width = $.cookie('resolution');
	var screen_width = $(window).width();

	drawtext();

	// build resolution selector
	$.each(String($('body').data('resolution')).split(" "),function(i, v){
		if(v){
			resolution.push(parseInt(v));
		}
	});
	
	resolution.sort(function(a, b){return b-a;});
	
	var selector = '';
	$.each(resolution, function(i, v){
		// use 16:9 XXXp conventions for labels. eg. 1080p, 1440p etc
		var label;
		
		if(i == resolution.length-1 && v <= 1024){
			label = 'mobile';
		}
		else if(v == 3840){
			label = '4K';
		}
		else{
			var h = parseInt((9/16)*v);
			label = h+'p';
		}
		
		selector += '<li data-res="'+v+'"><a href="#">'+label+'</a></li>';
	});
	
	selector = '<ul>'+selector+'</ul>';
	
	$('#resolution').append(selector);
		
	// resolution select
	
	$('#resolution ul li').click(function(){
		var new_resolution = $(this).data('res');
		
		if(current_resolution != new_resolution){
			current_resolution = new_resolution;
			// update all urls
			$('.slide').each(function(index){
				var set_res = current_resolution;
				if(parseInt($(this).data('imagewidth')) < current_resolution){
					set_res = parseInt($(this).data('imagewidth'));
				}
				var url = resourcepath + $(this).find('img.image').data('url');
				$(this).find('img.image').not('.blank').prop('src',url+'/'+set_res+'.jpg');
			});
			
			// set ui
			$('#resolution li.active').removeClass('active');
			$(this).addClass('active');
			
			$.cookie('resolution', current_resolution,  { expires: 7, path: '/' });
		}
		
		$('#resbutton .restext').text($(this).find('a').text());
		
		$('#resolution').removeClass('active');
		return false;
	});
	
	// click away from dialog
	$('body').click(function(e) {
	    if (!$(e.target).is('#resolution')) {
	        $('#resolution').removeClass('active');
	    }
	});
  	
	if(saved_width){
		// used cookie value if set
		$('#resolution li').each(function(i){
			var val = parseInt($(this).data('res'));
			if(saved_width == val){
				$(this).trigger('click');
				$(this).addClass('active');
				return false;
			}
		});
	}
	else{
		// pick the smallest resolution dense enough for this screen,
		// accounting for pixel density and (on desktop) the sidebar
		var sidebar_width = phoneState().phone ? 0 : $('#marker').width() + $('#sidebar').width();
		var device_ratio = window.devicePixelRatio ? window.devicePixelRatio : 1;
		var target = window.Site ? Site.pickResolution(resolution, $(window).width(), device_ratio, sidebar_width) : resolution[0];
		$('#resolution li').each(function(){
			if(parseInt($(this).data('res')) === target){
				$(this).trigger('click');
				$(this).addClass('active');
				return false;
			}
		});
	}

	placeResolution();

	// lighter video preloading on phones and data-saver connections
	if(window.Site){
		videoloadnext = Site.videoPreloadCount({
			phone: phoneState().phone,
			saveData: !!(navigator.connection && navigator.connection.saveData)
		});
	}

	// track the current slide
	if(slideObserver){
		$('.slide').each(function(){
			slideObserver.observe(this);
		});
	}
	else{
		scrollcheck();
	}

	// add marker
	var mheight = 100/$('.slide').length;
	$('.slide').each(function(i, v){
		var color1 = $(this).data('color1');
		var color7 = $(this).data('color7');
		if(!color1){
			color1 = '#000';
		}
		if(!color7){
			color7 = '#fff';
		}
		$('#marker').append('<li style="background-color: '+color1+'; height: '+mheight+'%"><a href="#'+(i+1)+'" style="background-color: '+color7+'"></a></li>');
	});

	// caption position toggle (phone drawer): overlay on photo vs below it
	$('#control').append('<li class="phone-only"><a href="#" id="captionbutton"><span class="toggle icon"></span><span class="text">text on photo</span></a></li>');
	applyCaptionMode();
	$('#captionbutton').click(function(){
		var next = $('body').hasClass('captions-below') ? 'overlay' : 'below';
		$.cookie('captions', next, {expires: 365, path: '/'});
		applyCaptionMode();
		return false;
	});

	// tapping/clicking a slide opens the full-screen viewer;
	// links inside captions pass through untouched
	$('#main').on('click', '.slide', function(e){
		if($(e.target).closest('a').length){
			return;
		}
		if(window.Viewer){
			Viewer.open($('.slide').index(this), phoneState().phone ? 'tap' : 'click');
		}
	});

	} // isGalleryPage

	// add back hover behavior erased by color changes
	$('#sidebar a, #resolution a').not('#nav .active a').mouseenter(function(){
		var color = $(this).css('color');
		$(this).css('color','#ffffff');
		$(this).data('prevcolor',color);
	}).mouseleave(function(){
		var color = $(this).data('prevcolor');
		if(color){
			$(this).css('color',color);
		}
	});
	
	// browser detect
	if($.browser.webkit){
		$('.icon').addClass('webkit');
	}
	
	
	$('#resbutton').click(function(){
		if($('#resolution').hasClass('active')){
			$('#resolution').removeClass('active');
		}
		else{
			$('#resolution').addClass('active');
		}
		return false;
	});
	
	// text toggle
	$('#textbutton').click(function(){
		if($(this).hasClass('active')){
			$('.post').addClass('hidden');
			$(this).removeClass('active');
			$(this).find('.text').text('show text');
		}
		else{
			$('.post').removeClass('hidden');
			$(this).addClass('active');
			$(this).find('.text').text('hide text');
		}

		return false;
	});

	// collapsible menu: the whole sidebar becomes a drawer on phones
	var $menubutton = $('<button id="menubutton" aria-label="Menu"><span></span><span></span><span></span></button>');
	$('body').append($menubutton);
	$menubutton.click(function(){
		$('body').toggleClass('menu-open');
		return false;
	});
	$(document).on('click', function(e){
		if($('body').hasClass('menu-open') && !$(e.target).closest('#sidebar, #menubutton').length){
			closeMenu();
		}
	});
	$('#nav').on('click', 'a', closeMenu);

	// keyboard navigation: arrows/space/j/k move between slides on the page,
	// left/right and Escape drive the viewer, Escape closes the menu
	$(document).keydown(function(e){
		if(e.ctrlKey || e.altKey || e.metaKey){
			return;
		}
		var tag = (e.target.tagName || '').toLowerCase();
		if(tag === 'input' || tag === 'textarea' || tag === 'select'){
			return;
		}
		if(!window.Site){
			return;
		}
		var key = e.key;
		if(!key){
			var keys = {32: ' ', 33: 'PageUp', 34: 'PageDown', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 74: 'j', 75: 'k'};
			key = keys[e.which] || '';
		}
		var viewerOpen = window.Viewer && Viewer.isOpen();
		var action = Site.keyAction(key, e.shiftKey, viewerOpen);
		if(viewerOpen && action){
			e.preventDefault();
			if(action === 'close'){
				Viewer.close();
			}
			else{
				Viewer.go(action === 'next' ? 1 : -1);
			}
			return;
		}
		if(action && isGalleryPage()){
			e.preventDefault();
			var delta = action === 'next' ? 1 : -1;
			var target = $('.slide').eq(currentSlideIndex() + delta).get(0);
			if(target){
				$('html, body').animate({scrollTop: $(target).offset().top}, 250);
			}
			return;
		}
		if(e.which === 27){
			closeMenu();
		}
	});

	// resolution options: desktop keeps the fixed flyout after #sidebar; on
	// phones the list nests under the Resolution button and shows as chips.
	// a no-op on the bio page, which has no #resolution/#resbutton
	function placeResolution(){
		if(phoneState().phone){
			$('#resolution').appendTo($('#resbutton').closest('li'));
		}
		else{
			$('#resolution').insertAfter($('#sidebar'));
		}
	}

	// keep body.phone in sync with the viewport
	function updatePhoneClass(){
		$('body').toggleClass('phone', phoneState().phone);
		placeResolution();
		applyCaptionMode();
	}
	updatePhoneClass();
	$(window).on('resize orientationchange', updatePhoneClass);

});

// captions sit below the photo by default while scrolling in portrait on
// phones; the toggle's choice persists in the 'captions' cookie
function applyCaptionMode(){
	var state = phoneState();
	var mode = window.Site ? Site.captionMode($.cookie('captions'), state.phone && !state.landscape) : 'overlay';
	var below = mode === 'below';
	var changed = below !== $('body').hasClass('captions-below');
	if(changed){
		swapCaptionHtml(below);
	}
	$('body').toggleClass('captions-below', below);
	$('#captionbutton .text').text(below ? 'text on photo' : 'text below photo');
	if(changed && isGalleryPage()){
		redrawtext();
	}
}

// below the photo, captions use a copy without the on-photo spacing hacks;
// the authored html is kept in data('origHtml') for overlay mode and the viewer
function swapCaptionHtml(below){
	$('#main .post .content').each(function(){
		var $c = $(this);
		if(below){
			if($c.data('origHtml') === undefined){
				$c.data('origHtml', $c.html());
			}
			var cleaned = Site.belowCaptionHtml($c.data('origHtml'));
			$c.html(cleaned);
			// a caption that is empty (or emptied by the cleanup) shouldn't
			// render a blank block below the photo
			$c.closest('.post').toggleClass('post-empty', $.trim($('<div>').html(cleaned).text()) === '');
		}
		else if($c.data('origHtml') !== undefined){
			$c.html($c.data('origHtml'));
			$c.closest('.post').removeClass('post-empty');
		}
	});
}

function closeMenu(){
	$('body').removeClass('menu-open');
}


function scrollcheck(){

	// current slide is the one with the largest overlap with screen
	var new_slide = false;
	var maxoverlap = 0;
	$('.slide').each(function(){
		var overlap = findoverlap(this);				
	
		if(overlap > maxoverlap){
			maxoverlap = overlap;
			new_slide = this;
		}
	});
	
	if(new_slide && new_slide != current_slide){
		activateSlide(new_slide);
	}
}

// everything that has to happen when a new slide becomes current:
// the image/video loading window, custom colors, and the nav marker
function activateSlide(slide){
		current_slide = slide;
		var index = $('.slide').index(current_slide);

		$('.slide .image').removeClass('active');
		$('.slide video').removeClass('active');
		
		// load next N slides as per config
		// remove videos from dom as we scroll past
		$('.slide').each(function(i){
			var img = $(this).find('img.image');
			
			var set_res = current_resolution;
			if(parseInt($(this).data('imagewidth')) < current_resolution){
				set_res = parseInt($(this).data('imagewidth'));
			}
			
			if(i-index >= -loadprev && i-index<=loadnext){
				var url = resourcepath + img.data('url');
				if($(this).data('type') == 'video'){
					if(i-index >= 0 && i-index <= videoloadnext){ // preload next N videos
						if($(this).find('video').length === 0){

							var formats = String($(this).data("videoformats")).split(" ");
							if(formats.length > 0){
								var vidstring = '<div class="progress active"><div class="bar" style="background-color: '+$(this).parent().data('textcolor')+'"></div></div>';
								vidstring += '<video class="image" poster="' + url+'/'+set_res+'.jpg" alt="" autoplay="autoplay" muted="muted" playsinline loop="loop" preload="auto" width="'+$(this).width()+'" height="'+$(this).outerHeight()+'">';

								// phones try the decoder-friendly -mobile encode first (site.js)
								var sources = window.Site ? Site.videoSources({
									base: url, res: set_res, imageWidth: parseInt($(this).data('imagewidth')),
									formats: formats, phone: phoneState().phone, videoFormats: video_formats
								}) : formats.map(function(v){ var f = video_formats[v]; return {src: url+'/'+set_res+'-'+v+'.'+f.extension, type: f.type}; });
								$.each(sources, function(i, s){
									vidstring += '<source src="'+s.src+'" type="'+s.type+'"></source>';
								});
								
								vidstring += '</video>';
								
								$(this).append(vidstring);
								watchVideo($(this).find('video').get(0));
								$(this).find('video').get(0).addEventListener('progress', function() {
									try{
										var percent = 100 * this.buffered.end(0) / this.duration;
										$(this).parent().find('.progress .bar').css('width',percent+'%');
										if(percent > 90){
											$(this).parent().find('.progress').removeClass('active');
										}
									}
									catch (e) {}
								});
							}
						}
						
					}
				}
				img.prop('src',url+'/'+set_res+'.jpg').removeClass('blank');
			}
			else{
				// keeping all videos takes too much memory, reset as we go along
				$(this).find('img.image').addClass('blank');
				$(this).find('video').each(function(){
					unwatchVideo(this);
				});
				$(this).find('video, .progress').remove();
			}
		});
		
		$(current_slide).find('.image').addClass('active');

		$(current_slide).nextAll().filter('.slide').slice(0,5).find('img.image').addClass('active');
		$(current_slide).prevAll().filter('.slide').slice(0,2).find('img.image').addClass('active');
		$(current_slide).prevAll().filter('.slide').slice(0,2).find('video.image').addClass('active');
		$(current_slide).nextAll().filter('.slide').slice(0,2).find('video.image').addClass('active');


		
		// set custom colors
		var sidebackground = $(current_slide).data('color2');
		if(sidebackground){
			$('#sidebar .background').css('background-color',sidebackground);
		}
		
		var resbackground = $(current_slide).data('color3');
		if(resbackground){
			$('#resolution').css('background-color',resbackground);
		}
		
		
		var highcolor = $(current_slide).data('textcolor');
		var sidecolor = $(current_slide).data('color6');
		if(sidecolor){
			$('#sidebar, #sidebar a, #resolution a').css('color',sidecolor);
			$('#sidebar .active a, #resolution .active a').css('color',highcolor).css('border-color', highcolor);
		}
		
		$('#sidebar .icon.webkit').css('background-color',sidecolor);
				
		// highlight nav
		
		if(index >= 0){
			$('#marker li.active').removeClass('active');
			$('#marker li').eq(index).addClass('active');
		}

		return false;
}

_now = Date.now || function() { return new Date().getTime(); };

throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : _now();
      timeout = null;
      result = func.apply(context, args);
      context = args = null;
    };
    return function() {
      var now = _now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
        context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

// video playback: mounted videos buffer but only decode while visible, and
// stay paused while the viewer is open (the viewer plays its own copy)
var pageVideoRatios = typeof Map !== 'undefined' ? new Map() : null;
var pageVideosMutedForViewer = false;
var pageVideoObserver = null;
var pageVideoPlaying = null;

function syncPageVideos(){
	if(!pageVideoRatios){
		return;
	}
	// phones decode one video at a time: only the most-visible one plays
	var phone = phoneState().phone;
	var winner = null;
	if(phone && window.Site){
		var entries = [];
		pageVideoRatios.forEach(function(ratio, v){
			if(v.isConnected){
				entries.push({id: v, ratio: ratio});
			}
		});
		winner = Site.pickPlayingVideo(entries, pageVideoPlaying);
		pageVideoPlaying = winner;
	}
	else{
		pageVideoPlaying = null;
	}
	pageVideoRatios.forEach(function(ratio, v){
		if(!v.isConnected){
			pageVideoRatios.delete(v);
			if(pageVideoObserver){
				pageVideoObserver.unobserve(v);
			}
			return;
		}
		var shouldPlay = !pageVideosMutedForViewer && (phone ? v === winner : ratio >= 0.25);
		if(shouldPlay && v.paused){
			v.play().catch(function(){});
		}
		else if(!shouldPlay && !v.paused){
			v.pause();
		}
	});
}

if(typeof IntersectionObserver !== 'undefined' && pageVideoRatios){
	pageVideoObserver = new IntersectionObserver(function(entries){
		entries.forEach(function(e){
			pageVideoRatios.set(e.target, e.intersectionRatio);
		});
		syncPageVideos();
	}, {threshold: [0, 0.25, 0.5]});
}

function watchVideo(v){
	if(pageVideoObserver && v){
		pageVideoObserver.observe(v);
		pageVideoRatios.set(v, 0);
		syncPageVideos();
	}
}

function unwatchVideo(v){
	if(pageVideoObserver && v){
		pageVideoObserver.unobserve(v);
		pageVideoRatios.delete(v);
	}
}

// called by viewer.js on open/close
window.pausePageVideos = function(on){
	pageVideosMutedForViewer = !!on;
	syncPageVideos();
};

// slide tracking: IntersectionObserver reports visibility directly, so the
// current slide updates instantly instead of on a throttled scroll handler
var slideRatios = typeof Map !== 'undefined' ? new Map() : null;
var slideObserver = null;
if(typeof IntersectionObserver !== 'undefined' && slideRatios){
	slideObserver = new IntersectionObserver(function(entries){
		entries.forEach(function(e){
			slideRatios.set(e.target, e.intersectionRatio);
		});
		var best = null;
		var bestRatio = 0;
		slideRatios.forEach(function(ratio, el){
			if(ratio > bestRatio){
				bestRatio = ratio;
				best = el;
			}
		});
		if(best && best !== current_slide){
			activateSlide(best);
		}
	}, {threshold: [0, 0.25, 0.5, 0.75, 1]});
}
else{
	$(window).scroll(throttle(scrollcheck, 700));
}

var redrawtext_throttled = throttle(redrawtext, 1000);
$(window).resize(redrawtext_throttled);

function findoverlap(elem)
{
	var winHeight = $(window).height();
    var docViewTop = $(window).scrollTop();
    var docViewBottom = docViewTop + winHeight;

    var elemTop = $(elem).offset().top;
	var elemHeight = $(elem).outerHeight();
    var elemBottom = elemTop + elemHeight;
	
	var overlap = (Math.min(elemBottom, docViewBottom) - Math.max(elemTop, docViewTop));
	if(overlap > 0){
		return overlap/(winHeight);
	}
    return 0;
}

// given content element and a polygon definition, fill the polygon with content text and hide original content
function fillpolygon(content, polygon){
	if(!polygon || polygon.length < 3){
		return false;
	}
	
	// loop back to first vertex
	polygon.push(polygon[0]);
	
	var fill = $('<div class="polygon" />');
	content.after(fill);
	var cwidth = content.width();
	var cheight = content.height();

	content.contents().each(function(){
		var isblock = false;
		var samefont = true;
		if(this.nodeType == 1){
			isblock = $(this).css("display") == "block";
			samefont = $(content).css("font-size") == $(this).css("font-size");
		}

		// stuff like h1 h2 etc will be difficult to wrap, put them on the first intercept and don't attempt to wrap
		var coords;
		if(this.nodeType == 1 && isblock && !samefont){
			// html, no end clip
			var clone = $(this).clone();
			fill.append(clone);
			
			coords = intersect(100*(clone.position().top/content.height()), polygon);
			
			if(coords.length === 0){
				coords = 0;
			}
			else{
				coords = coords.shift();
			}
			if(coords > 0){
				clone.prepend('<span class="filler" style="width: '+coords+'%"></span>');
			}
		}
		else if(this.nodeType == 3 || this.nodeType == 1){ // text node
			
                        var text;
                        
			if(this.nodeType == 3){
				text = this.nodeValue.trim();
			}
			else{
				text = $(this).text();
			}
			
			if(!text){
				return true;
			}
			
			var words = text.match(/\S+/g);

			while(words.length > 0){
				// wrap in span so we can get dimensions
				var span;
				if(this.nodeType == 3 || isblock){
					span = $('<span class="line">&nbsp;</span>');
				}
				else{
					span = $(this).clone().text('');
				}
				
				fill.append(span);
				
				var left = 100*(span.position().left/cwidth);
				var top = 100*(span.position().top/cheight);
				
				if(top > 100){
					span.remove();
					return false;
				}
				
				var min = left;
				var max = 100;
				
				coords = intersect(top, polygon);
				
				if(!coords || coords.length < 2){
					min = 0;
					max = 100;
				}
				
				// depending on the x position of the span, we may not care about certain intercepts
				for(var i=0; i<coords.length; i += 2){
					if(coords[i] >= left){
						min = coords[i];
						max = coords[i+1];
						break;
					}
				}				
				
				// shift to min
				span.before('<span class="filler" style="width: '+(min-left)+'%" />');
				
				// type out text until wraps
				for(i=1; i<=words.length; i++){
					var height = span.height();
					
					span.text(words.slice(0, i).join(' '));
					
					var width = 100*(span.width()/cwidth);
					if(min+width > max){
						break;
					}
				}
				
				if(coords.length < 3 || min+max > 100){
					fill.append('<br />');
				}
								
				words = words.slice(i);
			}
			
			if(this.nodeType != 3 && isblock){
				fill.append('<br />');
			}
		}
		else if(this.nodeType == 1){
			fill.append($(this).clone());
		}
	});
	
	content.hide();
}

// find all intersections between a horizontal line at height, and the given polygon
function intersect(height, polygon){
	if(polygon.length < 3){
		return false;
	}
	
	var points = [];
	for(var i=0; i<polygon.length-1; i++){
		var p1 = polygon[i];
		var p2 = polygon[i+1];
		
		// horizontal line
		if(p1.y == p2.y && height == p1.y){
			if(p1.x < p2.x){
				points.push(p1.x);
			}
			else{
				points.push(p2.x);
			}
		}		
		if(p1.y == height && $.inArray(p1.x, points) < 0){
			points.push(p1.x);
		}
		if(p2.y == height && $.inArray(p2.x, points) < 0){
			points.push(p2.x);
		}
		if(p1.y < height && p2.y > height){
			points.push(p1.x + ((height-p1.y)/(p2.y-p1.y))*(p2.x-p1.x));
		}
		else if(p1.y > height && p2.y < height){
			points.push(p2.x + ((height-p2.y)/(p1.y-p2.y))*(p1.x-p2.x));
		}
	}
	
	
	// sort intercepts left to right
	points.sort(function(a,b){
		return a-b;
	});
	
	return points;
}

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

// add back browser detect
jQuery.uaMatch = function( ua ) {
ua = ua.toLowerCase();
var match = /(chrome)[ \/]([\w.]+)/.exec( ua ) ||
    /(webkit)[ \/]([\w.]+)/.exec( ua ) ||
    /(opera)(?:.*version|)[ \/]([\w.]+)/.exec( ua ) ||
    /(msie) ([\w.]+)/.exec( ua ) ||
    ua.indexOf("compatible") < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec( ua ) ||
    [];
return {
    browser: match[ 1 ] || "",
    version: match[ 2 ] || "0"
};
};
if ( !jQuery.browser ) {
matched = jQuery.uaMatch( navigator.userAgent );
browser = {};
if ( matched.browser ) {
    browser[ matched.browser ] = true;
    browser.version = matched.version;
}
// Chrome is Webkit, but Webkit is also Safari.
if ( browser.chrome ) {
    browser.webkit = true;
} else if ( browser.webkit ) {
    browser.safari = true;
}
jQuery.browser = browser;
}
