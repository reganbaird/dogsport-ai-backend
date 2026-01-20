// api/parse-website-index.js

export default async function handler(req, res) {
  // --- CORS (so your iOS app can call it) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing 'url' (string)" });
    }

    // 1) Fetch the page HTML
    const pageResp = await fetch(url, {
      headers: {
        // Some sites behave better with a user-agent
        "User-Agent":
          "Mozilla/5.0 (compatible; DogSportSchedulerBot/1.0; +https://dogsport-ai-backend.vercel.app)"
      }
    });

    if (!pageResp.ok) {
      const text = await pageResp.text().catch(() => "");
      return res.status(400).json({
        error: `Failed to fetch url (${pageResp.status})`,
        bodySnippet: text.slice(0, 800)
      });
    }

    let html = await pageResp.text();

    // 2) Light cleanup + limit size (important for token cost)
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const MAX_CHARS = 140_000;
    if (html.length > MAX_CHARS) html = html.slice(0, MAX_CHARS);

    // 3) Ask OpenAI to extract "index list" of events and their best links
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
    }

    const system = [
      "You are extracting dog-sport event listings from an events website page.",
      "Return ONLY valid JSON (no markdown, no commentary).",
      "",
      "Goal:",
      "- Find as many event listings as possible on the page.",
      "- For each listing, produce a title and the best individual event page URL.",
      "",
      "Output JSON schema (must match exactly):",
      "{",
      '  "events": [',
      "    {",
      '      "title": string,',
      '      "eventURL": string,',
      '      "startDateISO": string|null,',
      '      "endDateISO": string|null,',
      '      "city": string|null,',
      '      "state": string|null,',
      '      "venue": string|null',
      "    }",
      "  ]",
      "}",
      "",
      "Rules:",
      "- eventURL must be an absolute URL if possible. If the page uses relative links, convert them using the page URL.",
      "- Dates must be ISO-8601 if present. If only a date is known, use YYYY-MM-DD. If unknown, null.",
      "- If city/state/venue are not present, use null.",
      "- Deduplicate obvious duplicates."
    ].join("\n");

    const user = `PAGE URL:\n${url}\n\nHTML:\n${html}`;

    const completionResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        // Use a sensible default; match your existing backend model later if you want
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!completionResp.ok) {
      const t = await completionResp.text().catch(() => "");
      return res.status(500).json({
        error: `OpenAI error (${completionResp.status})`,
        bodySnippet: t.slice(0, 1000)
      });
    }

    const data = await completionResp.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return res.status(500).json({ error: "No content returned from OpenAI" });
    }

    // 4) Parse JSON safely
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return res.status(500).json({
        error: "Failed to JSON.parse model output",
        bodySnippet: content.slice(0, 1200)
      });
    }

    // Minimal validation / normalization
    if (!parsed || !Array.isArray(parsed.events)) {
      return res.status(500).json({
        error: "Model output did not match schema (missing events array)",
        bodySnippet: content.slice(0, 1200)
      });
    }

    // Ensure strings/nulls
    const events = parsed.events
      .filter((ev) => ev && typeof ev.title === "string" && typeof ev.eventURL === "string")
      .map((ev) => ({
        title: ev.title,
        eventURL: ev.eventURL,
        startDateISO: ev.startDateISO ?? null,
        endDateISO: ev.endDateISO ?? null,
        city: ev.city ?? null,
        state: ev.state ?? null,
        venue: ev.venue ?? null
      }));

    return res.status(200).json({ events });
  } catch (err) {
    return res.status(500).json({
      error: "Server exception",
      message: err?.message || String(err)
    });
  }
}
