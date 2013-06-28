var request = require('request'),
	cheerio = require('cheerio'),
	mime = require('mime'),
	util = require('util'),
	configExtend = require('config-extend'),
	url = require('url'),
	zlib = require('zlib'),
	SpiderError = require('./spider-error');

mime.default_type = 'text/html';

function Spiderweb(initialUrls, options) {
	var self = this,
		i, vals, val;

	if (!initialUrls) {
		throw new Error('Missing initialUrls parameter');
	}

	if (!Array.isArray(initialUrls)) {
		initialUrls = [initialUrls];
	}
	this.initialUrls = initialUrls;

	this.options = configExtend({
		validDomains: [],
		excludeUrls: [],
		flagUrls: [],
		excludeNoFollow: false,
		images: false,
		links: false,
		scripts: false,
		externalUrls: false,
		timeout: 60000,
		strictSSL: true
	}, options);

	// trim urls
	for (i = 0; i < this.initialUrls.length; i++) {
		this.initialUrls[i] = this.initialUrls[i].replace(/^\s*/, '').replace(/\s*$/, '')
	}

	// If no validDomains, limit crawler to domain of initialUrls
	if (!this.options.validDomains || !this.options.validDomains.length) {
		vals = [];

		for (i = 0; i < this.initialUrls.length; i++) {
			val = this.getDomain(this.initialUrls[i]);
			vals.push(val);
		}
		this.options.validDomains = vals;
	}

	// Setup Regular Expressions
	vals = []
	for (i = 0; i < this.options.validDomains.length; i++) {
		val = this.options.validDomains[i];
		val = this.createRegex(val);
		vals.push(val);
	}
	this._validDomainRegex = vals;

	vals = []
	for (i = 0; i < this.options.excludeUrls.length; i++) {
		val = this.options.excludeUrls[i];
		val = this.createRegex(val);
		vals.push(val);
	}
	this._excludeUrlsRegex = vals;

	this._httpUrlRegex = new RegExp('^https?://', 'i');


	this._log = [];
	this._queue = [];
	this._queued = {};
	this._running = false;
}

Spiderweb.prototype.start = function(cb) {
	var self = this,
		i;

	this._pause = false;
	this._cb = cb;

	if (Array.isArray(this.initialUrls)) {
		for (i = 0; i < this.initialUrls.length; i++) {
			this.queue(this.initialUrls[i], null, 'internal');
		}
	}
	else {
		this.queue(this.initialUrls, null, 'internal');
	}	
};

Spiderweb.prototype.end = function() {
	this._pause = true;
	if (this._cb) {
		this._cb(null, this._log);
	}
};


Spiderweb.prototype.queue = function(url, parentUrl, type) {
	var entry = {
			url: url,
			type: type
		};

	if (parentUrl) {
		entry.parentUrl = parentUrl;
	}

	// prevent duplicate requests
	if (this._queued[url]) {
		return;
	}
	this._queued[url] = true;

	this._queue.push(entry);

	if (!this._running) {
		this._run();
	}
};


Spiderweb.prototype._run = function() {
	var self = this,
		entry, options;

	if (this._pause) {
		return;
	}

	if (!this._queue.length) {
		this._running = false;
		this.end();
		return;
	}

	this._running = true;

	entry = this._queue.shift();

	options = {
		uri: entry.url,
		encoding: null,
		/*headers: {
			'User-Agent': 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.8.1.13) Gecko/20080311 Firefox/2.0.0.13'
		}*/
		strictSSL: this.options.strictSSL
	};

	if (this.options.headers) {
		options.headers = this.options.headers;
	}

	if (this.options.timeout) {
		options.timeout = this.options.timeout;
	}
//'text/html'

	headUrl();

	function headUrl() {
		options.method = 'HEAD';
		request(options, function(err, resp, body) {
			if (err) {
				return handleError(err);
			}

			if (resp['headers'] && resp['headers']['content-type'] 
				&& resp['headers']['content-type'].indexOf('text/html') > -1) {
				fetchUrl();
			}
			else {
				self.pageHandler(err, resp, body, entry);
			}

			function handleError(err) {
				self.log(entry, err);
				process.nextTick(function() {
					self._run();
				});
			}
		});
	}

	function fetchUrl() {
		options.method = 'GET';
		request(options, function(err, resp, body) {
			if (err) {
				return handleError(err);
			}


			if (resp.headers['content-encoding'] 
				&& (resp.headers['content-encoding'].indexOf('gzip') !== -1
					|| resp.headers['content-encoding'].indexOf('deflate') !== -1)) {
				zlib.unzip(body, function(err, data) {
					if (err) {
						return handleError(err);
					}

					body = data.toString();
					dispatch();
				});
			}
			else {
				body = body.toString();
				dispatch();
			}

			function handleError(err) {
				self.log(entry, err);
				process.nextTick(function() {
					self._run();
				});
			}

			function dispatch() {
				self.pageHandler(err, resp, body, entry);
			}
		});
	}
};



