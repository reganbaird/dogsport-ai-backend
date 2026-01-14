export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // HARD-CODED RESPONSE TO PROVE iOS DECODING WORKS
  return res.status(200).json({
    eventName: "Real Backend Test",
    sport: "Dock Diving",
    startDate: null,
    endDate: null,
    registrationLink: null,
    deadlines: [],
    attachment: { title: "", url: "" }
  });
}
