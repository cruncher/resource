(function(window, Sparky, mixin, localforage) {
	"use strict";

	var debug = window.debug !== false;

	var failedResourcePromise = new Promise(function(accept, reject) {
	    	reject({ message: 'Object not found in resource.' });
	    });

	var failedStoragePromise = new Promise(function(accept, reject) {
	    	reject({ message: 'Object not found in storage.' });
	    });

	var itemPrototype = Object.defineProperties({}, {
		load: {
			value: function load() {
				
			}
		},

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

				return failedResourcePromise;
			}
		},

		store: {
			value: function store() {
				var object = this;

				return object
				.storage('set')
				.then(function(data) {
					return object;
				})
				.catch(logError);
			}
		},

		retrieve: {
			value: function retrieve() {
				var object = this;

				return object
				.storage('get')
				.then(function(data) {
					extend(object, data);
					return object;
				})
				.catch(logError);
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

	function logError(error) {
		if (error.message) { console.log('Resource:', error.message); }
		if (error.stack)   { console.error(error.stack); }
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

	function create(resource, data) {
		if (data && resource.find(data)) {
			throw new Error('resource.create() - Trying to create object with index of existing object. Cant do that.');
			return;
		}

		var object = Object.create(resource.prototype, resource.properties);

		if (data) { extend(object, data); }

		resource.add(object);
		return object;
	}

	function update(resource, data) {
		var object = resource.find(data);

		return object ?
			extend(object, data) :
			create(resource, data) ;
	}

	function setSaved(object) {
		object._saved = true;
	}

	function requestGet(resource, object) {
		if (!isDefined(object)) {
			return jQuery.ajax({
					type: resource.requestURL('get'),
					url: resource.url
				})
				.fail(logError);
		}

		var key = typeof object === 'number' || typeof object === 'string' ?
			object :
			object[resource.index] ;

		if (!isDefined(key)) { return failedResourcePromise; }

		return jQuery.ajax({
				type: 'get',
				url: resource.requestURL('get', object),
			})
			.then(function singleResponse(data) {
				// .request() is gauranteed to resolve to an
				// array. Make it so.
				return [data];
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
				url: resource.requestURL('post', object),
				data: object,
				contentType: 'application/json; charset=UTF-8'
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
			return failedResourcePromise;
		}

		return jQuery.ajax({
				type: 'PATCH',
				url: resource.requestURL('patch', object),
				data: object,
				contentType: 'application/json; charset=UTF-8'
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

		if (!isDefined(key)) { return failedResourcePromise; }

		resource.remove(object);

		return jQuery.ajax({
				type: 'DELETE',
				url: resource.requestURL('delete', object)
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

	function resourceURL(resource) {
		return resource.url;
	}

	function objectURL(resource, object) {
		return resource.url + '/' + object[resource.index];
	}

	function resourceOrObjectURL(resource, object) {
		return resource.url + (object ? '/' + object[resource.index] : '');
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

	function spliceByKey(array, key, value) {
		var n = array.length;

		while (n--) {
			if (array[n][key] !== value) {
				array.splice(n, 1);
			}
		}

		return array;
	}

	function createChooser(methods) {
		return function choose(method, id) {
			return methods[method](this, id);
		};
	}

	function isValue(object) {
		return typeof object === 'string' ||
			typeof object === 'number' ||
			object === undefined;
	}

	mixin.resource = {
		create: function(data) {
			return create(this, data);
		},

		update: multiarg(update),

		request: createChooser({
			'get': requestGet,
			'post': requestPost,
			'delete': requestDelete,
			'patch': requestPatch
		}),

		requestURL: createChooser({
			'get': resourceOrObjectURL,
			'post': resourceURL,
			'delete': objectURL,
			'patch': objectURL
		}),

		// Wrap our storage implementation, currently using localforage,
		// in the .storage() method.
		storage: createChooser({
			'set': function storageSet(resource, object) {
				var id;

				if (object) {
					id = object[resource.index];

					// Replace just this object in the stored array. We have to
					// get the stored array before we can do that.
					return localforage
					.getItem(resource.url)
					.then(function(array) {
						// The resource has not yet been stored. Store that
						// subset of the resource containing this object.
						if (!array) {
							return localforage.setItem(resource.url, [object]);
						}

						// Find the item in array that has the id of object and
						// replace it with object.
						var n = array.length;
						while (n--) {
							if (array[n][resource.index] === id) {
								array.splice(n, 1, object);
								break;
							}
						}

						// If n has hit bottom, no object has been replaced.
						// Push the object.
						if (n === -1) {	array.push(object); }

						return localforage.setItem(resource.url, array);
					})
					.then(function(array) {
						// Prepare the array so it contains only those objects that
						// were changed.
						return spliceByKey(array, resource.index, id);
					})
					.catch(logError);
				}

				return localforage
				// IndexedDB complains if we try to set the resource directly,
				// so we cast it to a JSON compatible object first. Not sure
				// what the problem is.
				.setItem(resource.url, resource.toJSON())
				.catch(logError);
			},

			'get': function storageGet(resource, object) {
				var id = isValue(object) ? object : object[resource.index] ;

				return localforage
				.getItem(resource.url)
				.then(function(array) {
					// If no id was passed, return the whole set.
					if (object === undefined) { return array || []; }

					// Otherwise return the object with id.
					var n = array.length;

					// Splice out any entries that don't have id.
					return spliceByKey(array, resource.index, id);
				})
				.catch(logError);
			},
			
			'remove': function storageRemove(resource, object) {
				// If no object was passed, remove the whole caboodle.
				if (object === undefined) {
					console.log('REMOVING THE WHOLE CABOODLE');
					return localforage
					.removeItem(resource.url)
					.catch(logError);
				}

				var id = isValue(object) ? object : object[resource.index] ;

				return localforage
				.getItem(resource.url)
				.then(function(array) {
					var n = array.length;
					var removed = [];

					while (n--) {
						if (array[n][resource.index] === id) {
							removed.push.apply(removed, array.splice(n, 1));
						}
					}

					return localforage
					.setItem(resource.url, array)
					.then(function() {
						console.log('SET RESOURCE');
						return removed;
					});
				})
				.catch(logError);
			}
		}),

		delete: function(id) {
			var resource = this;
			var request = resource.request('delete', id);

			return this;
		},

		load: function load() {
			var resource = this;

			return resource
			.request('get')
			.then(function multiResponse(array) {
				array.forEach(setSaved);
				resource.update.apply(resource, array);

				// Return an array of resource objects that
				// were loaded.
				return array.map(function(object) {
					return resource.find(object);
				});
			});
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

		sort: function(fn) {
			return Array.prototype.sort.call(this, fn || byId);
		},

		store: function(id) {
			var resource = this;
			var object;

			if (isDefined(id)) {
				object = resource.find(id);

				// If no object with that id is found, we can't very well
				// store it now, can we? 
				if (!object) {
					return failedResourcePromise.catch(logError);
				}
			}

			return resource
			.storage('set', object)
			.then(function(array) {
				// Return an array of resource objects that were stored.
				return array.map(function(object) {
					return resource.find(object);
				});
			})
			.catch(logError);
		},

		retrieve: function(id) {
			var resource = this;

			return resource
			.storage('get', id)
			.then(function(array) {
				resource.update.apply(resource, array);

				// Return an array of all objects that have just been added
				// or updated by the request.
				return array.map(function(object) {
					return resource.find(object);
				});
			})
			.catch(logError);
		}
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
		    				if (url && isDefined(this[resource.index])) {
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

			storage: {
				value: function storage(method) {
					// Return promise with just one object as value.
					return resource
					.storage(method, this)
					.then(function(array) {
						return array[0];
					});
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

	window.Resource = Resource;
})(window, window.Sparky, window.mixin, window.localforage);