Spiderweb.prototype.processUrl = function(currentUrl, urlVal) {

	// remove hash tags from url
	if (urlVal && urlVal.indexOf('#') > -1) {
		urlVal = urlVal.split('#')[0];
	}

	if (!this._httpUrlRegex.test(urlVal)) {		
		if (!urlVal.length) {
			urlVal = currentUrl;
		}
		else if (urlVal.substr(0, 2) === '//') {
			urlVal = this.getProtocol(currentUrl) + urlVal;
		}
		else if (urlVal.substr(0, 1) === '/') {
			urlVal = this.getBaseUrl(currentUrl) + urlVal;
		}
		else {
			if (currentUrl.length && currentUrl[currentUrl.length -1] !== '/') {
				urlVal = currentUrl + '/' + urlVal;
			}
			else {
				urlVal = currentUrl + urlVal;
			}
		}
	}

	if (urlVal.match(/\/\/$/)) {
		process.exit();
	}

	return urlVal;
};

	
Spiderweb.prototype.isValidDomain = function(urlVal) {
	var regex, i;
	
	for (i = 0; i < this._validDomainRegex.length; i++) {
		if(this._validDomainRegex[i].test(urlVal)) {
			return true;
		}	
	}

	return false;
};


Spiderweb.prototype.isExcludedDomain = function(urlVal) {
	var regex, i;
	
	for (i = 0; i < this._excludeUrlsRegex.length; i++) {
		if(this._excludeUrlsRegex[i].test(urlVal)) {
			return true;
		}	
	}

	return false;
};



Spiderweb.prototype.getDomain = function(urlVal) {
	return url.parse(urlVal).hostname;
};


Spiderweb.prototype.getBaseUrl = function(urlVal) {
	urlVal = url.parse(urlVal);

	return urlVal.protocol + '//' + urlVal.host;
};


Spiderweb.prototype.getProtocol = function(urlVal) {
	urlVal = url.parse(urlVal);

	return urlVal.protocol;
};


Spiderweb.prototype.createRegex = function(val) {
	var parts = val.split('*'),
		i;

	for (i = 0; i < parts.length; i++) {
		parts[i] = this.regexEscape(parts[i]);
	}

	val = parts.join('.*');
	val = '^https?://' + val;

	return new RegExp(val, 'i');
};


Spiderweb.prototype.regexEscape = function(val) {
	return val.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

Spiderweb.prototype.isFile = function(urlVal) {
	var type;

	urlVal = url.parse(urlVal);
	urlVal = urlVal.pathname.split('/').pop();

	if (urlVal.indexOf('.') > -1) {
		type = mime.lookup(urlVal);

		switch(type) {
			case 'text/html':
				return false;

			default:
				return true;
		}		
	}

	return false;
}


Spiderweb.prototype.log = function(entry, err) {
	if (typeof err === 'object') {
		err = SpiderError.fromError(entry, err);
	}
	else {
		err = new SpiderError(entry, err);
	}

	this._log.push(err);	
};


Spiderweb.prototype.pageHandler = function(err, resp, body, entry) {
	var self = this,
		$;

	if (err) {
		if (err.message.indexOf('ENOTFOUND') > -1) {
			err = 'DNS Lookup Failed';
		}	
		else if (err.message.indexOf('DEPTH_ZERO_SELF_SIGNED_CERT')> -1) {
			err = 'Invalid SSL Certificate';
		}	
		else if (err.message.indexOf('ECONNREFUSED')> -1) {
			err = 'Connection Refused';
		}	
		else if (err.message.indexOf('ETIMEDOUT')> -1) {
			err = 'Connection Timed Out';
		}


		this.log(entry, err);
		return this._run();
	}

	if (resp.statusCode >= 400) {
		this.log(entry, resp.statusCode);
		return this._run();
	}

	$ = cheerio.load(body);

	if (entry.type === 'internal') {
		// process links
		$('a').each(function(index, a) {
			if (a.attribs.href) {
				if (self.options.excludeNoFollow && a.attribs.rel && a.attribs.rel === 'nofollow') {
					return;
				}			

				queueUrl(a.attribs.href);
			}
		});


		if (this.options.images) {
			$('img').each(function(index, img) {
				if (img.attribs.src) {
					queueUrl(img.attribs.src);			
				}
			});
		}

		if (this.options.links) {
			$('link').each(function(index, link) {
				if (link.attribs.href) {
					queueUrl(link.attribs.href);			
				}
			});
		}

		if (this.options.scripts) {
			$('script').each(function(index, script) {
				if (script.attribs.src) {
					queueUrl(script.attribs.src);			
				}
			});
		}
	}

	this._run();

	function queueUrl(url) {
		if (url.match(/^mailto:/i) || url.match(/^javascript:/i) || url.match(/^tel:/i)) {
			return;
		}

		url = self.processUrl(entry.url, url);

		if (self.isExcludedDomain(url)) {
			return;
		}

		if (self.isValidDomain(url)) {		
			self.queue(url, entry.url, 'internal');
		}
		else if (url && self.options.externalUrls) {
			self.queue(url, entry.url, 'external');
		}
	}
};


module.exports = Spiderweb;