(function() {
	"use strict";

	console.log('Resource: test storage.');

	var r = Resource('happy/golucky');

	r.create({name: 'ploof', id: 5});
	r.create({name: 'plonk', id: 0});
	r.store().then(function() {
		r[0].name = 'marco';

		// Should be ["marco", "ploof"]
		var result1 = r.map(function(o){ return o.name; });
		console.assert(result1.toString() === "marco,ploof");

		r.retrieve()
		.then(function() {
			// Should be ["plonk", "ploof"]
			var result2 = r.map(function(o){ return o.name; });
			console.assert(result2.toString() === "plonk,ploof");

			r[0].name = 'marco';

			r.store(0)
			.then(function() {
				r.storage('get').then(function(array){
					// Should be ["marco", "ploof"]
					var result3 = array.map(function(o){ return o.name; });
					console.assert(result3.toString() === "marco,ploof");
				})
				.then(function() {
					r[0].name = 'holy crap';

					r.retrieve(5).then(function(array){
						// Should be ["marco","ploof"]
						var result4 = array.map(function(o){ return o.name; });
						console.assert(result4.toString() === "ploof");
					})
					.then(function() {
						// Should be ["holy crap", "ploof"]
						var result5 = r.map(function(o){return o.name});
						console.assert(result5.toString() === "holy crap,ploof");

						r.retrieve(0).then(function(array){
							// Should be ["marco"]
							var result6 = array.map(function(o){ return o.name; });
							console.assert(result6.toString() === "marco");
						});
					});
				});
			});
		});
	});
})();