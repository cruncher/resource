(function(window, Sparky, mixin) {
	"use strict";

	var debug = window.debug !== false;

	var failedPromise = new Promise(function(accept, reject) {
		reject('Object not found in resource.');
	});

	var itemPrototype = Object.defineProperties({}, {
		save: {
			value: function save() {
				console.log('Resource: object.save()', this);

				if (this.validate()) {
					if (isDefined(this.url)) {
						console.log('PATCH');
						return this.request('patch');
					}
					else {
						console.log('POST');
						return this.request('post');
					}
				}
				else {
					console.log('SAVE failed - object not valid', this);
				}

				return failedPromise;
			}
		},

		validate: {
			value: returnTrue,
			writable: true
		}
	});

	var itemProperties = {
		_saved:    { value: false,  writable: true, enumerable: false },
		_saving:   { value: false,  writable: true, enumerable: false },
		active:    { value: false,  writable: true, enumerable: false, configurable: true },
		selected:  { value: false,  writable: true, enumerable: false, configurable: true }
	};

	var createId = (function(n) {
		return function createId() { return --n; }
	})(0);

	function logError(error) {
		console.error(error.stack);
	}

	function noop() {}
	function returnThis() { return this; }
	function returnTrue() { return true; }

	function isDefined(val) {
		return val !== undefined && val !== null;
	}

	function extend(obj) {
		var i = 0,
		    length = arguments.length,
		    obj2, key;

		while (++i < length) {
			obj2 = arguments[i];

			for (key in obj2) {
				if (obj2.hasOwnProperty(key)) {
					obj[key] = obj2[key];
				}
			}
		}

		return obj;
	}

	function create(data) {
		var resource = this;

		if (data && resource.find(data)) {
			throw new Error('resource.create() - Trying to create object with index of existing object. Cant do that.');
			return;
		}

		var object = Object.create(resource.prototype, resource.properties);

		if (data) { extend(object, data); }

		// Give the object an id if it does not already have one.
		if (!isDefined(object[resource.index])) {
			object[resource.index] = createId();
		}

		resource.add(object);
		return object;
	}

	function update(resource, object) {
		var item = resource.find(object);

		if (item) {
			extend(item, object);
			return;
		}

		create.call(resource, object);
	}

	function setSaved(object) {
		object._saved = true;
	}

	function requestGet(resource, object) {
		if (!isDefined(object)) {
			return jQuery.ajax({
					type: 'get',
					url: resource.url
				})
				.then(function multiResponse(response) {
					response.forEach(setSaved);
					resource.update.apply(resource, response);
					return resource;
				})
				.fail(logError);
		}

		var key = typeof object === 'number' || typeof object === 'string' ?
			object :
			object[resource.index] ;

		if (!isDefined(key)) { return failedPromise; }

		return jQuery.ajax({
				type: 'get',
				url: resource.url + '/' + key
			})
			.then(function singleResponse(response) {
				setSaved(response);
				return resource
					.update(response)
					.find(response);
			})
			.fail(logError);
	}

	function requestPost(resource, object) {
		object = resource.find(object);

		// Cant post this, it doesn't exist.
		if (!isDefined(object)) {
			throw new Error('Resource: .request("post", object) called, object not found in resource.');
		}

		object._saving = true;

		return jQuery.ajax({
				type: 'post',
				url: resource.url,
				data: object
			})
			.then(function(response) {
				extend(object, response);
				setSaved(object);
				return object;
			})
			.fail(logError);
	}

	function requestPatch(resource, object) {
		var key = resource.index;

		object = resource.find(object);

		// Cant patch this, it doesn't exist.
		if (!object) {
			throw new Error('Resource: .request("patch", object) called without object.');
		}

		if (!isDefined(object[key])) {
			return failedPromise;
		}

		return jQuery.ajax({
				type: 'PATCH',
				url: resource.url + '/' + object[key],
				data: object
			})
			.then(function(response) {
				extend(object, response);
				setSaved(object);

				return object;
			})
			.fail(logError);
	}

	function requestDelete(resource, object) {
		object = this.find(object);

		// Cant delete this, it doesn't exist.
		if (!isDefined(object)) {
			throw new Error('Resource: .request("delete", object) called, object not found in resource.');
		}

		var key = object[resource.index];

		if (!isDefined(key)) { return failedPromise; }

		resource.remove(object);

		return jQuery.ajax({
				type: 'DELETE',
				url: resource.url + '/' + key
			})
			.then(function deleteSuccess() {
				// Success. Do nothing.
			}, function deleteFail(error) {
				console.error(error.stack);
				console.log('Resource: delete request failed. Putting object back into resource.');
				// Delete failed, put the record back into
				// the resource
				resource.add(record);
			})
			.fail(logError);
	}

	function Throttle(fn) {
		var queue, value;

		function reset() {
			queue = queueFn;
		}

		function queueFn(context, args) {
			value = fn.apply(context, args);
			queue = noop;

			// Queue update
			window.requestAnimationFrame(reset);
		}

		reset();

		return function throttle() {
			// Queue the update
			queue(this, arguments);
			return value;
		};
	}

	function multiarg(fn) {
		return function(data) {
			var n = -1;
			var l = arguments.length;

			while (++n < l) {
				fn(this, arguments[n]);
			}

			return this;
		}
	}

	mixin.resource = {
		request: (function(types) {
			return function request(type, object) {
				if (!types[type]) { throw new Error('Resource: request("' + type + '") is not a request type.'); }
				return types[type](this, object);
			};
		})({
			'get': requestGet,
			'post': requestPost,
			'delete': requestDelete,
			'patch': requestPatch
		}),

		create: function(data) {
			if (debug) { console.log('Resource: create()', data); }
			return arguments.length > 1 ?
				Array.prototype.map.call(arguments, create, this) :
				create.call(this, data) ;
		},

		delete: function(id) {
			var resource = this;
			var request = resource.request('delete', id);

			return this;
		},

		load: function load() {
			var resource = this;
			var request = resource.request('get');

			return request;
		},

		save: function save() {
			var resource = this;
			var n = this.length;

			while (n--) {
				if (!isDefined(this[n].url)) {
					resource.request('post', this[n]);
				}
				else if (this[n]._saved === false) {
					resource.request('patch', this[n]);
				}
			}

			return this;
		},

		// Get an event from memory or localForage or via AJAX.

		fetch: function(id) {
			var resource = this;
			
			return new Promise(function(resolve, reject) {
				var object = resource.find(id);

				if (object) {
					resolve(object);
					return;
				}

				resource.request('get', id).then(function(object) {
					resolve(object);
				}, reject);
			});
		},

		update: multiarg(update),

		sort: function(fn) {
			return Array.prototype.sort.call(this, fn || byId);
		},

		store: returnThis,
		retrieve: returnThis
	};

	var resourcePrototype = Sparky.extend({}, mixin.storage, mixin.events, mixin.array, mixin.collection, mixin.resource);

	function byId(a, b) {
		return a.id > b.id ? 1 : -1 ;
	}

	function observeLength(resource) {
		var length = resource.length = 0;

		// Watch the length and delete indexes when the length becomes shorter
		// like a nice array does.
		observe(resource, 'length', function(resource) {
			while (length-- > resource.length) {
				if (typeof resource[length] !== 'undefined') {
					// JIT compiler notes suggest that setting undefined is
					// quicker than deleting a property.
					resource[length] = undefined;
				}
			}

			length = resource.length;
		});
	}

	var defaults = {
	    	index: 'id',
	    	setup: noop
	    };

	var cache = {};

	function Resource(url, settings) {
		if (debug) { console.log('Resource: url:', '"' + url + '"', 'from cache:', !!cache[url]); }
		if (cache[url]) { return cache[url]; }

		var options = extend({}, defaults, settings);
		var resource = cache[url] = Object.create(resourcePrototype, {
		    	url: {
		    		get: function() { return url; },
		    		set: function(value) {
		    			if (cache[value]) { throw new Error('Resource: Cant set resource URL ' + value + '. A resource with that URL already exists.'); }
		    			if (cache[url]) { delete cache[url]; }
		    			url = value;
		    			cache[url] = this;
		    		}
		    	},
		    	load:       { value: Throttle(resourcePrototype.load) },
		    	save:       { value: Throttle(resourcePrototype.save) },
		    	index:      { value: options.index },
		    	length:     { value: 0, configurable: true, writable: true },
		    	prototype:  { value: Object.create(itemPrototype) },
		    	properties: { value: extend({
		    		// Define properties that rely on resource.
		    		url: {
		    			get: function() {
		    				// Where the key is a number, make sure it is positive. Negative
		    				// numbers are false (unsaved) ids in some past projects.
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
		    		}
		    	}, itemProperties, options.properties) }
		    });

		// Define methods that rely on resource.
		Object.defineProperties(resource.prototype, {
			request: {
				value: function request(method) {
					return resource.request(method, this);
				}
			},

			delete: {
				value: function destroy() {
					return resource.delete(this);
				}
			}
		});

		observeLength(resource);
		options.setup(resource);
		return resource;
	};

	Resource.prototype = resourcePrototype;
	Resource.createId = createId;

	window.Resource = Resource;
})(window, window.Sparky, window.mixin);