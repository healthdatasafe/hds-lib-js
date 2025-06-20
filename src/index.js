const pryv = require('pryv');
require('@pryv/socket.io')(pryv);
require('@pryv/monitor')(pryv);
pryv.HDSModel = require('./HDSModel');

module.exports = pryv;
