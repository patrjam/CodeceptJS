// @ts-nocheck
const Allure = require('allure-js-commons');
const { MetaStep } = require('../step');
// const Allure2 = AllureJsCommons.Allure

// Allure.Allure.prototype.epic('')

const event = require('../event');
const logger = require('../output');
const { ansiRegExp } = require('../utils');

const defaultConfig = {
  outputDir: global.output_dir,
};

/**
 * Allure reporter
 *
 * ![](https://user-images.githubusercontent.com/220264/45676511-8e052800-bb3a-11e8-8cbb-db5f73de2add.png)
 *
 * Enables Allure reporter.
 *
 * #### Usage
 *
 * To start please install `allure-commandline` package (which requires Java 8)
 *
 * ```
 * npm install -g allure-commandline --save-dev
 * ```
 *
 * Add this plugin to config file:
 *
 * ```js
 * "plugins": {
 *     "allure": {}
 * }
 * ```
 *
 * Run tests with allure plugin enabled:
 *
 * ```
 * npx codeceptjs run --plugins allure
 * ```
 *
 * By default, allure reports are saved to `output` directory.
 * Launch Allure server and see the report like on a screenshot above:
 *
 * ```
 * allure serve output
 * ```
 *
 * #### Configuration
 *
 * * `outputDir` - a directory where allure reports should be stored. Standard output directory is set by default.
 * * `enableScreenshotDiffPlugin` - a boolean flag for add screenshot diff to report.
 *    To attach, tou need to attach three files to the report - "diff.png", "actual.png", "expected.png".
 *    See [Allure Screenshot Plugin](https://github.com/allure-framework/allure2/blob/master/plugins/screen-diff-plugin/README.md)
 *
 * #### Public API
 *
 * There are few public API methods which can be accessed from other plugins.
 *
 * ```js
 * const allure = codeceptjs.container.plugins('allure');
 * ```
 *
 * `allure` object has following methods:
 *
 * * `addAttachment(name, buffer, type)` - add an attachment to current test / suite
 * * `addLabel(name, value)` - adds a label to current test
 * * `addParameter(kind, name, value)` - adds a parameter to current test
 * * `severity(value)` - adds severity label
 * * `epic(value)` - adds epic label
 * * `feature(value)` - adds feature label
 * * `story(value)` - adds story label
 * * `issue(value)` - adds issue label
 * * `setDescription(description, type)` - sets a description
 *
 */

