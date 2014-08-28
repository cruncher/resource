(function(mixin) {
	"use strict";

	var debug = true;
	var itemPrototype = Object.defineProperties({}, {
		save: {
			value: function() {
				console.log('SAVE');

				if (this.validate()) {
					if (this.isOnRemote) {
						this.patch();
					}
					else {
						console.log('POST');
						this.post();
					}
				}
				else { console.log('SAVE failed - object not valid', this); }
				return this;
			}
		},

		post: {
			value: function() {
				this._resource.request('post', this);
				return this;
			}
		},

		patch: {
			value: function() {
				return jQuery.ajax({
					url: this._resource.url + '/' + this.id,
					type: 'PATCH',
					data: this
				});
			}
		},

		//		put: function() {
		//			var url = this._resource.url + '/' + this.id;
		//			
		//			console.log('PUT', this);
		//			
		//			return jQuery.ajax({
		//				url: url,
		//				type: 'PUT',
		//				data: this
		//			});
		//		},

		delete: {
			value: function() {
				return this._resource.delete(this.id);
			}
		},
		
		isOnRemote: {
			get: function() {
				return isDefined(this.id) && this.id > -1;
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
		_resource: { value: {},     writable: true, enumerable: false },
		url:       { value: '',     writable: true, enumerable: false, configurable: true },
		active:    { value: false,  writable: true, enumerable: false, configurable: true },
		selected:  { value: false,  writable: true, enumerable: false, configurable: true }
	};

	var createId = (function(n) {
		return function createId() { return --n; }
	})(0);

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

		// A hard link back to the parent resource. Is
		// this really a great idea?
		object._resource = resource;

		if (data) {
			extend(object, data);
		}

		// Give the object an id if it does not already have one.
		if (!isDefined(object.id)) {
			object.id = createId();
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

	function requestGet(resource, id) {
		return isDefined(id) ?
	
			jQuery
			.get(resource.url + '/' + id)
			.then(function(res) {
				setSaved(res);
				resource.update(res);
				return resource.find(res);
			}) :
	
			jQuery
			.get(resource.url)
			.then(function(res) {
				res.forEach(setSaved);
				resource.update(res);
				return res;
			}) ;
	}
	
	function requestPost(resource, object) {
		object._saving = true;
	
		return jQuery
			.post(resource.url, object)
			.then(function(res) {
				extend(object, res);
				object._saved = true;
				object._saving = false;
				return object;
			});
	}

	function requestDelete(resource, id) {
		return jQuery
			.ajax({
				type: 'DELETE',
				url: resource.url + '/' + id
			});
	}

	mixin.resource = {
		request: (function(types) {
			return function(type, object) {
				return types[type](this, object);
			};
		})({
			'get': requestGet,
			'post': requestPost,
			'delete': requestDelete
		}),

		create: function(data) {
			return (data && isDefined(data.length)) ?
				Array.prototype.map.call(data, create, this) :
				create.call(this, data) ;
		},

		delete: function(id) {
			this.remove(id);
			this.request('delete', id);
			return this;
		},

		load: function() {
			var resource = this;
			
			return this
			.retrieve()
			.request('get')
			.then(function() {
				return resource.store();
			});
		},

		save: function() {
			var n = this.length;

			while (n--) {
				if (!this[n].isOnRemote || this[n]._saved === false) {
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
				
				if (object) { resolve(object); }
				
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

	var resourceProperties = {
		length: {
			value: 0,
			enumerable: false,
			writable: true,
			configurable: true
		}
	};

	function byId(a, b) {
		return a.id > b.id ? 1 : -1 ;
	}

	window.Resource = function(url, data) {
		if (debug) { console.log('Resource()', url); }

		var resource = Object.create(resourcePrototype, resourceProperties);

		Object.defineProperties(resource, {
			index:      { value: 'id' },
			url:        { value: url, configurable: true, writable: true },
			prototype:  { value: Object.create(itemPrototype) },
			properties: { value: extend({
				url: { value: url }
			}, itemProperties) }
		});

		if (data === undefined) {
			data = [];
		}

		// Populate the resource
		data.forEach(create, resource);

		var length = resource.length = data.length;

		// Sort the resource
		resource.sort();

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

		return resource;
	};

	Resource.prototype = resourcePrototype;
	Resource.properties = resourceProperties;
	Resource.createId = createId;
})(window.mixin);