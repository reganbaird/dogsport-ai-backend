
const OpenAI = require("openai");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const body = req.body || {};
    const text = String(body.text || "").trim();

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
You parse dog-sport event information from free-form text (including pasted web snippets or CSV-like content).
Return ONLY valid JSON.
When information is missing, use null or empty arrays (never invent).
Dates should be ISO YYYY-MM-DD when possible.
`;

    const user = `
Parse this text into event proposals.

TEXT:
${text}

Return JSON exactly in this shape:
{
  "events": [
    {
      "title": string,
      "sportRaw": string|null,
      "startDateISO": string|null,
      "endDateISO": string|null,
      "registrationURL": string|null,
      "notes": string|null
    }
  ]
}

Rules:
- "sportRaw" should be one of: "Dock Diving", "FastCAT", "Frisbee", "Barn Hunt", "Shed Hunt", "Scent Work", "5K", "Other" (or null if unclear)
- If you see a URL, put it in registrationURL
- If you see multiple events, return multiple entries
- Do not include extra keys
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

    // Basic shape guard so the app gets something predictable
    if (!parsed || !Array.isArray(parsed.events)) {
      return res.status(200).json({ events: [] });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      detail: err?.message || String(err)
    });
  }
};
