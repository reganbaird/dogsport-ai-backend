import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const { url, urlString, html } = req.body || {};
    const pageUrl = (urlString || url || "").trim();

    if (!pageUrl) {
      return res.status(400).json({ error: "Missing url (urlString)" });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Fetch the page HTML if not provided
    let pageHTML = (html || "").trim();
    if (!pageHTML) {
      const r = await fetch(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DogSportScheduler/1.0)"
        }
      });
      pageHTML = await r.text();
    }

    // Trim HTML to keep token size sane
    const trimmed = pageHTML.slice(0, 200_000);

    const system = `
You extract dog sport event details from messy web pages.
Return ONLY valid JSON that matches the schema exactly.
If a field is not present, use null (not empty string).
For dates: output ISO "YYYY-MM-DD" when possible.
`;

    const user = `
URL: ${pageUrl}

HTML:
${trimmed}

Extract:
- title
- startDateISO (YYYY-MM-DD or null)
- endDateISO (YYYY-MM-DD or null)
- registrationURL (a real URL if present)
- venue (place name / facility name)
- address (street address if present)
- city
- state (2-letter if US; otherwise region)
- schedule (short, important schedule text)
- lodgingName
- lodgingAddress
- onsiteKenneling
- packingList
- notes

Return JSON schema:
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

    const completion = await openai.chat.completions.create({
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
}
