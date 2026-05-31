import axios from "axios";
import { getShiprocketToken } from "./auth.js";

/* =====================================================
   SCHEDULE PICKUP (REAL SHIPROCKET)
===================================================== */
export const schedulePickup = async (req, res) => {
  try {
    const token = await getShiprocketToken();
    const { shipment_ids, pickup_date } = req.body;

    if (!shipment_ids || shipment_ids.length === 0) {
      return res.status(400).json({ message: "Shipment IDs required" });
    }

    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/courier/generate/pickup",
      {
        shipment_id: shipment_ids,
        pickup_date // YYYY-MM-DD
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ PICKUP SCHEDULED:", response.data);

    return res.json(response.data);

  } catch (error) {
    console.error(
      "❌ PICKUP SCHEDULE ERROR:",
      error.response?.data || error.message
    );
    return res.status(500).json(
      error.response?.data || { message: "Pickup scheduling failed" }
    );
  }
};
