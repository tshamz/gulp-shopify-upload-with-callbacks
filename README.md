gulp-shopify-upload-with-callbacks
===================

## Introduction

**gulp-shopify-upload-with-callbacks** is a [Gulpjs](https://github.com/gulpjs/gulp) plugin forked from https://github.com/mikenorthorp/gulp-shopify-upload and then augmented to allow for callbacks after a file has been uploaded.

That project was a port of a similar plugin using Grunt called [grunt-shopify](https://github.com/wilr/grunt-shopify), thank you to the author for making a great plugin for Shopify.

## Features

- Uploads any file changes to Shopify in the folders:  `assets, layout, config, sections, snippets, templates, locales`, and uploads file to the themeid passed to plugin
- Can also pass backdoor keyword (see line 232) as themeid to use prompt to manually select theme
- Supports incremental file changes as well as a full site deploy for continuous integration
- Lightweight and fast, changes are uploaded instantly
- Improved error handling over origial plugin
- After upload completes, can pipe stream along for other purpose (e.g. browser-sync)

## Basic Usage

1. Download whatever theme you are working on from Shopify to a local directory (or setup directory structure seen below)
```
shopify-theme/
|-- assets/
|-- config/
|-- layout/
|-- locales/
|-- snippets/
|-- sections/
|-- templates/
```
2. Create a [private app](http://docs.shopify.com/api/authentication/creating-a-private-app) in Shopify and grab the API Key and Password for it
3. Get themeid for Shopify theme that you'd like to upload to
4. Grab URL of your Shopify store
5. Add the above information to the `gulp-shopify-upload-with-callbacks` plugin in your gulpfile.js as follows:
```
gulp.task('upload', () => {
  return watch('./{assets|layout|config|snippets|sections|templates|locales}/**')
    .pipe(shopify('<API_KEY>', '<PASSWORD>', '<MYSITE.myshopify.com>', '<THEME_ID>'));
});
```

**Example Gulpfile**
```
const gulp = require('gulp');
const watch = require('gulp-watch');
const shopify = require('gulp-shopify-upload-with-callbacks');

gulp.task('upload', () => {
  return watch('./{assets|layout|config|snippets|sections|templates|locales}/**')
    .pipe(shopify('<API_KEY>', '<PASSWORD>', '<MYSITE.myshopify.com>', '<THEME_ID>'));
});

gulp.task('default', ['upload']);
```

The basic function call looks like
```
shopify('<API_KEY>', '<PASSWORD>', '<MYSITE.myshopify.com>', '<THEME_ID>')
```
  - `API_KEY` is the API Key generated when creating a private app in Shopify
  - `PASSWORD` is the Password generated when creating a private app in Shopify
  - `MYSITE.myshopify.com` is the URL of your shop
  - `THEME_ID` is the ID of your theme

## Advanced Usage
**Customize Your Base Deployment Path**
If your project structure is different (perhaps you use gulp to compile your theme to another directory), you can change the directory from which the plugin picks up files.
To do so, simply provide an additional options hash to function call, with a `basePath` property.

```
const options = {
  "basePath": "some/other-directory/"
};

shopify('<API_KEY>', '<PASSWORD>', '<MYSITE.myshopify.com>', '<THEME_ID>', options);
```

**.piping along upload**
If you want to perform another action after the upload completes (e.g. reload browser via. browser-sync), you can .pipe upload along like so:
```
gulp.task('upload', () => {
  return watch('./{assets|layout|config|snippets|sections|templates|locales}/**')
    .pipe(shopify('<API_KEY>', '<PASSWORD>', '<MYSITE.myshopify.com>', '<THEME_ID>'))
    .pipe(browserSync.stream());
});
```
