const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = [
  addCommon({
    entry: './ts/index.ts',
    mode: 'production',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'hds-lib.js',
      globalObject: 'this',
      library: 'HDSLib'
    },
    devtool: 'source-map',
    resolve: {
      fallback: {
        fs: false,
        path: false
      }
    }
  }), addCommon({ // browser test suite (ES6)
    mode: 'development',
    entry: {
      'browser-tests': './tests/browser-tests.js'
    },
    output: {
      filename: 'tests-browser.js',
      path: path.resolve(__dirname, 'dist')
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: path.resolve(__dirname, './tests/browser-tests.html'), to: 'tests.html' },
          { from: path.resolve(__dirname, './docs/*.md'), to: '[name][ext]' },
          { from: path.resolve(__dirname, './docs/_config.yml'), to: '_config.yml' },
          { from: path.resolve(__dirname, './docs/_layouts/'), to: '_layouts/' }
        ]
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser'
      })
    ],

    devtool: 'source-map',
    resolve: {
      alias: {
        '*/deps-node': require.resolve('./tests/test-utils/deps-browser.js'),
        '*/deps-node.js': require.resolve('./tests/test-utils/deps-browser.js'),
        '*/deps-node.ts': require.resolve('./tests/test-utils/deps-browser.js')
      },
      fallback: {
        fs: false,
        path: false
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
        { test: /\.([cm]?ts|tsx)$/, loader: 'ts-loader', options: { transpileOnly: true } }
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
