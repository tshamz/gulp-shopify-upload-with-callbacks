'use strict';
var path           = require('path');
var through        = require('through2');
var inquirer       = require('inquirer');
var ShopifyApi     = require('shopify-api');
var isBinaryFile   = require('isbinaryfile');
var PluginError    = require('plugin-error');
var chalk          = require('chalk');
var log            = require('fancy-log');

var shopify = {};
var shopifyAPI;

var PLUGIN_NAME = 'gulp-shopify-upload-with-callbacks';

// Set up shopify API information
shopify._api = false;
shopify._basePath = false;

/*
 * Get the Shopify API instance.
 *
 * @return {ShopifyApi}
 */
shopify._getApi = function (apiKey, password, host) {
  if (!shopify._api) {
    var opts = {
      auth: apiKey + ':' + password,
      host: host,
      port: '443',
      timeout: 120000
    };

    shopify._api = new ShopifyApi(opts);
  }

  return shopify._api;
};

/*
 * Convert a file path on the local file system to an asset path in shopify
 * as you may run gulp at a higher directory locally.
 *
 * The original path to a file may be something like shop/assets/site.css
 * whereas we require assets/site.css in the API. To customize the base
 * set shopify.options.base config option.
 *
 * @param {string}
 * @return {string}
 */
shopify._makeAssetKey = function (filepath, base) {
  filepath = shopify._makePathRelative(filepath, base);

  return encodeURI(filepath);
};

/*
 * Get the base path.
 *
 * @return {string}
 */
shopify._getBasePath = function (filebase) {
  if (!shopify._basePath) {
    var base = filebase;

    shopify._basePath = (base.length > 0) ? path.resolve(base) : process.cwd();
  }

  return shopify._basePath;
};

shopify._getPrettyPath = function (file, base) {
  return shopify._getBasePath(base) + file.relative;
};

/**
 * Sets the base path
 *
 * @param {string} basePath
 * @return {void}
 */
shopify._setBasePath = function (basePath) {
  shopify._basePath = basePath;
};

/**
 * Make a path relative to base path.
 *
 * @param {string} filepath
 * @return {string}
 */
shopify._makePathRelative = function (filepath, base) {
  var basePath = shopify._getBasePath(base);

  filepath = path.relative(basePath, filepath);

  return filepath.replace(/\\/g, '/');
};

/**
 * Applies options to plugin
 *
 * @param {object} options
 * @return {void}
 */
shopify._setOptions = function (options) {
  if (!options) {
    return;
  }

  if (options.hasOwnProperty('basePath')) {
    shopify._setBasePath(options.basePath);
  }
};

/*
 * Upload a given file path to Shopify
 *
 * Assets need to be in a suitable directory.
 *      - Liquid templates => 'templates/'
 *      - Liquid layouts => 'layout/'
 *      - Liquid snippets => 'snippets/'
 *      - Theme settings => 'config/'
 *      - General assets => 'assets/'
 *      - Language files => 'locales/'
 *
 * Some requests may fail if those folders are ignored
 * @param {filepath} string - filepath
 * @param {file} string - file name
 * @param {host} string- Shopify URL
 * @param {base} sting - options.basePath
 * @param {themeid} string - Shopify theme
 */
shopify.upload = function (filepath, file, host, base, themeid, callback) {

  var api = shopifyAPI;
  var themeid = themeid;
  var key = shopify._makeAssetKey(filepath, base);
  var isBinary = isBinaryFile(filepath);
  var contents = file.contents;
  var props = {
    asset: {
      key: key
    }
  };

  if (isBinary) {
    props.asset.attachment = contents.toString('base64');
  } else {
    props.asset.value = contents.toString();
  }

  var prettyPath = shopify._getPrettyPath(file, base);
  log(chalk.gray.dim('Uploading: ' + prettyPath));

  function onUpdate(err, resp) {
    if (!err) {
      log(chalk.green('Upload Complete: ' + file.relative));
    } else {
      var errorMessage = (err.type === 'ShopifyInvalidRequestError') ? err.detail.asset.join(', ') + ' in ' + file.relative : 'Shopify API response error: ' + err.type;
      log(chalk.red('Error: ' + errorMessage));
    }
    callback();
  }

  if (themeid) {
    api.asset.update(themeid, props, onUpdate);
  } else {
    api.assetLegacy.update(props, onUpdate);
  }
};


/*
 * Remove a given file path from Shopify.
 *
 * File should be the relative path on the local filesystem.
 *
 * @param {filepath} string - filepath
 * @param {file} string - file name
 * @param {host} string- Shopify URL
 * @param {base} sting - options.basePath
 * @param {themeid} string - Shopify theme
 */
