const path = require('path');

module.exports = {
  entry: './src/index-webpack.js',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'docs'),
    filename: 'hds-lib.js',
    globalObject: 'this',
    library: 'HDSLib'
  }
};
