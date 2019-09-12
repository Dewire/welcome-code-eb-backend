const path = require('path');
const webpack = require('webpack');
// Get injected environment variables.
const env = require('./WebpackBuildConstants');


module.exports = {
  entry: path.join(__dirname, 'src/index.js'),
  target: 'node',
  module: {
    loaders: [{
      test: /\.js$/,
      loaders: ['babel-loader'],
      include: __dirname,
      exclude: /node_modules/,
    }],
  },
  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js',
  },
  plugins: [
    // Makes some environment variables available to the JS code, for example:
    // if (process.env.NODE_ENV === 'development') { ... }. See `./WebpackBuildConstants.js`.
    new webpack.DefinePlugin(env.stringified),
  ],
  resolve: {
    alias: {
      hiredis: path.join(__dirname, 'aliases/hiredis.js'),
    },
  },
};
