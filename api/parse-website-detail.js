// api/parse-website-detail.js

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { html, url } = req.body || {};

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
    }

    let pageHTML = html;

    // Optional: if html not provided but url is, fetch it
    if ((!pageHTML || typeof pageHTML !== "string" || pageHTML.trim() === "") && url && typeof url === "string") {
      const pageResp = await fetch(url, {
        headers: {
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

      pageHTML = await pageResp.text();
    }

    if (!pageHTML || typeof pageHTML !== "string") {
      return res.status(400).json({ error: "Missing 'html' (string) or 'url' (string) to fetch" });
    }

    // Cleanup + limit
    pageHTML = pageHTML
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const MAX_CHARS = 160_000;
    if (pageHTML.length > MAX_CHARS) pageHTML = pageHTML.slice(0, MAX_CHARS);

    const system = [
      "You extract detailed event information from an individual event webpage.",
      "Return ONLY valid JSON (no markdown, no commentary).",
      "",
      "Output JSON schema (must match exactly):",
      "{",
      '  "title": string|null,',
      '  "startDateISO": string|null,',
      '  "endDateISO": string|null,',
      '  "registrationURL": string|null,',
      '  "schedule": string|null,',
      '  "lodgingName": string|null,',
      '  "lodgingAddress": string|null,',
      '  "onsiteKenneling": string|null,',
      '  "packingList": string|null,',
      '  "notes": string|null',
      "}",
      "",
      "Rules:",
      "- Dates must be ISO-8601 if possible. If only date is known, use YYYY-MM-DD. If unknown, null.",
      "- registrationURL should be the official registration link if present (not necessarily the page url).",
      "- If a field is not present, use null."
    ].join("\n");

    const user = `EVENT PAGE URL:\n${url || ""}\n\nHTML:\n${pageHTML}`;

    const completionResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
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

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return res.status(500).json({
        error: "Failed to JSON.parse model output",
        bodySnippet: content.slice(0, 1200)
      });
    }

    return res.status(200).json({
      title: parsed.title ?? null,
      startDateISO: parsed.startDateISO ?? null,
      endDateISO: parsed.endDateISO ?? null,
      registrationURL: parsed.registrationURL ?? null,
      schedule: parsed.schedule ?? null,
      lodgingName: parsed.lodgingName ?? null,
      lodgingAddress: parsed.lodgingAddress ?? null,
      onsiteKenneling: parsed.onsiteKenneling ?? null,
      packingList: parsed.packingList ?? null,
      notes: parsed.notes ?? null
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server exception",
      message: err?.message || String(err)
    });
  }
}
