// Signs release builds with your own keystore when ~/.gradle/gradle.properties provides one, and
// falls back to the debug key otherwise, so anyone can still build. Survives `expo prebuild`.
//
//   NOD_RELEASE_STORE_FILE=/Users/you/.nod-signing/nod-release.keystore
//   NOD_RELEASE_STORE_PASSWORD=...
//   NOD_RELEASE_KEY_ALIAS=nod            (optional, default "nod")
//   NOD_RELEASE_KEY_PASSWORD=...         (optional, default: the store password)
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// nod-release-signing";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes(MARKER)) return cfg;

    g = g.replace(
      /(signingConfigs \{\s*debug \{[\s\S]*?\n        \})/,
      `$1
        ${MARKER}
        release {
            if (findProperty('NOD_RELEASE_STORE_FILE')) {
                storeFile file(findProperty('NOD_RELEASE_STORE_FILE'))
                storePassword findProperty('NOD_RELEASE_STORE_PASSWORD')
                keyAlias findProperty('NOD_RELEASE_KEY_ALIAS') ?: 'nod'
                keyPassword findProperty('NOD_RELEASE_KEY_PASSWORD') ?: findProperty('NOD_RELEASE_STORE_PASSWORD')
            }
        }`,
    );
    // Only the release build type changes; debug keeps the debug key.
    g = g.replace(
      /(release \{\s*\/\/ Caution![\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig findProperty('NOD_RELEASE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    cfg.modResults.contents = g;
    return cfg;
  });
};
