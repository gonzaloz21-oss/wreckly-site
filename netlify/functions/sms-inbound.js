const wrap = require('../adapter');
exports.handler = wrap(require('../../api/sms-inbound'));
