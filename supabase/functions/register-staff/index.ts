const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

function reply(status: number, code: string) {
  return new Response(JSON.stringify({ code }), { status, headers });
}

function keyMap(variable: string): Record<string, string> {
  return JSON.parse(Deno.env.get(variable) ?? '{}') as Record<string, string>;
}

const endpoint = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
const secret = keyMap('SUPABASE_SECRET_KEYS').default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const clientKeys = new Set([
  ...Object.values(keyMap('SUPABASE_PUBLISHABLE_KEYS')),
  Deno.env.get('SUPABASE_ANON_KEY'),
].filter(Boolean));
const encoder = new TextEncoder();

async function digest(secret: string, text: string) {
  const bytes = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', bytes, encoder.encode(text));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return reply(405, 'method_not_allowed');
  if (!clientKeys.has(request.headers.get('apikey') ?? '')) return reply(401, 'invalid_api_key');
  if (!endpoint || !secret) return reply(503, 'registration_unavailable');

  try {
    if (Number(request.headers.get('content-length') ?? 0) > 4096) return reply(400, 'invalid_signup');
    const wholeBody = await request.text();
    if (wholeBody.length > 4096) return reply(400, 'invalid_signup');
    const data = JSON.parse(wholeBody) as Record<string, unknown> | null;
    const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    const password = typeof data?.password === 'string' ? data.password : '';
    const passwordBytes = encoder.encode(password).length;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120) {
      return reply(400, 'invalid_signup');
    }
    if (password.length < 8 || passwordBytes > 72) return reply(400, 'weak_password');

    const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 100) || 'unknown';
    const [emailHash, sourceHash] = await Promise.all([
      digest(secret, 'email:' + email), digest(secret, 'source:' + client),
    ]);
    const adminHeaders: Record<string, string> = { 'Content-Type': 'application/json', apikey: secret };
    if (secret.startsWith('eyJ')) adminHeaders.Authorization = 'Bearer ' + secret;
    const quota = await fetch(endpoint + '/rest/v1/rpc/reserve_staff_signup', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ p_email_hash: emailHash, p_source_hash: sourceHash }),
    });
    if (!quota.ok) return reply(503, 'registration_unavailable');
    if (await quota.json() !== true) return reply(429, 'over_request_rate_limit');

    // Auth creates credentials, and the database trigger creates a roleless pending profile.
    const result = await fetch(endpoint + '/auth/v1/admin/users', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({
        email, password, email_confirm: true,
        user_metadata: { full_name: name, kelvin_staff_request: true },
      }),
    });
    if (result.ok) return reply(201, 'created');
    const error = await result.json();
    const code = error.error_code ?? error.code;
    if (code === 'email_exists' || code === 'user_already_exists') return reply(409, 'user_already_exists');
    if (code === 'weak_password') return reply(400, 'weak_password');
    if (result.status === 429) return reply(429, 'over_request_rate_limit');
    return reply(503, 'registration_unavailable');
  } catch (error) {
    return error instanceof SyntaxError ? reply(400, 'invalid_signup') : reply(503, 'registration_unavailable');
  }
});
