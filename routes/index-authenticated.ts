//
// Copyright (c) Microsoft.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.
//

/*eslint no-console: ["error", { allow: ["warn"] }] */

import _ from 'lodash';

import express from 'express';
import asyncHandler from 'express-async-handler';
const router = express.Router();

import { ReposAppRequest, IProviders } from '../transitional';
import { AddLinkToRequest, RequireLinkMatchesGitHubSessionExceptPrefixedRoute } from '../middleware/links/';
import { requireAuthenticatedUserOrSignIn, setIdentity } from '../middleware/business/authentication';
import { Organization } from '../business/organization';

import linkRoute from './link';
import linkedUserRoute from './index-linked';
import linkCleanupRoute from './link-cleanup';

const placeholdersRoute = require('./placeholders');
const settingsRoute = require('./settings');
const releasesSpa = require('./releasesSpa');

// - - - Middleware: require that they have a passport - - -
router.use(requireAuthenticatedUserOrSignIn);
// - - - Middleware: set the identities we have authenticated  - - -
router.use(setIdentity);
// - - - Middleware: resolve whether the corporate user has a link - - -
router.use(asyncHandler(AddLinkToRequest));
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

router.use('/placeholder', placeholdersRoute);
router.use('/link/cleanup', linkCleanupRoute);
router.use('/link', linkRoute);
router.use('/settings', settingsRoute);
router.use('/releases', releasesSpa);

// Link cleanups and check their signed-in username vs their link
router.use(RequireLinkMatchesGitHubSessionExceptPrefixedRoute('/unlink'));

router.get('/news', (req: ReposAppRequest, res, next) => {
  const config = req.app.settings.runtimeConfig;
  if (config && config.news && config.news.all && config.news.all.length) {
    return req.individualContext.webContext.render({
      view: 'news',
      title: 'What\'s New',
    });
  } else {
    return next(); // only attach this route if there are any static stories
  }
});

// Dual-purpose homepage: if not linked, welcome; otherwise, show things
router.get('/', asyncHandler(async function (req: ReposAppRequest, res, next) {
  const onboarding = req.query.onboarding !== undefined;
  const individualContext = req.individualContext;
  const link = individualContext.link;
  const providers = req.app.settings.providers as IProviders;
  const operations = providers.operations;
  const config = req.app.settings.runtimeConfig;
  if (!link) {
    if (!individualContext.getGitHubIdentity()) {
      return individualContext.webContext.render({
        view: 'welcome',
        title: 'Welcome',
      });
    }
    return res.redirect('/link');
  }
  const warnings = [];
  const activeOrg = null;
  const id = link.thirdPartyId;
  const results = {
    isLinkedUser: link && link.thirdPartyId ? link : false,
    overview: id ? await individualContext.aggregations.getAggregatedOverview() : null,
    isAdministrator: false, // legacyUserContext.isAdministrator(callback); // CONSIDER: Re-implement isAdministrator
    // TODO: bring back sudoers
    countOfOrgs: operations.organizations.size,
    twoFactorOn: null,
    isSudoer: null,
    twoFactorOff: false, // TODO: RESTORE: Reinstate two-factor off functionality
    teamsMaintainedHash: null,
    userOrgMembership: null,
  };
  let groupedAvailableOrganizations = null;
  const overview = results.overview;
  // results may contains undefined returns because we skip some errors to make sure homepage always load successfully.
  if (overview && overview.organizations) {
    if (overview.organizations.member.length) {
      results.countOfOrgs = overview.organizations.member.length;
      if (overview.organizations.member.length > 0) {
        results.twoFactorOn = true;
        // ANTIQUATED: How to verify in a world with some mixed 2FA value orgs?
        // NOTE: 2FA org settings can now be determined in the org details body
      }
    }
    if (overview.organizations.available) {
      const availableNames = overview.organizations.available.map((org: Organization) => { return org.name; });
      groupedAvailableOrganizations = _.groupBy(operations.getOrganizations(availableNames), 'priority');
    }
  }
  if (results.isAdministrator && results.isAdministrator === true) {
    results.isSudoer = true;
  }
  if (results.twoFactorOff === true) {
    // Now that GitHub enforces 2FA at join time, a non-compliant user will get warned while joining, natively.
    // TODO: This would redirect to the organization /security-check endpoint
    // return res.redirect(tempOrgNeedToFix.baseUrl + 'security-check');
  }
  if (overview && overview.teams && overview.teams.maintainer) {
    const maintained = overview.teams.maintainer;
    if (maintained.length > 0) {
      const teamsMaintainedHash = {};
      maintained.forEach(maintainedTeam => {
        teamsMaintainedHash[maintainedTeam.id] = maintainedTeam;
      });
      results.teamsMaintainedHash = teamsMaintainedHash;
      // dc.getPendingApprovals(teamsMaintained, function (error, pendingApprovals) {
      //   if (error) {
      //     return next(error);
      //   }
      //   results.pendingApprovals = pendingApprovals;
      //   render(results);
      // });
    }
  }
  if (warnings && warnings.length > 0) {
    individualContext.webContext.saveUserAlert(warnings.join(', '), 'Some organizations or memberships could not be loaded', 'danger');
  }
  const pageTitle = results && results.userOrgMembership === false ? 'My GitHub Account' : config.brand.companyName + ' - ' + config.brand.appName;
  individualContext.webContext.render({
    view: 'index',
    title: pageTitle,
    optionalObject: {
      accountInfo: results,
      onboarding: onboarding,
      onboardingPostfixUrl: onboarding === true ? '?onboarding=' + config.brand.companyName : '',
      activeOrgUrl: activeOrg ? activeOrg.baseUrl : '/?',
      getOrg: (orgName: string) => {
        return operations.getOrganization(orgName);
      },
      groupedAvailableOrganizations: groupedAvailableOrganizations,
    },
  });
}));

router.use(linkedUserRoute);

export default router;