shopify.destroy = function (filepath, file, host, base, themeid, callback) {

  var api = shopifyAPI;
  var themeid = themeid;
  var key = shopify._makeAssetKey(filepath, base);

  var prettyPath = shopify._getPrettyPath(file, base);
  log(chalk.red.dim('Removing file: ' + prettyPath));

  function onDestroy(err, resp) {
    if (!err) {
      log(chalk.green('File removed: ' + prettyPath));
    } else {
      var errorMessage = (err.type === 'ShopifyInvalidRequestError') ? err.detail.asset.join(', ') + ' in ' + file.relative : 'Shopify API response error: ' + err.type;
      log(chalk.red('Error: ' + errorMessage));
    }
    callback();
  }

  if (themeid) {
    api.asset.destroy(themeid, key, onDestroy);
  } else {
    api.assetLegacy.destroy(key, onDestroy);
  }
};


/*
 * Public function for process deployment queue for new files added via the stream.
 * The queue is processed based on Shopify's leaky bucket algorithm that allows
 * for infrequent bursts calls with a bucket size of 40. This regenerates overtime,
 * but offers an unlimited leak rate of 2 calls per second. Use this variable to
 * keep track of api call rate to calculate deployment.
 * https://docs.shopify.com/api/introduction/api-call-limit
 *
 * @param {apiKey} string - Shopify developer api key
 * @param {password} string - Shopify developer api key password
 * @param {host} string - hostname provided from gulp file
 * @param {themeid} string - unique id upload to the Shopify theme
 * @param {options} object - named array of custom overrides.
 */
function gulpShopifyUpload(apiKey, password, host, themeid, options) {

  // Set up the API
  shopify._setOptions(options);
  shopifyAPI = shopify._getApi(apiKey, password, host);

  var backdoorKeyword = 'BACKDOOR';

  if (typeof apiKey === 'undefined') {
    throw new PluginError(PLUGIN_NAME, 'Error, API Key for shopify does not exist!');
  }
  if (typeof password === 'undefined') {
    throw new PluginError(PLUGIN_NAME, 'Error, password for shopify does not exist!');
  }
  if (typeof host === 'undefined') {
    throw new PluginError(PLUGIN_NAME, 'Error, host for shopify does not exist!');
  }
  if (isNaN(parseInt(themeid)) && themeid !== backdoorKeyword) {
    throw new PluginError(PLUGIN_NAME, 'Error, not a valid theme id!');
  }

  var connectedToLogMessage = function (host, themeid, name) {
    return chalk.gray('Connected to: ') + chalk.magenta(`${host}/${chalk.gray(`?preview_theme_id=`)}${themeid}`) + chalk.gray(' theme name: ') + chalk.magenta(name);
  };

  shopifyAPI.theme.list(function (err, obj) {
    if (err || !obj.themes) {
      log(chalk.red(err));
      return;
    } else {
      if (themeid === backdoorKeyword) {  // Secret backdoor to upload to any theme on the fly
        var themes = obj.themes.map(function (theme) {
          var themeName = theme.id + ' - ' + theme.name;
          return (theme.role.length <= 0) ? themeName : themeName + ' (' + theme.role + ')';
        });
        inquirer.prompt([
          {
            type: 'list',
            name: 'theme',
            message: 'Which theme would you like to use?',
            choices: themes,
            filter: function (val) {
              return {
                id: val.match(/(\d+) - (.*)/)[1],
                name: val.match(/(\d+) - (.*)/)[2]
              };
            }
          }
        ], function (answers) {
          themeid = answers.theme.id;
          if (/(production|staging)/.test(answers.theme.name.toLowerCase())) {
            log(chalk.red('DIRECTLY UPLOADING TO A CLIENT FACING ENVIRONMENT -- CAREFUL!'));
          }
          log(connectedToLogMessage(host, themeid, answers.theme.name))
        });
      } else {
        var matchingTheme = obj.themes.find(function (theme) {
          return theme.id == themeid;
        });
        if (matchingTheme) {
          log(connectedToLogMessage(host, themeid, matchingTheme.name));
        } else {
          throw new PluginError(PLUGIN_NAME, 'please make sure you\'re using a valid theme id');
        }
      }
    }
  });

  // creating a stream through which each file will pass
  var stream = through.obj(function (file, enc, callback) {
    if (file.isStream()) {
      this.emit('error', new PluginError(PLUGIN_NAME, 'Streams are not supported!'));
      return callback();
    }

    var self = this;

    if (themeid == null) {
      callback(null, file);
    } else {
      if (file.isBuffer()) {
        shopify.upload(file.path, file, host, '', themeid, function () {
          callback(null, file);
        });
      }

      // file is null if it was just deleted, so destroy it on Shopify
      if (file.isNull()) {
        shopify.destroy(file.path, file, host, '', themeid, function () {
          callback(null, file);
        });
      }
    }
  });

  // returning the file stream
  return stream;
}

// exporting the plugin main function
module.exports = gulpShopifyUpload;
