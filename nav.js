// Single source of truth for the site navigation, rendered by global.js.
// Add an entry here (and copy the new gallery folder in) to add a section.
(function(root){
	var nav = [
		{label: 'Ice Boats', url: '/iceboats/'},
		{label: 'Iceland (Spring Break)', url: '/iceland-spring-break/'},
		{label: 'PCT - 2017', children: [
			{label: 'Simple Beautiful', url: '/pct--2017/simple-beautiful/'},
			{label: 'The Trail', url: '/pct--2017/the-trail/'}
		]},
		{label: 'Bloody Canyon Trail', url: '/bloody-canyon/'},
		{label: 'Bishop Climbing Trip', url: '/bishop/'},
		{label: 'Big Pine Lakes Trail', url: '/big-pine/'},
		{label: 'Portugal', url: '/portugal/'},
		{label: 'Scotland', url: '/scotland/'},
		{label: 'Iceland (Laugavegur)', url: '/iceland-laugavegur/'}
	];
	if (typeof module !== 'undefined' && module.exports){
		module.exports = nav;
	}
	root.SITE_NAV = nav;
}(typeof self !== 'undefined' ? self : this));
