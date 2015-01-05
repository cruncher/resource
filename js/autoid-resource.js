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
		var options = extend({}, settings);

		options.setup = function setup(resource) {
			resource.on('add', addId);
			settings.setup && settings.setup(resource);
		};

		return Resource(url, options);
	};
})(window, window.Sparky);
