resource
========

RESTful Resource constructor for JS 

    Resource(url, data)

Creates an array-like object that loads and saves to the URL.


### .storage(method, object)

Stores and retrieves data from local storage (localStorage, IndexedDB, ...).

Returns a promise that resolves to an array of all objects that have been
updated in storage. These are not the same objects that are in the resource.
The resource is not updated and the objects in resource are not changed.
To update the resource and get an array of objects that have been changed use
<code>.store()</code> and <code>.retrieve()</code>.

#### .storage('set')

#### .storage('set', object)

#### .storage('get')

Get all objects from storage.

    resource.storage('get').then(function(array) {
        // Array contains all retrieved objects.
    });

#### .storage('get', id)

Get a single object from storage.

    resource.storage('get', 0).then(function(array) {
        // Assuming there is an object with id 0 in storage,
        // the array contains it.
        // array === [{ id: 0 }]
    });

#### .storage('remove')

#### .storage('remove', id)

### .store()

### .store(id)

Returns a promise that resolves to an array of all objects in resource that
have been sent to storage.

### .retrieve()

### .retrieve(id)

Returns a promise that resolves to an array of all objects in resource that
have been retrieved from storage.
