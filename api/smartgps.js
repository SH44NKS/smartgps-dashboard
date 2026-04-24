export default async function handler(req, res) {
  return res.status(200).json({
    status: 1,
    message: "Backend SmartGPS funcionando na Vercel"
  });
}
