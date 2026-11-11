/**
 * Browser Compatibility Utilities
 * Handles cross-browser differences for Assessment feature
 */

// ============================================
// BROWSER DETECTION
// ============================================

export interface BrowserInfo {
  name: 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'iOS Safari' | 'Arc' | 'Brave' | 'Unknown';
  isIOS: boolean;
  isMobile: boolean;
  isPrivateMode: boolean | null; // null if detection not complete
  supportsMediaDevices: boolean;
  supportsFullscreen: boolean;
}

export function detectBrowser(): BrowserInfo {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return {
      name: 'Unknown',
      isIOS: false,
      isMobile: false,
      isPrivateMode: null,
      supportsMediaDevices: false,
      supportsFullscreen: false
    };
  }

  const ua = navigator.userAgent.toLowerCase();

  const isFirefox = ua.includes('firefox');
  const isSafari = ua.includes('safari') && !ua.includes('chrome');
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isMobile = isIOS || /android|mobile/.test(ua);
  const isIOSSafari = isIOS && isSafari;
  const isArc = ua.includes('arc');
  const isBrave = ua.includes('brave');
  const isEdge = ua.includes('edg');
  const isChrome = ua.includes('chrome') && !ua.includes('edg') && !isArc;

  let browserName: BrowserInfo['name'] = 'Unknown';
  if (isFirefox) browserName = 'Firefox';
  else if (isIOSSafari) browserName = 'iOS Safari';
  else if (isSafari) browserName = 'Safari';
  else if (isArc) browserName = 'Arc';
  else if (isBrave) browserName = 'Brave';
  else if (isEdge) browserName = 'Edge';
  else if (isChrome) browserName = 'Chrome';

  return {
    name: browserName,
    isIOS,
    isMobile,
    isPrivateMode: null, // Will be detected async
    supportsMediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    supportsFullscreen: !!(
      document.fullscreenEnabled ||
      (document as any).webkitFullscreenEnabled ||
      (document as any).mozFullScreenEnabled ||
      (document as any).msFullscreenEnabled
    )
  };
}

// ============================================
// PRIVATE MODE DETECTION
// ============================================

export async function detectPrivateMode(): Promise<boolean> {
  // Test for Safari private mode
  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
    return false;
  } catch (e) {
    // Safari private mode throws on localStorage access
    return true;
  }
}

// ============================================
// SAFE STORAGE (LocalStorage/SessionStorage)
// ============================================

/**
 * Safe storage wrapper that works in private browsing mode
 * Falls back to in-memory storage if localStorage is unavailable
 */
class SafeStorage {
  private memory: Map<string, string> = new Map();
  private useLocalStorage: boolean = true;

  constructor(private storageType: 'local' | 'session') {
    // Test if storage is available
    try {
      const storage = storageType === 'local' ? localStorage : sessionStorage;
      const test = '__storage_test__';
      storage.setItem(test, test);
      storage.removeItem(test);
      this.useLocalStorage = true;
    } catch (e) {
      console.warn(`[STORAGE] ${storageType}Storage not available, using in-memory fallback`);
      this.useLocalStorage = false;
    }
  }

  setItem(key: string, value: string): void {
    if (this.useLocalStorage) {
      try {
        const storage = this.storageType === 'local' ? localStorage : sessionStorage;
        storage.setItem(key, value);
      } catch (e) {
        console.warn(`[STORAGE] Failed to set ${key}, falling back to memory`);
        this.memory.set(key, value);
      }
    } else {
      this.memory.set(key, value);
    }
  }

  getItem(key: string): string | null {
    if (this.useLocalStorage) {
      try {
        const storage = this.storageType === 'local' ? localStorage : sessionStorage;
        return storage.getItem(key) || this.memory.get(key) || null;
      } catch (e) {
        return this.memory.get(key) || null;
      }
    }
    return this.memory.get(key) || null;
  }

  removeItem(key: string): void {
    if (this.useLocalStorage) {
      try {
        const storage = this.storageType === 'local' ? localStorage : sessionStorage;
        storage.removeItem(key);
      } catch (e) {
        console.warn(`[STORAGE] Failed to remove ${key}`);
      }
    }
    this.memory.delete(key);
  }

