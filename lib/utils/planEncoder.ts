/**
 * Utility functions to encode and decode plan IDs in URLs
 * Uses base64 encoding for simple obfuscation
 */

// Polyfill for btoa (base64 encode) - works in both browser and Node.js
function base64Encode(str: string): string {
  if (typeof btoa !== 'undefined') {
    return btoa(str);
  }
  // Node.js environment
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  // Fallback - should never reach here
  return str;
}

// Polyfill for atob (base64 decode) - works in both browser and Node.js
function base64Decode(str: string): string {
  if (typeof atob !== 'undefined') {
    return atob(str);
  }
  // Node.js environment
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64').toString('utf-8');
  }
  // Fallback - should never reach here
  return str;
}

export function encodePlanId(planId: string | number): string {
  if (!planId) return '';

  try {
    const planIdStr = String(planId);
    // Add a salt and timestamp for additional obfuscation
    const timestamp = Date.now().toString(36);
    const data = `${planIdStr}:${timestamp}`;

    // Base64 encode using polyfill
    return base64Encode(data);
  } catch (error) {
    console.error('Error encoding plan ID:', error);
    return String(planId);
  }
}

export function decodePlanId(encoded: string): string | null {
  if (!encoded) return null;

  try {
    // Base64 decode using polyfill
    const decoded = base64Decode(encoded);

    // Extract plan ID (before the colon)
    const [planId] = decoded.split(':');
    return planId;
  } catch (error) {
    console.error('Error decoding plan ID:', error);
    // Try to return as-is in case it's not encoded
    return encoded;
  }
}

/**
 * Generic encode for any param (tenant_id, etc.)
 * Same base64 + timestamp salt approach as encodePlanId.
 */
export function encodeParam(value: string | number): string {
  if (!value) return '';
  try {
    const salt = Date.now().toString(36);
    return base64Encode(`${value}:${salt}`);
  } catch {
    return String(value);
  }
}

/**
 * Generic decode — inverse of encodeParam.
 * Falls back to returning the raw string if not base64-encoded.
 */
export function decodeParam(encoded: string): string | null {
  if (!encoded) return null;
  try {
    const decoded = base64Decode(encoded);
    const [value] = decoded.split(':');
    return value;
  } catch {
    return encoded;
  }
}
