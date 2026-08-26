import { BUILD_TAG } from '../buildInfo';

const RELEASES_URL = 'https://api.github.com/repos/PolloDK/BotSalud/releases/latest';

export interface UpdateInfo {
  available: boolean;
  latestTag?: string;
  apkUrl?: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

// Build tags look like "build-18"; compare the trailing number.
const buildNumber = (tag: string | undefined): number => {
  const m = /(\d+)/.exec(tag ?? '');
  return m ? parseInt(m[1], 10) : 0;
};

// Checks GitHub Releases for a newer APK than the one currently installed.
// Returns { available: false } on any error (offline, rate-limited, no asset).
export const checkForUpdate = async (): Promise<UpdateInfo> => {
  try {
    const res = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return { available: false };

    const release: GitHubRelease = await res.json();
    const latestTag = release.tag_name;
    const apk = (release.assets ?? []).find(a => a.name.endsWith('.apk'));
    if (!apk) return { available: false, latestTag };

    if (buildNumber(latestTag) > buildNumber(BUILD_TAG)) {
      return { available: true, latestTag, apkUrl: apk.browser_download_url };
    }
    return { available: false, latestTag };
  } catch {
    return { available: false };
  }
};
