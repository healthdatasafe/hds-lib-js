const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = [
  {
    entry: './src/index-webpack.js',
    mode: 'production',
    output: {
      path: path.resolve(__dirname, 'docs'),
      filename: 'hds-lib.js',
      globalObject: 'this',
      library: 'HDSLib'
    },
    devtool: 'source-map'
  }, { // browser test suite (ES6)
    mode: 'development',
    entry: {
      'browser-tests': './tests/browser-tests.js'
    },
    output: {
      filename: 'tests-browser.js',
      path: path.resolve(__dirname, 'docs')
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: path.resolve(__dirname, './tests/browser-tests.html'), to: 'tests.html' }
        ]
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser'
      })
    ],

    devtool: 'source-map',
    resolve: {
      alias: {
        '*/deps-node': require.resolve('./tests/test-utils/deps-browser.js')
      }
    }
  }];
