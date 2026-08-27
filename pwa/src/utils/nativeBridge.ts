// Universal Native Bridge Adapter
// Detects if Viri Cashier is running inside the standalone Desktop App, Android App, or standard Web Browser

export interface ViriAppEnvironment {
  isStandalone: boolean;
  platform: 'electron' | 'android' | 'web';
  appVersion?: string;
}

export function detectAppEnvironment(): ViriAppEnvironment {
  // 1. Electron Desktop
  if (typeof window !== 'undefined' && (window as any).viriAppInfo?.isStandaloneApp) {
    return {
      isStandalone: true,
      platform: 'electron',
      appVersion: (window as any).viriAppInfo?.version || '1.4.0'
    };
  }

  // 2. Android Capacitor
  if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
    return {
      isStandalone: true,
      platform: 'android',
      appVersion: '1.4.0'
    };
  }

  // 3. Web Browser
  return {
    isStandalone: false,
    platform: 'web'
  };
}

export async function checkAppUpdates(): Promise<{ hasUpdate: boolean; latestVersion?: string; downloadUrl?: string }> {
  try {
    const res = await fetch('/api/app-version');
    if (!res.ok) return { hasUpdate: false };
    const data = await res.json();
    const env = detectAppEnvironment();
    
    if (env.appVersion && data.version && data.version !== env.appVersion) {
      return {
        hasUpdate: true,
        latestVersion: data.version,
        downloadUrl: env.platform === 'android' ? data.downloads?.android : data.downloads?.windows
      };
    }
    return { hasUpdate: false };
  } catch (e) {
    return { hasUpdate: false };
  }
}
