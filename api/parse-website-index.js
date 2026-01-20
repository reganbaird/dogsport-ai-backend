
const OpenAI = require("openai");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const body = req.body || {};
    const url = String(body.url || body.urlString || "").trim();

    if (!url) {
      return res.status(400).json({ error: "Missing url" });
    }

    // Fetch the listing page HTML
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DogSportScheduler/1.0)"
      }
    });
    const html = await r.text();
    const trimmed = html.slice(0, 200000);

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
You extract a list of events from an event listing page.
Return ONLY valid JSON.
Do not invent events not shown on the page.
Prefer absolute URLs. If the page provides relative links, convert them to absolute using the page URL as the base.
Dates should be ISO YYYY-MM-DD when possible, otherwise null.
`;

    const user = `
LISTING PAGE URL: ${url}

HTML:
${trimmed}

Return JSON exactly:
{
  "events": [
    {
      "title": string,
      "eventURL": string,
      "startDateISO": string|null,
      "endDateISO": string|null
    }
  ]
}

Notes:
- "eventURL" should be the individual event page URL for each event.
- If multiple dates are shown, pick the actual event date range.
- If there are no dates, set them null.
- Do not include extra keys.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" }
    });

    const outText = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(outText);

    if (!parsed || !Array.isArray(parsed.events)) {
      return res.status(200).json({ events: [] });
    }

    // Small cleanup: remove obviously empty entries
    const cleaned = parsed.events
      .filter(e => e && typeof e.title === "string" && typeof e.eventURL === "string")
      .map(e => ({
        title: String(e.title).trim(),
        eventURL: String(e.eventURL).trim(),
        startDateISO: e.startDateISO ? String(e.startDateISO).trim() : null,
        endDateISO: e.endDateISO ? String(e.endDateISO).trim() : null
      }))
      .filter(e => e.title.length > 0 && e.eventURL.length > 0);

    return res.status(200).json({ events: cleaned });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      detail: err?.message || String(err)
    });
  }
};