  clear(): void {
    if (this.useLocalStorage) {
      try {
        const storage = this.storageType === 'local' ? localStorage : sessionStorage;
        storage.clear();
      } catch (e) {
        console.warn('[STORAGE] Failed to clear storage');
      }
    }
    this.memory.clear();
  }
}

export const safeLocalStorage = new SafeStorage('local');
export const safeSessionStorage = new SafeStorage('session');

// ============================================
// MEDIA DEVICES API
// ============================================

/**
 * Cross-browser getUserMedia with better error handling
 */
export async function getUserMedia(
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  // Check if API is available
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('MEDIA_API_NOT_SUPPORTED');
  }

  // Enhance constraints for better cross-browser support
  const enhancedConstraints: MediaStreamConstraints = {
    video: constraints.video ? {
      ...(typeof constraints.video === 'object' ? constraints.video : {}),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 }
    } : false,
    audio: constraints.audio ? {
      ...(typeof constraints.audio === 'object' ? constraints.audio : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    } : false
  };

  try {
    return await navigator.mediaDevices.getUserMedia(enhancedConstraints);
  } catch (error: any) {
    // Enhanced error handling for different browsers
    const errorName = error.name || '';
    const errorMessage = error.message || '';

    console.error('[MEDIA] getUserMedia error:', {
      name: errorName,
      message: errorMessage,
      browser: detectBrowser().name
    });

    // Map browser-specific errors to standard error codes
    if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
      throw new Error('PERMISSION_DENIED');
    } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      throw new Error('DEVICE_NOT_FOUND');
    } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError' || errorName === 'AbortError') {
      throw new Error('DEVICE_IN_USE');
    } else if (errorName === 'OverconstrainedError') {
      // Try again with minimal constraints
      console.log('[MEDIA] Retrying with minimal constraints');
      return await navigator.mediaDevices.getUserMedia({
        video: !!constraints.video,
        audio: !!constraints.audio
      });
    } else if (errorName === 'SecurityError') {
      throw new Error('SECURITY_ERROR_HTTPS_REQUIRED');
    } else {
      throw new Error('MEDIA_DEVICE_ERROR');
    }
  }
}

// ============================================
// FULLSCREEN API
// ============================================

/**
 * Request fullscreen with cross-browser support
 */
export async function requestFullscreen(element: HTMLElement = document.documentElement): Promise<void> {
  // No "recent click" pre-check here: right after the screen-share picker the
  // browser may report no click yet still grant fullscreen, so always ask and
  // let callers handle a refusal (the next click enters fullscreen).
  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen();
    } else if ((element as any).webkitRequestFullscreen) {
      // Safari
      await (element as any).webkitRequestFullscreen();
    } else if ((element as any).mozRequestFullScreen) {
      // Firefox (note the capital S)
      await (element as any).mozRequestFullScreen();
    } else if ((element as any).msRequestFullscreen) {
      // IE/Edge
      await (element as any).msRequestFullscreen();
    } else {
      throw new Error('FULLSCREEN_NOT_SUPPORTED');
    }
  } catch (error) {
    // "TypeError: not granted" / "Permissions check failed" = the browser wants
    // a fresh click first (e.g. right after the screen-share picker). Callers
    // already fall back to the next click, so this is expected, not an error.
    const msg = String((error as any)?.message || '');
    if ((error as any)?.name === 'TypeError' && /not granted|permission/i.test(msg)) {
      console.info('[FULLSCREEN] Browser needs a click first — fullscreen will be entered on the next click');
    } else {
      console.error('[FULLSCREEN] Request failed:', error);
    }
    throw error;
  }
}

/**
 * Exit fullscreen with cross-browser support
 */
export async function exitFullscreen(): Promise<void> {
  // Nothing to exit (already left, or the page is being torn down at the
  // interview end): calling it anyway throws "Document not active", and the
  // callers fire-and-forget, so that surfaced as an uncaught exception.
  if (!isFullscreen()) return;
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      // Safari
      await (document as any).webkitExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      // Firefox
      await (document as any).mozCancelFullScreen();
    } else if ((document as any).msExitFullscreen) {
      // IE/Edge
      await (document as any).msExitFullscreen();
    }
  } catch (error) {
    // Leaving fullscreen is best-effort (the browser also exits on page
    // teardown); never let it reject into a fire-and-forget caller.
    console.warn('[FULLSCREEN] Exit failed:', error);
  }
}

