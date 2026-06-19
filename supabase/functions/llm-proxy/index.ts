import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Rate limit: max calls per user per day
const DAILY_LIMIT = 200;

// In-memory rate limit store (resets on cold start, good enough for launch)
const usage: Map<string, { count: number; resetAt: number }> = new Map();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = usage.get(userId);

  if (!entry || now > entry.resetAt) {
    // New day window (24h from first call)
    usage.set(userId, { count: 1, resetAt: now + 86_400_000 });
    return true;
  }

  if (entry.count >= DAILY_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  // ── Auth: verify the user's Supabase JWT ──────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing authorization header" }),
      { status: 401 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token. Run: argus login" }),
      { status: 401 },
    );
  }

  // ── Rate limit ────────────────────────────────────────────────────────
  if (!checkRateLimit(user.id)) {
    return new Response(
      JSON.stringify({
        error: `Daily limit reached (${DAILY_LIMIT} calls/day). Set your own OPENAI_API_KEY to remove limits.`,
      }),
      { status: 429 },
    );
  }

  // ── Forward to OpenAI ─────────────────────────────────────────────────
  let body: {
    model: string;
    messages: unknown[];
    max_tokens?: number;
    temperature?: number;
    response_format?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400 },
    );
  }

  // Only allow chat completions — don't proxy arbitrary OpenAI endpoints
  const openaiPayload = {
    model: body.model ?? "gpt-4o",
    messages: body.messages,
    max_tokens: body.max_tokens ?? 2000,
    temperature: body.temperature ?? 0.3,
    ...(body.response_format ? { response_format: body.response_format } : {}),
  };

  try {
    const openaiResp = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(openaiPayload),
      },
    );

    const openaiData = await openaiResp.json();

    if (!openaiResp.ok) {
      return new Response(
        JSON.stringify({ error: openaiData.error?.message ?? "OpenAI error" }),
        { status: openaiResp.status },
      );
    }

    return new Response(JSON.stringify(openaiData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Proxy error: ${(err as Error).message}` }),
      { status: 502 },
    );
  }
});
