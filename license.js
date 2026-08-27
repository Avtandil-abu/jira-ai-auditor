// license.js
//
// Single source of truth for Premium license state.
//
// This is intentionally simple: a plain feature flag, not a network call
// or cryptographic check. It is backed by the PROPRIETARY LICENSE in
// LICENSE.txt, which legally prohibits modifying or redistributing this
// software (including this flag) without authorization from Avtandil Labs.
//
// This is deliberately kept in its own file, separate from index.js,
// auditHelper.js, and enterpriseSprintAnalyzer.js, so that:
//   1) It's the only file anyone needs to touch to activate a real license.
//   2) A stronger verification mechanism (e.g. a real license key checked
//      against a server) can replace the inside of this file later,
//      without editing any of the files that depend on it - they only
//      ever call isPremiumEnabled().

const LICENSE = {
    // Set to true only after purchasing/activating a Premium license.
    enabled: false
};

export function isPremiumEnabled() {
    return LICENSE.enabled === true;
}
