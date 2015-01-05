(function(window, Sparky) {
	"use strict";

	var extend = Sparky.extend;

	function createId(resource) {
		var ids = resource.map(function(object) {
		    	return object[resource.index];
		    });

		var id = 0;

		// Decrement id until an id that does not already
		// exist is found. 
		while (ids.indexOf(--id) !== -1);

		return id;
	}

	function addId(resource) {
		// Give the object an id if it does not already have one.
		if (!isDefined(object[resource.index])) {
			object[resource.index] = createId(resource);
		}
	}

	window.AutoIdResource = function(url, settings) {
		var options = extend({ properties: {} }, settings);

		options.setup = function setup(resource) {
			resource.on('add', addId);
			settings.setup && settings.setup(resource);
		};

		options.properties.url = {
			get: function() {
				// Where the key is a number, make sure it is positive. Negative
				// numbers are unsaved ids.
				if (url && isDefined(this[resource.index]) &&
				   (typeof this[resource.index] !== 'number' || this[resource.index] > -1)) {
					return url + '/' + this[resource.index];
				}
			},
			set: function(url) {
				console.log('Resource: trying to set resource url. Dont.', url);
			},
			enumerable: false,
			configurable: true
		};

		return Resource(url, options);
	};
})(window, window.Sparky);
