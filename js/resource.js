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
						this.request('patch');
					}
					else {
						this.request('post');
					}
				}
				else {
					console.log('SAVE failed - object not valid', this);
				}

				return this;
			}
		},

		post: {
			value: function() {
				console.warn('object.post() deprecated. Use object.request("post")');
				return this.request('post');
			}
		},

		patch: {
			value: function() {
				console.warn('object.patch() deprecated. Use object.request("patch")');
				return this.request('patch');
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

	function update(object) {
		var resource = this;
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
			return jQuery
				.get(resource.url)
				.then(function(res) {
					res.forEach(setSaved);
					resource.update.apply(resource, res);
					return resource;
				}) ;
		}

		var key = typeof object === 'number' || typeof object === 'string' ?
			object :
			object[resource.index] ;

		if (!isDefined(key)) { return failedPromise; }

		return jQuery
			.get(resource.url + '/' + key)
			.then(function(res) {
				setSaved(res);
				resource.update(res);
				return resource.find(res);
			});
	}

	function requestPost(resource, object) {
		// Cant post this, it doesn't exist.
		if (!isDefined(object)) {
			throw new Error('Resource: .request("post", object) called without object.');
		}

		object = resource.find(object) || object;
		object._saving = true;

		return jQuery
			.post(resource.url, object)
			.then(function(res) {
				extend(object, res);
				object._saved = true;
				object._saving = false;
				// Does this only trigger when saving new objects?
				// Shoudl do.... TODO: test it
				resource.trigger('post', object);
				return object;
			});
	}

	function requestDelete(resource, object) {
		// Cant delete this, it doesn't exist.
		if (!isDefined(object)) {
			throw new Error('Resource: .request("delete", object) called without object.');
		}

		var key = typeof object === 'number' || typeof object === 'string' ?
			object :
			object[resource.index] ;

		return jQuery.ajax({
				type: 'DELETE',
				url: resource.url + '/' + key
			});
	}

	function requestPatch(resource, object) {
		var key = resource.index;

		// Cant patch this, it doesn't exist.
		if (!object) {
			throw new Error('Resource: .request("patch", object) called without object.');
		}

		object = resource.find(object) || object;

		if (!isDefined(object[key])) {
			return failedPromise;
		}

		return jQuery.ajax({
				type: 'PATCH',
				url: resource.url + '/' + object[key],
				data: object
			});
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

	mixin.resource = {
		request: (function(types) {
			return function request(type, object) {
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
			if (debug) { console.log('Resource: delete()', id); }

			var resource = this;
			var record = this.find(id);

			this
			.remove(id)
			.request('delete', id)
			.then(function deleteSuccess() {
				// Success. Do nothing.
			}, function deleteFail(error) {
				console.log(error);
				// Delete failed = put the record back into
				// the resource
				resource.add(record);
			});

			return this;
		},

		load: function load() {
			var resource = this;

			return resource
			.retrieve()
			.request('get')
			.then(function loadSuccess() {
				return resource.store();
			}, function loadFail(error) {
				// Load failed
				console.log(error);
			});
		},

		save: function save() {
			var n = this.length;

			while (n--) {
				if (!isDefined(this[n].url) || this[n]._saved === false) {
					this[n].save();
				}
			}

			return this.store();
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

		update: function(data) {
			if (isDefined(data.length)) {
				Array.prototype.forEach.call(data, update, this);
			}
			else {
				update.call(this, data);
			}

			return this;
		},

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
		    				if (resource.url && isDefined(this.id) && (this.id > -1)) {
		    					return resource.url + '/' + this.id;
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

		// Define methods that rely on access to resource.

		resource.prototype.request = function request(method) {
			return resource.request(method, this);
		};

		resource.prototype.delete = function destroy() {
			return resource.delete(this);
		};

		observeLength(resource);
		options.setup(resource);
		return resource;
	};

	Resource.prototype = resourcePrototype;
	Resource.createId = createId;

	window.Resource = Resource;
})(window, window.Sparky, window.mixin);