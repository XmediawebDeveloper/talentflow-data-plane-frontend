/**
 * Token recovery utility for cross-browser cookie issues
 * Ensures cookies are synchronized with localStorage before protected route access
 *
 * This solves the universal cookie blocking issue in:
 * - Firefox: Enhanced Tracking Protection blocks cookies
 * - Safari: Intelligent Tracking Prevention (ITP) restricts cookies
 * - iOS Safari: Unique cookie behavior in standalone/web view mode
 * - Arc/Brave: Built-in privacy shields block cookies
 * - Any browser with privacy extensions: uBlock Origin, Privacy Badger, etc.
 */

import Cookies from 'js-cookie';

export const ensureTokenCookies = (): boolean => {
  if (typeof window === 'undefined') return false;

  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');

  // Check if cookies exist
  const accessCookie = Cookies.get('accessToken');
  const refreshCookie = Cookies.get('refreshToken');

  // If localStorage has tokens but cookies don't, restore cookies
  if (accessToken && !accessCookie) {
    console.log('[TOKEN RECOVERY] Restoring accessToken cookie from localStorage');

    // Detect browser for optimal settings
    const ua = navigator.userAgent.toLowerCase();
    const isFirefox = ua.includes('firefox');
    const isSafari = ua.includes('safari') && !ua.includes('chrome');
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const browserName = isFirefox ? 'Firefox'
      : isSafari ? 'Safari'
      : isIOS ? 'iOS Safari'
      : ua.includes('arc') ? 'Arc'
      : ua.includes('brave') ? 'Brave'
      : 'Unknown';

    // Use lax sameSite for better browser compatibility
    const cookieOptions: Cookies.CookieAttributes = {
      path: '/',
      sameSite: 'lax',  // Better compatibility than 'strict'
      secure: window.location.protocol === 'https:',
    };

    Cookies.set('accessToken', accessToken, { ...cookieOptions, expires: 7 });

    if (refreshToken && !refreshCookie) {
      Cookies.set('refreshToken', refreshToken, { ...cookieOptions, expires: 30 });
    }

    // Verify recovery was successful
    const verifyAccess = Cookies.get('accessToken');
    if (verifyAccess) {
      console.log(`[TOKEN RECOVERY] Successfully recovered tokens for ${browserName}`);
    } else {
      console.warn(`[TOKEN RECOVERY] Failed to recover cookies in ${browserName} - browser may be blocking all cookies`);
    }

    return true; // Tokens were recovered (or attempted)
  }

  return false; // No recovery needed
};
