export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).end(JSON.stringify({ error: "POST only" }));

  try {
    const body = req.body ?? {};
    const text = body.text;
    if (!text || typeof text !== "string") {
      return res.status(400).end(JSON.stringify({ error: "Missing text" }));
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).end(JSON.stringify({ error: "Missing OPENAI_API_KEY" }));

    const proposalSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        eventName: { type: "string" },
        sport: { type: "string" },
        startDate: { type: ["string", "null"] },
        endDate: { type: ["string", "null"] },
        registrationLink: { type: ["string", "null"] },
        deadlines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string" },
              date: { type: ["string", "null"] },
              notes: { type: ["string", "null"] }
            },
            required: ["type", "date", "notes"]
          }
        },
        attachment: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            url: { type: "string" }
          },
          required: ["title", "url"]
        }
      },
      required: ["eventName","sport","startDate","endDate","registrationLink","deadlines","attachment"]
    };

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        proposals: {
          type: "array",
          items: proposalSchema
        }
      },
      required: ["proposals"]
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
  "Extract ALL events you can find in the user's text. Return ONLY JSON matching the schema. " +
  "If there is only one event, proposals must still be an array with 1 item. " +
  "deadlines must be an array (use []). " +
  "attachment must be an object with title and url (use empty strings). " +
  "registrationLink must be null if unknown. " +
  "Dates must be ISO-8601. If the text says 'today', 'tomorrow', or a weekday, convert it to an actual date in ISO-8601 using America/New_York. " +
  "If time is unknown, still output a date (YYYY-MM-DD) and set time to 12:00:00."

          },
          { role: "user", content: text }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "AIParseResult",
            strict: true,
            schema
          }
        }
      })
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(500).end(JSON.stringify({ error: "OpenAI failed", detail: data }));
    }

    const message = data.output?.find((o) => o.type === "message");
    const contentText = message?.content?.find((c) => c.type === "output_text")?.text;

    if (!contentText || typeof contentText !== "string") {
      return res.status(500).end(JSON.stringify({ error: "No output_text", detail: data }));
    }

    let cleaned = contentText.trim();
    cleaned = cleaned.replace(/^```json\s*/i, "");
    cleaned = cleaned.replace(/^```\s*/i, "");
    cleaned = cleaned.replace(/\s*```$/i, "");

    const result = JSON.parse(cleaned);
    return res.status(200).end(JSON.stringify(result));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ error: "Server error", detail: String(e) }));
  }
}
