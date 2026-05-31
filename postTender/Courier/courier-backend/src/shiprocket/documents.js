import axios from "axios";
import { getShiprocketToken } from "./auth.js";

export const generateManifest = async (req, res) => {
  try {
    const token = await getShiprocketToken();
    const { shipment_ids } = req.body;

    if (!shipment_ids || !shipment_ids.length) {
      return res.status(400).json({ message: "shipment_ids required" });
    }

    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/manifests/generate",
      { shipment_ids },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.json(response.data);
  } catch (error) {
    console.error("❌ MANIFEST ERROR:", error.response?.data || error.message);
    return res.status(500).json(error.response?.data);
  }
};
