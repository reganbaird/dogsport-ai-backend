const OpenAI = require("openai");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const body = req.body || {};
    const pageUrl = String(body.urlString || body.url || "").trim();

    if (!pageUrl) {
      return res.status(400).json({ error: "Missing urlString" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Fetch HTML (backend fetch; app passes empty string)
    let pageHTML = String(body.html || "").trim();
    if (!pageHTML) {
      const r = await fetch(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DogSportScheduler/1.0)"
        }
      });
      pageHTML = await r.text();
    }

    // Trim to avoid huge payloads
    const trimmed = pageHTML.slice(0, 200000);

    const system = `
You extract dog sport event details from messy web pages.
Return ONLY valid JSON.
If a field is not present, use null.
Dates must be ISO "YYYY-MM-DD" when possible.
`;

    const user = `
URL: ${pageUrl}

HTML:
${trimmed}

Extract and return JSON:
{
  "title": string|null,
  "startDateISO": string|null,
  "endDateISO": string|null,
  "registrationURL": string|null,

  "venue": string|null,
  "address": string|null,
  "city": string|null,
  "state": string|null,

  "schedule": string|null,
  "lodgingName": string|null,
  "lodgingAddress": string|null,
  "onsiteKenneling": string|null,
  "packingList": string|null,
  "notes": string|null
}
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

    const text = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      detail: err?.message || String(err)
    });
  }
};
