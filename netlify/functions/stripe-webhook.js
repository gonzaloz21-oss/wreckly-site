const wrap = require('../adapter');
exports.handler = wrap(require('../../api/stripe-webhook'));
