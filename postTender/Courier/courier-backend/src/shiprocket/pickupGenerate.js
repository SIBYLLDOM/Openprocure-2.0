import axios from "axios";
import { getShiprocketToken } from "./auth.js";

/* =====================================================
   REQUEST SHIPMENT PICKUP (Generate Pickup)
===================================================== */
export const generatePickup = async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const { shipment_id, pickup_date } = req.body;

        if (!shipment_id) {
            return res.status(400).json({
                message: "shipment_id is required"
            });
        }

        const payload = {
            shipment_id: Array.isArray(shipment_id) ? shipment_id : [shipment_id]
        };

        // Add pickup_date if provided (optional, for future scheduling)
        if (pickup_date) {
            payload.pickup_date = Array.isArray(pickup_date) ? pickup_date : [pickup_date];
        }

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

        console.log("✅ PICKUP REQUESTED:", response.data);
        return res.json(response.data);

    } catch (error) {
        console.error(
            "❌ PICKUP GENERATION ERROR:",
            error.response?.data || error.message
        );

        return res.status(500).json(
            error.response?.data || { message: "Pickup request failed" }
        );
    }
};