module.exports = (config) => {
  defaultConfig.outputDir = global.output_dir;
  config = Object.assign(defaultConfig, config);

  const allureCodeceptJsPlugin = {};

  const allureOriginal = new AllureJsCommons();
  const allureOriginalConfig = new AllureJsCommons.AllureConfig();

  const allureConfig = allureOriginalConfig({ targetDir: config.outputDir });
  this.coreReporter = new AllureReporter(new AllureRuntime(allureConfig));

  let currentMetaStep = [];
  let currentStep;
  let isHookSteps = false;

  allureOriginal.pendingCase = function (testName, timestamp, opts = {}) {
    allureOriginal.startCase(testName, timestamp);

    if (opts.description) allureCodeceptJsPlugin.setDescription(opts.description);
    if (opts.severity) allureCodeceptJsPlugin.severity(opts.severity);
    if (opts.severity) allureCodeceptJsPlugin.addLabel('tag', opts.severity);

    allureOriginal.endCase('pending', { message: opts.message || 'Test ignored' }, timestamp);
  };

  allureCodeceptJsPlugin.addAttachment = (name, buffer, type) => {
    allureOriginal.addAttachment(name, buffer, type);
  };

  allureCodeceptJsPlugin.setDescription = (description, type) => {
    const currentTest = allureOriginal.getCurrentTest();
    if (currentTest) {
      currentTest.setDescription(description, type);
    } else {
      logger.error(`The test is not run. Please use "setDescription" for events:
      "test.start", "test.before", "test.after", "test.passed", "test.failed", "test.finish"`);
    }
  };

  allureCodeceptJsPlugin.createStep = (name, stepFunc = () => { }) => {
    let result;
    let status = 'passed';
    allureOriginal.startStep(name);
    try {
      result = stepFunc(this.arguments);
    } catch (error) {
      status = 'broken';
      throw error;
    } finally {
      if (!!result
        && (typeof result === 'object' || typeof result === 'function')
        && typeof result.then === 'function'
      ) {
        result.then(() => allureOriginal.endStep('passed'), () => allureOriginal.endStep('broken'));
      } else {
        allureOriginal.endStep(status);
      }
    }
    return result;
  };

  allureCodeceptJsPlugin.createAttachment = (name, content, type) => {
    if (typeof content === 'function') {
      const attachmentName = name;
      const buffer = content.apply(this, arguments);
      return createAttachment(attachmentName, buffer, type);
    } allureOriginal.addAttachment(name, content, type);
  };

  allureCodeceptJsPlugin.severity = (severity) => {
    allureCodeceptJsPlugin.addLabel('severity', severity);
  };

  allureCodeceptJsPlugin.epic = (epic) => {
    allureCodeceptJsPlugin.addLabel('epic', epic);
  };

  allureCodeceptJsPlugin.feature = (feature) => {
    allureCodeceptJsPlugin.addLabel('feature', feature);
  };

  allureCodeceptJsPlugin.story = (story) => {
    allureCodeceptJsPlugin.addLabel('story', story);
  };

  allureCodeceptJsPlugin.issue = (issue) => {
    allureCodeceptJsPlugin.addLabel('issue', issue);
  };

  allureCodeceptJsPlugin.addLabel = (name, value) => {
    const currentTest = allureOriginal.getCurrentTest();
    if (currentTest) {
      currentTest.addLabel(name, value);
    } else {
      logger.error(`The test is not run. Please use "addLabel" for events:
      "test.start", "test.before", "test.after", "test.passed", "test.failed", "test.finish"`);
    }
  };

  allureCodeceptJsPlugin.addParameter = (kind, name, value) => {
    const currentTest = allureOriginal.getCurrentTest();
    if (currentTest) {
      currentTest.addParameter(kind, name, value);
    } else {
      logger.error(`The test is not run. Please use "addParameter" for events:
      "test.start", "test.before", "test.after", "test.passed", "test.failed", "test.finish"`);
    }
  };

  event.dispatcher.on(event.suite.before, (suite) => {
    allureOriginal.startSuite(suite.fullTitle());
  });

  event.dispatcher.on(event.suite.before, (suite) => {
    for (const test of suite.tests) {
      if (test.pending) {
        allureOriginal.pendingCase(test.title, null, test.opts.skipInfo);
      }
    }
  });

  event.dispatcher.on(event.hook.started, () => {
    isHookSteps = true;
  });

  event.dispatcher.on(event.hook.passed, () => {
    isHookSteps = false;
  });

  event.dispatcher.on(event.suite.after, () => {
    allureOriginal.endSuite();
  });

  event.dispatcher.on(event.test.before, (test) => {
    allureOriginal.startCase(test.title);
    if (config.enableScreenshotDiffPlugin) {
      const currentTest = allureOriginal.getCurrentTest();
      currentTest.addLabel('testType', 'screenshotDiff');
    }
    currentStep = null;
  });

  event.dispatcher.on(event.test.started, (test) => {
    const currentTest = allureOriginal.getCurrentTest();
    for (const tag of test.tags) {
      currentTest.addLabel('tag', tag);
    }
  });

  event.dispatcher.on(event.test.failed, (test, err) => {
    if (currentStep) allureOriginal.endStep('failed');
    if (currentMetaStep.length) {
      currentMetaStep.forEach(() => allureOriginal.endStep('failed'));
      currentMetaStep = [];
    }

    err.message = err.message.replace(ansiRegExp(), '');
    if (allureOriginal.getCurrentTest()) {
      allureOriginal.endCase('failed', err);
    } else {
      // this means before suite failed, we should report this.
      allureOriginal.startCase(`BeforeSuite of suite ${allureOriginal.getCurrentSuite().name} failed.`);
      allureOriginal.endCase('failed', err);
    }
  });

  event.dispatcher.on(event.test.passed, () => {
    if (currentStep) allureOriginal.endStep('passed');
    if (currentMetaStep.length) {
      currentMetaStep.forEach(() => allureOriginal.endStep('passed'));
      currentMetaStep = [];
    }
    allureOriginal.endCase('passed');
  });

  event.dispatcher.on(event.test.skipped, (test) => {
    let loaded = true;
    if (test.opts.skipInfo.isFastSkipped) {
      loaded = false;
      allureOriginal.startSuite(test.parent.fullTitle());
    }
    allureOriginal.pendingCase(test.title, null, test.opts.skipInfo);
    if (!loaded) {
      allureOriginal.endSuite();
    }
  });

  event.dispatcher.on(event.step.started, (step) => {
    if (isHookSteps === false) {
      startMetaStep(step.metaStep);
      if (currentStep !== step) {
        // In multi-session scenarios, actors' names will be highlighted with ANSI
        // escape sequences which are invalid XML values
        step.actor = step.actor.replace(ansiRegExp(), '');
        allureOriginal.startStep(step.toString());
        currentStep = step;
      }
    }
  });

  event.dispatcher.on(event.step.comment, (step) => {
    allureOriginal.startStep(step.toString());
    currentStep = step;
    allureOriginal.endStep('passed');
    currentStep = null;
  });

  event.dispatcher.on(event.step.passed, (step) => {
    if (currentStep === step) {
      allureOriginal.endStep('passed');
      currentStep = null;
    }
  });

  event.dispatcher.on(event.step.failed, (step) => {
    if (currentStep === step) {
      allureOriginal.endStep('failed');
      currentStep = null;
    }
  });

  let maxLevel;
  function finishMetastep(level) {
    const metaStepsToFinish = currentMetaStep.splice(maxLevel - level);
    metaStepsToFinish.forEach(() => allureOriginal.endStep('passed'));
  }

  function startMetaStep(metaStep, level = 0) {
    maxLevel = level;
    if (!metaStep) {
      finishMetastep(0);
      maxLevel--;
      return;
    }

    startMetaStep(metaStep.metaStep, level + 1);

    if (metaStep.toString() !== currentMetaStep[maxLevel - level]) {
      finishMetastep(level);
      currentMetaStep.push(metaStep.toString());
      allureOriginal.startStep(metaStep.toString());
    }
  }

  return allureCodeceptJsPlugin;
};
