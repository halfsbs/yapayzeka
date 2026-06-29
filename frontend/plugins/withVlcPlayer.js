const { withSettingsGradle, withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withVlcPlayer(config) {
  // 1. settings.gradle
  config = withSettingsGradle(config, (config) => {
    if (!config.modResults.contents.includes("react-native-vlc-media-player")) {
      config.modResults.contents += `
include ':react-native-vlc-media-player'
project(':react-native-vlc-media-player').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-vlc-media-player/android')
`;
    }
    return config;
  });

  // 2. app/build.gradle - dependency + packagingOptions (libc++_shared.so çakışması önlemi)
  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes("react-native-vlc-media-player")) {
      contents = contents.replace(
        "dependencies {",
        `dependencies {
    implementation project(':react-native-vlc-media-player')`
      );
    }

    if (!contents.includes("pickFirst 'lib/arm64-v8a/libc++_shared.so'")) {
      contents = contents.replace(
        "android {",
        `android {
    packagingOptions {
        pickFirst 'lib/arm64-v8a/libc++_shared.so'
        pickFirst 'lib/armeabi-v7a/libc++_shared.so'
        pickFirst 'lib/x86/libc++_shared.so'
        pickFirst 'lib/x86_64/libc++_shared.so'
    }`
      );
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
};
