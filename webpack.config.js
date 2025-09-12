const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = [
  addCommon({
    entry: './src/index.js',
    mode: 'production',
    output: {
      path: path.resolve(__dirname, 'docs'),
      filename: 'hds-lib.js',
      globalObject: 'this',
      library: 'HDSLib'
    },
    devtool: 'source-map'
  }), addCommon({ // browser test suite (ES6)
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
  })];

function addCommon (config) {
  const common = {
    resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
      extensions: ['.ts', '.tsx', '.js'],
      // Add support for TypeScripts fully qualified ESM imports.
      extensionAlias: {
        '.js': ['.js', '.ts'],
        '.cjs': ['.cjs', '.cts'],
        '.mjs': ['.mjs', '.mts']
      }
    },
    module: {
      rules: [
      // all files with a `.ts`, `.cts`, `.mts` or `.tsx` extension will be handled by `ts-loader`
        { test: /\.([cm]?ts|tsx)$/, loader: 'ts-loader' }
      ]
    }
  };
  for (const [key, value] of Object.entries(common)) {
    if (!config[key]) {
      config[key] = value;
    } else {
      Object.assign(config[key], value);
    }
  }
  return config;
}
