/* eslint no-console: ["off", { allow: ["warn"] }] */
/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const glob = require('glob');
const shell = require('shelljs');
const sass = require('node-sass');
const tildeImporter = require('node-sass-tilde-importer');
const showError = require('./utils/error');

const srcFolder = 'src';
const distFolder = process.env.NODE_ENV === 'production' ? 'dist' : 'app';
const excludePattern = /(base|styleguide)/;
const importMap = {};

function shorten(str) {
  let result = str.replace(/\.\.\//g, '');
  result = result.replace(/\//g, path.sep);
  return result;
}

function build(module) {
  const file = path.parse(module);
  const targetDir = file.dir.replace(srcFolder, distFolder);

  sass.render({
    file: module,
    importer: [tildeImporter],
    outFile: path.join(targetDir, `${file.name}.css`),
    outputStyle: process.env.NODE_ENV === 'production' ? 'compressed' : 'expanded',
    sourceMap: process.env.NODE_ENV !== 'production',
    includePaths: ['node_modules'],
  }, (error, result) => {
    if (error) {
      showError(error, 'CSS: build failed');
    } else {
      if (!fs.existsSync(targetDir)) { shell.mkdir('-p', targetDir); }
      fs.writeFileSync(path.join(targetDir, `${file.name}.css`), result.css);

      if (process.env.NODE_ENV !== 'production') {
        fs.writeFileSync(path.join(targetDir, `${file.name}.css.map`), result.map);
        const obj = JSON.parse(result.map.toString());
        const sourceFile = shorten(obj.sources[0]);
        const sourceImports = obj.sources.slice(1);
        if (sourceImports.length) {
          importMap[sourceFile] = sourceImports.map(str => shorten(str));
        }
      }
    }
  });
}

function rebuild(event, module) {
  if (event === 'remove') {
    console.log('CSS: remove', chalk.blue(module));
    delete importMap[module];

    const targetPath = module.replace(srcFolder, distFolder).replace('.scss', '.css');
    if (fs.existsSync(targetPath)) {
      console.log('CSS: remove', chalk.blue(targetPath));
      fs.unlinkSync(targetPath);
    }
  } else if (!excludePattern.test(module)) {
    console.log('CSS: build', chalk.blue(module));
    build(module);
  }

  const files = Object.keys(importMap);
  files.forEach((file) => {
    const sources = importMap[file];
    if (sources.includes(module)) {
      console.log('CSS: update', chalk.blue(file));
      build(file);
    }
  });
}

async function run() {
  const startTime = new Date().getTime();
  console.log(
    `[${chalk.gray(new Date().toLocaleTimeString('de-DE'))}]`,
    'Starting CSS...',
  );

  await new Promise((cssResolve) => {
    glob(`${srcFolder}/**/*.scss`, async (error, files) => {
      if (error) {
        showError(error, 'CSS: could not load files');
      } else {
        const modules = files.filter(file => !excludePattern.test(file));

        // add only base.scss
        const base = path.join(srcFolder, 'base', 'base.scss');
        modules.push(base);

        if (process.env.NODE_ENV !== 'production') {
          // add styleguide.scss too
          const styleguide = path.join(srcFolder, 'styleguide', 'styleguide.scss');
          modules.push(styleguide);
        }

        await Promise.all(modules.map(module => build(module)));

        console.log(
          `[${chalk.gray(new Date().toLocaleTimeString('de-DE'))}]`,
          `Finished CSS after ${chalk.blue(`${new Date().getTime() - startTime}ms`)}`,
        );

        cssResolve();
      }
    });
  });
}

if (require.main === module) run();

exports.rebuild = rebuild;
exports.run = run;