/**
 * Check if currently in fullscreen
 */
export function isFullscreen(): boolean {
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
}

/**
 * Get fullscreen change event name for current browser
 */
export function getFullscreenChangeEvent(): string {
  if ('onfullscreenchange' in document) return 'fullscreenchange';
  if ('onwebkitfullscreenchange' in document) return 'webkitfullscreenchange';
  if ('onmozfullscreenchange' in document) return 'mozfullscreenchange';
  if ('onmsfullscreenchange' in document) return 'MSFullscreenChange';
  return 'fullscreenchange';
}

type KeyboardLockCapableNavigator = Navigator & {
  keyboard?: {
    lock?: (keyCodes?: string[]) => Promise<void>;
    unlock?: () => void;
  };
};

/**
 * Best-effort lock for reserved browser shortcuts while in fullscreen.
 * Chrome/Edge support Keyboard Lock for keys like F11; unsupported browsers
 * simply no-op and continue using normal key prevention.
 */
export async function lockKeyboardShortcuts(keyCodes: string[] = ['F11']): Promise<boolean> {
  try {
    const capableNavigator = navigator as KeyboardLockCapableNavigator;
    if (!capableNavigator.keyboard?.lock) {
      return false;
    }
    await capableNavigator.keyboard.lock(keyCodes);
    return true;
  } catch (error) {
    console.warn('[KEYBOARD LOCK] Failed to lock shortcuts:', error);
    return false;
  }
}

export function unlockKeyboardShortcuts(): void {
  try {
    const capableNavigator = navigator as KeyboardLockCapableNavigator;
    capableNavigator.keyboard?.unlock?.();
  } catch (error) {
    console.warn('[KEYBOARD LOCK] Failed to unlock shortcuts:', error);
  }
}

// ============================================
// VIDEO AUTOPLAY
// ============================================

/**
 * Attempt to play video with fallback for autoplay restrictions
 */
