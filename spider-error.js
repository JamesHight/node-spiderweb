var util = require('util'),	
	moment = require('moment');


function SpiderError(entry, message, stack) {
	this.entry = entry;
	this.message = message;
	this.timestamp = moment().format('YYYY-MM-DDTHH:mm:ssZ');

	if (stack) {
		this.stack = stack;
	}
	else {
		Error.captureStackTrace(this, this.constructor);
	}
}
util.inherits(SpiderError, Error);

SpiderError.fromError = function(entry, err) {
	return new SpiderError(entry, err.message, err.stack);
};


module.exports = SpiderError;
