(function(window, Sparky, mixin, localforage) {
	"use strict";

	var debug = window.debug !== false;

	var Collection = Sparky.Collection;

	var failedResourcePromise = new Promise(function(accept, reject) {
	    	reject(new Error('Object not found in resource.'));
	    })
	    .catch(noop);

	var failedStoragePromise = new Promise(function(accept, reject) {
	    	reject(new Error('Object not found in storage.'));
	    })
	    .catch(noop);

	var itemPrototype = Object.defineProperties({}, {
		save: {
			value: function save() {
				if (!this.validate()) {
					console.warn('Resource: Can\'t save invalid object.', this);
					return failedResourcePromise;
				}

				var object = this;
				var request = this.saved ?
					object.request('patch') :
					object.request('post') ;

				object.saving = true;

				return request
				.then(function(data) {
					if (data) {
						extend(object, data);
						if (!data.saved) { object.saved = new Date().toISOString(); }
					}
					else {
						// data has not made it passed the validators, but the
						// request has not failed so we have to assume it worked,
						// but not update the object.
						object.saved = new Date().toISOString();
					}

					object.saving = false;
					return object;
				})
				.catch(function(error) {
					object.saving = false;
					console.error(error.message);
					console.trace(error.stack);
				});
			}
		},

		load: {
			value: function load() {
				var object = this;

				return this
				.request('get')
				.then(function(data) {
					if (data) {
						extend(object, data);
						if (!data.saved) { object.saved = new Date().toISOString(); }
					}
					else {
						// data has not made it passed the validators, but the
						// request has not failed so we have to assume it worked,
						// but not update the object.
						object.saved = new Date().toISOString();
					}

					return object;
				});
			}
		},

		store: {
			value: function store() {
				var object = this;

				return object
				.storage('set')
				.then(function(data) {
					object.stored = new Date().toJSON();
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
					if (!object.stored) {
						object.stored = new Date().toJSON();
					}
					return object;
				})
				.catch(logError);
			}
		}
	});

	var itemProperties = {
		stored:    { value: false,  writable: true, enumerable: false, configurable: true },
		saved:     { value: false,  writable: true, enumerable: false, configurable: true },
		saving:    { value: false,  writable: true, enumerable: false, configurable: true }
	};

	function logError(error) {
		if (error.message) { console.log('Resource:', error.message); }
		if (error.stack)   { console.error(error.stack); }
	}

	function noop() {}
	function returnThis() { return this; }
	function returnTrue() { return true; }
	function get0(array) { return array && array[0]; }

	function isDefined(val) {
		return val !== undefined && val !== null && !Number.isNaN(val);
	}

	function isArrayOrCollection(object) {
		return Array.isArray(object) || Collection.isCollection(object);
	}

	function removeUnfoundObjects(collection, array) {
		var n = collection.length;
		var ids = array.map(function(object) {
		    	return object[collection.index];
		    });
		var id;

		while (n--) {
			id = collection[n][collection.index];
			if (ids.indexOf(id) === -1) {
				collection.splice(n, 1);
			}
		}
	}

	function extend(obj1) {
		var i = 0;
		var length = arguments.length;
		var obj2, key;

		while (++i < length) {
			obj2 = arguments[i];
			for (key in obj2) {
				if (obj2.hasOwnProperty(key)) {
					// If key is an array or collection, replace the contents
					// of the original with the contents of the incoming one.
					if (obj1[key] && isArrayOrCollection(obj2[key])) {
						if (Array.isArray(obj1[key])) {
							obj1.length = 0;
							obj1[key].push.apply(obj2[key]);
						}
						else if (Collection.isCollection(obj1[key])) {
							obj1[key].update.apply(obj1[key], obj2[key]);
							
							// If collection and incoming lengths don't match we
							// have to remove some things from the collection.
							if (obj1[key].length !== obj2[key].length) {
								removeUnfoundObjects(obj1[key], obj2[key]);
							}
						}
						else {
							obj1[key] = obj2[key];
						}
					}
					else {
						obj1[key] = obj2[key];
					}
				}
			}
		}

		return obj1;
	}

	function create(resource, data) {
		if (data && resource.find(data)) {
			throw new Error('Resource: Cannot create object with key (' + resource.index + ') of existing object.');
			return;
		}

		if (data && !validateDefined(resource.properties, data)) {
			throw new Error('Resource: Cannot create object with invalid data. ' + data);
		};

		var object = Object.create(resource.prototype, resource.properties);

		if (data) { extend(object, data); }

		resource.trigger('create', object);
		resource.add(object);
		return object;
	}

	function update(resource, data) {
		var object = resource.find(data);

		return object ?
			extend(object, data) :
			create(resource, data) ;
	}

	function singleResponse(data) {
		// .request() is gauranteed to resolve to an
		// array. Make it so.
		return [data];
	}

	function request(method, url, data, contentType) {
		// Wrap jQuery.ajax in a native promise.
		return new Promise(function(accept, reject) {
			jQuery.ajax({
				type: method,
				url: url,
				data: data,
				contentType: contentType
			})
			.then(accept, reject);
		});
	}

	function requestGet(resource, object) {
		if (!isDefined(object)) {
			return request('get', resource.requestURL('get'))
				.catch(logError);
		}

		var key = typeof object === 'number' || typeof object === 'string' ?
			object :
			object[resource.index] ;

		if (!isDefined(key)) { return failedResourcePromise; }

		var url = resource.requestURL('get', key);

		return request('get', url)
			.then(singleResponse)
			.catch(logError);
	}

	function requestPost(resource, object) {
		object = resource.find(object);

		// Cant post this, it doesn't exist.
		if (!isDefined(object)) {
			throw new Error('Resource: .request("post", object) called, object not found in resource.');
		}

		var url = resource.requestURL('post', object[resource.index]);

		return request('post', url, JSON.stringify(object), 'application/json')
			.then(singleResponse)
			.catch(logError);
	}

	function requestPatch(resource, object) {
		object = resource.find(object);

		// Cant patch this, it doesn't exist.
		if (!object) {
			throw new Error('Resource: .request("patch", object) called without object.');
		}

		var key = object[resource.index];

		if (!isDefined(key)) {
			return failedResourcePromise;
		}

		var url = resource.requestURL('patch', key);

		return request('patch', url, JSON.stringify(object), 'application/json')
			.then(singleResponse)
			.catch(logError);
	}

	function requestDelete(resource, object) {
		object = resource.find(object);

		// Cant delete this, it doesn't exist.
		if (!isDefined(object)) {
			throw new Error('Resource: .request("delete", object) called, object not found in resource.');
		}

		var key = object[resource.index];

		if (!isDefined(key)) { return failedResourcePromise; }

		resource.remove(object);

		return request('delete', resource.requestURL('delete', key))
			.then(function deleteSuccess() {
				// Success. Do nothing.
			}, function deleteFail(error) {
				console.error(error.stack);
				console.log('Resource: delete request failed. Putting object back into resource.');
				// Delete failed, put the record back into
				// the resource
				resource.add(record);
			})
			.catch(logError);
	}

	function resourceURL(resource) {
		return (resource.url === '/' ? '' : resource.url);
	}

	function objectURL(resource, key) {
		return resourceURL(resource) + '/' + key;
	}

	function resourceOrObjectURL(resource, key) {
		return isDefined(key) ?
			objectURL(resource, key) :
			resourceURL(resource) ;
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

	var validators = {
		'number': function validateNumber(data, name) {
			return data[name] === undefined || (typeof data[name] === 'number' && !Number.isNaN(data[name])) ;
		},

		'string': function validateNumber(data, name) {
			return data[name] === undefined || typeof data[name] === 'string';
		},

		'array': function validateArray(data, name) {
			return Array.isArray(data[name]);
		},

		'required': function validateRequired(data, name) {
			return isDefined(data[name]);
		}
	};

	function validate(properties, object, name) {
		var validator = properties[name].validate;
		var rules, n, l;

		if (typeof validator === 'string') {
			rules = validator.split(/\s+/);
			l = rules.length;
			n = -1;

			while (++n < l) {
				if (!validators[rules[n]](object, name)) {
					return false;
				};
			}

			return true;
		}

		return !!validator(object, name);
	}

	function validateDefined(properties, object) {
		var name;

		for (name in object) {
			if (!object.hasOwnProperty(name)) { continue; }
			if (!properties[name] || !properties[name].validate) { continue; }
			if (!validate(properties, object, name)) {
				return false;
			}
		}

		return true;
	}

	function validateAll(properties, object) {
		var name;

		for (name in properties) {
			if (!properties.hasOwnProperty(name)) { continue; }
			if (!properties[name].validate) { continue; }
			if (!validate(properties, object, name)) {
				return false;
			}
		}

		return true;
	}

	mixin.resource = {
		create: function(data) {
			return create(this, data);
		},

		update: multiarg(update),

		request: (function(methods) {
			return function(method, id) {
				var resource = this;

				return methods[method](this, id)
				.then(function(array) {
					if (array === undefined) { return; }

					var n = array.length;
					var data, name;

					while (n--) {
						data = array[n];

						if (!validateDefined(resource.properties, data)) {
							array.splice(n, 1);
							console.warn('Resource: Server response contains invalid data. This object will not be updated locally.', data);
						}
					}

					return array;
				});
			};
		})({
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

		// .load()
		// .load(id)
		//
		// Returns a promise that resolves to an array of loaded and updated
		// objects. Where id is passed in, the array contains 1 object.

		load: function load() {
			var resource = this;

			return resource
			.request('get')
			.then(function multiResponse(array) {
				resource.update.apply(resource, array);

				// Return an array of resource objects that
				// were loaded.
				return array.map(function(data, i) {
					var object = resource.find(data);

					if (!data.saved) {
						object.saved = new Date().toJSON();
					}

					return object;
				});
			});
		},

		save: function save() {
			var resource = this;
			var n = this.length;

			while (n--) {
				this[n].save();
			}

			return this;
		},

		// .fetch(id)
		//
		// Gets an object from the resource, or if not found, loads it from the
		// server. Returns a promise that resolves to a single object.

		fetch: function(id) {
			var resource = this;
			var object = resource.find(id);

			return object ?
				new Promise(function(resolve, reject) {
					resolve(object);
				}) :
				resource
				.load()
				.then(function() {
					return resource.find(id);
				}) ;
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
				return array.map(function(data) {
					var object = resource.find(data);
					object.stored = new Date().toJSON();
					return object;
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
				return array.map(function(data) {
					var object = resource.find(data);
					if (!object.stored) { object.stored = new Date().toJSON(); }
					return object;
				});
			})
			.catch(logError);
		},

		validate: function(object) {
			return validateAll(this.properties, object);
		},

		sub: function sub() {
			var subset = Sparky.Collection.prototype.sub.apply(this, arguments);

			Sparky.extend(subset, {
				create: this.create.bind(this),
				delete: this.delete.bind(this),
				request: this.request.bind(this),
				load: this.load.bind(this),
				save: this.save.bind(this),
				storage: this.storage.bind(this),
				store: this.store.bind(this),
				retrieve: this.retrieve.bind(this)
			});

			return subset;
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
		if (debug) { console.log('Resource: "' + url + '"' + (cache[url] ? ' [from cache]' : '')); }
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
		    	properties: { value: extend({}, itemProperties, options.properties) }
		    });

		// Define methods that rely on resource.
		Object.defineProperties(resource.prototype, {
			request: {
				value: function request(method) {
					// Return promise with just one object as value.
					return resource
					.request(method, this)
					.then(get0);
				}
			},

			storage: {
				value: function storage(method) {
					// Return promise with just one object as value.
					return resource
					.storage(method, this)
					.then(get0);
				}
			},

			delete: {
				value: function destroy() {
					return resource.delete(this);
				}
			},

			validate: {
				value: function destroy() {
					return resource.validate(this);
				}
			}
		});

		populatePropertyDescriptors(resource.properties);
		observeLength(resource);
		options.setup(resource);
		return resource;
	};

	function populatePropertyDescriptors(properties) {
		var property;
		var descriptor;
		
		for (property in properties) {
			descriptor = properties[property];

			if (!descriptor.get && !descriptor.set) {
				if (descriptor.writable === undefined) { descriptor.writable = true; }
				if (descriptor.enumerable === undefined) { descriptor.enumerable = true; }
			}

			if (descriptor.configurable === undefined) { descriptor.configurable = true; }
		}
	}

	function isResource(object) {
		return Resource.prototype.isPrototypeOf(object);
	}

	Resource.prototype = resourcePrototype;
	Resource.validators = validators;
	Resource.isResource = isResource;

	window.Resource = Resource;
})(window, window.Sparky, window.mixin, window.localforage);