export async function playVideo(videoElement: HTMLVideoElement): Promise<boolean> {
  try {
    await videoElement.play();
    return true;
  } catch (error: any) {
    console.warn('[VIDEO] Autoplay failed:', error.name);

    // Autoplay blocked - mute and try again
    if (error.name === 'NotAllowedError' || error.name === 'NotSupportedError') {
      console.log('[VIDEO] Retrying with muted video');
      videoElement.muted = true;
      try {
        await videoElement.play();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

// ============================================
// BROWSER-SPECIFIC ERROR MESSAGES
// ============================================

export function getErrorMessage(errorCode: string, browser: BrowserInfo['name']): string {
  const messages: Record<string, Record<string, string>> = {
    PERMISSION_DENIED: {
      Firefox: 'Camera/microphone permission denied. Click the camera icon in the address bar to grant access.',
      Safari: 'Camera/microphone permission denied. Go to Safari → Preferences → Websites → Camera to grant access.',
      'iOS Safari': 'Camera/microphone permission denied. Go to Settings → Privacy → Camera/Microphone to grant access.',
      Chrome: 'Camera/microphone permission denied. Click the camera icon in the address bar to grant access.',
      Edge: 'Camera/microphone permission denied. Click the camera icon in the address bar to grant access.',
      Arc: 'Camera/microphone permission denied. Click the camera icon in the address bar to grant access.',
      Brave: 'Camera/microphone permission denied. Click the shield icon in the address bar to grant access.',
      Unknown: 'Camera/microphone permission denied. Please check your browser settings.'
    },
    DEVICE_IN_USE: {
      Firefox: 'Camera is being used by another application or tab. Please close Zoom, Teams, Skype, or other tabs using your camera, then try again.',
      Safari: 'Camera is being used by another application or tab. Please close FaceTime, Zoom, or other apps using your camera, then try again.',
      'iOS Safari': 'Camera is being used by another app. Please close all apps using your camera (FaceTime, Zoom, Instagram, etc.), then try again.',
      Chrome: 'Camera is being used by another tab or application. Please close other tabs or apps (Zoom, Teams, Google Meet) using your camera, then try again.',
      Edge: 'Camera is being used by another tab or application. Please close other tabs or apps using your camera, then try again.',
      Arc: 'Camera is being used by another tab or application. Please close other tabs or apps using your camera, then try again.',
      Brave: 'Camera is being used by another tab or application. Please close other tabs or apps using your camera, then try again.',
      Unknown: 'Camera is being used by another application. Please close other apps or tabs using your camera, then try again.'
    },
    DEVICE_NOT_FOUND: {
      Firefox: 'No camera or microphone found. Please connect a camera/microphone and try again.',
      Safari: 'No camera or microphone found. Please connect a camera/microphone and try again.',
      'iOS Safari': 'No camera or microphone found. Please check if your device has a working camera and microphone.',
      Chrome: 'No camera or microphone found. Please connect a camera/microphone and try again.',
      Edge: 'No camera or microphone found. Please connect a camera/microphone and try again.',
      Arc: 'No camera or microphone found. Please connect a camera/microphone and try again.',
      Brave: 'No camera or microphone found. Please connect a camera/microphone and try again.',
      Unknown: 'No camera or microphone found. Please connect a camera/microphone and try again.'
    },
    SECURITY_ERROR_HTTPS_REQUIRED: {
      Firefox: 'Security error: This site must be accessed via HTTPS to use camera/microphone.',
      Safari: 'Security error: This site must be accessed via HTTPS to use camera/microphone.',
      'iOS Safari': 'Security error: This site must be accessed via HTTPS to use camera/microphone.',
      Chrome: 'Security error: This site must be accessed via HTTPS to use camera/microphone.',
      Edge: 'Security error: This site must be accessed via HTTPS to use camera/microphone.',
      Arc: 'Security error: This site must be accessed via HTTPS to use camera/microphone.',
      Brave: 'Security error: This site must be accessed via HTTPS to use camera/microphone.',
      Unknown: 'Security error: This site must be accessed via HTTPS to use camera/microphone.'
    },
    MEDIA_API_NOT_SUPPORTED: {
      Firefox: 'Your browser version does not support camera/microphone access. Please update Firefox to the latest version.',
      Safari: 'Your browser version does not support camera/microphone access. Please update Safari to the latest version.',
      'iOS Safari': 'Your iOS version does not support camera/microphone access. Please update to iOS 11 or later.',
      Chrome: 'Your browser version does not support camera/microphone access. Please update Chrome to the latest version.',
      Edge: 'Your browser version does not support camera/microphone access. Please update Edge to the latest version.',
      Arc: 'Your browser version does not support camera/microphone access. Please update Arc to the latest version.',
      Brave: 'Your browser version does not support camera/microphone access. Please update Brave to the latest version.',
      Unknown: 'Your browser does not support camera/microphone access. Please use Chrome, Firefox, Edge, or Safari.'
    }
  };

  return messages[errorCode]?.[browser] || messages[errorCode]?.['Unknown'] || 'An error occurred. Please try again.';
}

// ============================================
// BROWSER COMPATIBILITY CHECK
// ============================================

export interface CompatibilityReport {
  isCompatible: boolean;
  issues: string[];
  warnings: string[];
}

const SUPPORTED_ASSESSMENT_BROWSERS = new Set<BrowserInfo['name']>([
  'Chrome',
  'Edge',
  'Firefox',
  'Safari',
  'iOS Safari',
  'Arc',
  'Brave',
]);

export function shouldUseAdaptiveAssessmentMode(browser: BrowserInfo = detectBrowser()): boolean {
  return browser.isIOS || browser.isMobile || !browser.supportsFullscreen;
}

export function checkBrowserCompatibility(): CompatibilityReport {
  const browser = detectBrowser();
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!SUPPORTED_ASSESSMENT_BROWSERS.has(browser.name)) {
    issues.push('Unsupported browser. Please use Chrome, Edge, Firefox, Safari, Arc, or Brave.');
  }

  // Check MediaDevices API
  if (!browser.supportsMediaDevices) {
    issues.push('Camera/microphone access not supported. Please use a modern browser.');
  }

  // Check HTTPS (required for getUserMedia in most browsers)
  if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    issues.push('This site must be accessed via HTTPS to use camera/microphone.');
  }

  // Browser-specific warnings
  if (shouldUseAdaptiveAssessmentMode(browser)) {
    warnings.push('Adaptive assessment mode will be used on this browser/device so the test can run reliably without depending on fullscreen support.');
  }

  return {
    isCompatible: issues.length === 0,
    issues,
    warnings
  };
}
