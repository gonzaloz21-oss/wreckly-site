const wrap = require('../adapter');
exports.handler = wrap(require('../../api/admin/data'));
