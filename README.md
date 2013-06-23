SpiderWeb
=========

Crawl multiple domains using one or more entry URLs.


Installation
------------

````bash
npm install spiderweb
````

````javascript
var SpiderWeb = require('spiderweb'),
	urls, options, spiderweb;

urls = ['bar.com', 'foo.bar.com'];

options = {
	strictSSL: false,
	images: true,
	excludedUrls: ['*biz.foo.com*', '*/admin/*']
};

spiderweb = new SpiderWeb(urls, options);

spider.pageHandler = function(err, resp, body, entry) {
	console.log(entry.url);
	SpiderWeb.prototype.pageHandler.apply(this, arguments);
}

spiderweb.start(function(err, log) {
	if (err) {
		console.log('ERROR: ', err)
	}

	if (log.length) {
		console.log('DONE: ' + log.length + ' page errors');
	}
	else {
		console.log('DONE: no errors');
	}
});
````