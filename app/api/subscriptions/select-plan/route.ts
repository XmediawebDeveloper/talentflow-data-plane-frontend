import { NextRequest, NextResponse } from 'next/server';

const ADMIN_API_URL = process.env.SUBSCRIPTION_API_URL || 'https://talentflowapi.mo.vc/api/v1';

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

    const apiUrl = `${ADMIN_API_URL}/subscriptions/${tenant_id}/select-plan`;
    console.log('[Subscription API] Calling:', apiUrl);
    console.log('[Subscription API] Payload:', JSON.stringify(payload));

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenant_id,
        // Not sending Authorization header - admin API uses different JWT secret
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
        errorMessage = 'Request timeout - server at 192.168.1.110 is not responding';
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        errorMessage = 'Cannot connect to server at 192.168.1.110 - please check if the server is running';
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
