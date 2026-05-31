import axios from "axios";
import { getShiprocketToken } from "./auth.js";

/* =====================================================
   SCHEDULE PICKUP (REAL SHIPROCKET)
===================================================== */
export const schedulePickup = async (req, res) => {
  try {
    const token = await getShiprocketToken();

    const {
      awb,
      pickup_date,
      pickup_slot
    } = req.body;

    if (!awb || !pickup_date || !pickup_slot) {
      return res.status(400).json({
        message: "awb, pickup_date and pickup_slot are required"
      });
    }

    const payload = {
      awb,
      pickup_date,
      pickup_slot
    };

    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/courier/generate/pickup",
      payload,
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
      error.response?.data || {
        message: "Pickup scheduling failed"
      }
    );
  }
};
