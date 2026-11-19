import { NextRequest, NextResponse } from 'next/server';

// Route to the DP backend (has queue logic for paid plan upgrades)
const DP_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenant_id, ...payload } = body;

    if (!tenant_id) {
      return NextResponse.json(
        { detail: 'tenant_id is required' },
        { status: 400 }
      );
    }

    // Forward auth token so DP backend can authenticate via get_current_user
    // (The access token is no longer in a cookie - security sheet #5 - so the
    // caller's Authorization header is passed through.)
    const authHeader = request.headers.get('authorization') || '';

    const apiUrl = `${DP_API_URL}/subscription/${tenant_id}/select-plan`;
    console.log('[Subscription API] Calling DP backend:', apiUrl);
    console.log('[Subscription API] Payload:', JSON.stringify(payload));

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenant_id,
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(payload),
      // Add timeout
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json().catch(() => ({}));
    console.log('[Subscription API] Response status:', response.status);
    console.log('[Subscription API] Response data:', JSON.stringify(data));

    if (!response.ok) {
      return NextResponse.json(
        { detail: data.detail || `Request failed with status ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Subscription API] Error:', error);

    // Provide more specific error messages
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        errorMessage = 'Request timed out. Please try again.';
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        errorMessage = 'Cannot connect to server. Please try again or contact support.';
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      { detail: errorMessage },
      { status: 500 }
    );
  }
}
