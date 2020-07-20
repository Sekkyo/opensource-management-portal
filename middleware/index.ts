//
// Copyright (c) Microsoft.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.
//

/*eslint no-console: ["error", { allow: ["log", "warn"] }] */

import bodyParser from 'body-parser';
import compression from 'compression';
import path from 'path';

const debug = require('debug')('startup');

import { StaticClientApp } from './staticClientApp';
import { StaticSiteFavIcon, StaticSiteAssets } from './staticSiteAssets';
import ConnectSession from './session';
import passportConfig from './passport-config';
import Onboard from './onboarding';
import viewServices from '../lib/pugViewServices';
import { IProviders, IApplicationProfile } from '../transitional';

const campaign = require('./campaign');
const officeHyperlinks = require('./officeHyperlinks');
const rawBodyParser = require('./rawBodyParser');

module.exports = function initMiddleware(app, express, config, dirname, initializationError) {
  config = config || {};
  const appDirectory = config && config.typescript && config.typescript.appDirectory ? config.typescript.appDirectory : stripDistFolderName(dirname);
  const providers = app.get('providers') as IProviders;
  const applicationProfile = providers.applicationProfile;
  if (initializationError) {
    providers.healthCheck.healthy = false;
  }

  app.set('views', path.join(appDirectory, 'views'));
  app.set('view engine', 'pug');
  app.set('view cache', false);
  app.disable('x-powered-by');

  app.set('viewServices', viewServices);
  providers.viewServices = viewServices;
  if (applicationProfile.webServer) {
    StaticSiteFavIcon(app);
    app.use(rawBodyParser);
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(compression());
    if (applicationProfile.serveStaticAssets) {
      StaticSiteAssets(app, express);
    }
    if (applicationProfile.serveClientAssets) {
      StaticClientApp(app, express);
    }
    providers.campaign = campaign(app, config);
    let passport;
    if (!initializationError) {
      if (config.containers && config.containers.deployment) {
        app.enable('trust proxy');
        debug('proxy: trusting reverse proxy');
      }
      app.use(ConnectSession(app, config, providers));
      try {
        passport = passportConfig(app, config);
      } catch (passportError) {
        initializationError = passportError;
      }
    }
    app.use(require('./scrubbedUrl'));
    app.use(require('./logger')(config));
    app.use(require('./locals'));
    if (!initializationError) {
      require('./passport-routes')(app, passport, config);
      if (config.github.organizations.onboarding && config.github.organizations.onboarding.length) {
        debug('Onboarding helper loaded');
        Onboard(app, config);
      }
      app.use(officeHyperlinks);
    }
  }
  if (initializationError) {
    providers.healthCheck.healthy = false;
    throw initializationError;
  } else {
    providers.healthCheck.ready = true; // Ready to accept traffic
  }
};

function stripDistFolderName(dirname: string) {
  // This is a hacky backup for init failure scenarios where the dirname may
  // not actually point at the app root.
  if (dirname.endsWith('dist')) {
    dirname = dirname.replace('\\dist', '');
    dirname = dirname.replace('/dist', '');
  }
  return dirname;
}
