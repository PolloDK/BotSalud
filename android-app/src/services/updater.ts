import OtaHotUpdate from 'react-native-ota-hot-update';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BUILD_TAG } from '../buildInfo';

const APPLIED_TAG_KEY = '@botsalud_applied_tag';
const RELEASES_URL = 'https://api.github.com/repos/PolloDK/BotSalud/releases/latest';

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

export const checkAndApplyUpdate = async (): Promise<void> => {
  try {
    const res = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return;

    const release: GitHubRelease = await res.json();
    const latestTag = release.tag_name;

    // Check what's currently running (applied OTA tag, or the baked-in APK tag)
    const appliedTag = await AsyncStorage.getItem(APPLIED_TAG_KEY) ?? BUILD_TAG;
    if (latestTag === appliedTag) return;

    const bundleAsset = release.assets.find(a => a.name === 'bundle.zip');
    if (!bundleAsset) return;

    await OtaHotUpdate.downloadBundleUri(bundleAsset.browser_download_url, {
      updateSuccess: async () => {
        await AsyncStorage.setItem(APPLIED_TAG_KEY, latestTag);
      },
      updateFail: (_msg: string) => {
        // Leave stored tag unchanged so we retry next launch
      },
      restartAfterInstall: true,
    });
  } catch {
    // Network unavailable or no releases yet — silent fail
  }
};
