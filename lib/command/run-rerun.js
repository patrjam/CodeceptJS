const { getConfig, getTestRoot } = require('./utils');
const { printError, createOutputDir } = require('./utils');
const Config = require('../config');
const Codecept = require('../rerun');

module.exports = function (test, options) {
  // registering options globally to use in config
  // Backward compatibility for --profile
  process.profile = options.profile;
  process.env.profile = options.profile;
  const configFile = options.config;
  let codecept;

  let config = getConfig(configFile);
  if (options.override) {
    config = Config.append(JSON.parse(options.override));
  }
  const testRoot = getTestRoot(configFile);
  createOutputDir(config, testRoot);

  function processError(err) {
    printError(err);
    process.exit(1);
  }

  try {
    codecept = new Codecept(config, options);
    codecept.init(testRoot);

    codecept.runBootstrap((err) => {
      if (err) throw new Error(`Error while running bootstrap file :${err}`);

      codecept.loadTests();
      codecept.run(test).catch(processError);
    });
  } catch (err) {
    processError(err);
  }
};
