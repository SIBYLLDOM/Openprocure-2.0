import express from "express";
import { checkServiceability } from "../shiprocket/serviceability.js";

const router = express.Router();

router.get("/serviceability", async (req, res) => {
  const { pickup_pincode, delivery_pincode, weight } = req.query;

  if (!pickup_pincode || !delivery_pincode || !weight) {
    return res.status(400).json({
      error: "pickup_pincode, delivery_pincode and weight are required"
    });
  }

  try {
    const data = await checkServiceability(
      pickup_pincode,
      delivery_pincode,
      weight
    );

    console.log("🔥 SENDING REAL SHIPROCKET DATA TO FRONTEND");
    res.json(data);

  } catch (error) {
    console.error("❌ SERVICEABILITY ERROR:", error.response?.data || error.message);
    res.status(500).json({
      error: "Shiprocket serviceability failed",
      details: error.response?.data || error.message
    });
  }
});

export default router;
