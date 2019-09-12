const fs = require('fs');
const path = require('path');

const { NODE_ENV } = process.env;
if (!NODE_ENV) {
  throw new Error('The NODE_ENV environment variable is required but was not specified.');
}

const dotenv = path.resolve(fs.realpathSync(process.cwd()), '.env');

// https://github.com/bkeepers/dotenv#what-other-env-files-can-i-use
const dotenvFiles = [
  `${dotenv}.${NODE_ENV}.local`,
  `${dotenv}.${NODE_ENV}`,
  // Don't include `.env.local` for `test` environment
  // since normally you expect tests to produce the same
  // results for everyone
  NODE_ENV !== 'test' && `${dotenv}.local`,
  dotenv,
].filter(Boolean);

// Load environment variables from .env* files. Suppress warnings using silent
// if this file is missing. dotenv will never modify any environment variables
// that have already been set.
// https://github.com/motdotla/dotenv
dotenvFiles.forEach((dotenvFile) => {
  if (fs.existsSync(dotenvFile)) {
    // eslint-disable-next-line global-require
    require('dotenv').config({
      path: dotenvFile,
    });
  }
});

// Grab EB_CONSTANT_* environment variables and prepare them to be
// injected into the application via DefinePlugin in Webpack configuration.
const EB_CONSTANT = /^EB_CONSTANT/i;

const raw = Object.keys(process.env)
  .filter(key => EB_CONSTANT.test(key))
  .reduce(
    (env, key) => {
      // eslint-disable-next-line no-param-reassign
      env[key] = process.env[key];
      return env;
    },
    {
      // Default variables
    },
  );
// Stringify all values so we can feed into Webpack DefinePlugin
const stringified = Object.keys(raw).reduce((env, key) => {
  // eslint-disable-next-line no-param-reassign
  env[`process.env.${key}`] = JSON.stringify(raw[key]);
  return env;
}, {});

module.exports = { raw, stringified };
