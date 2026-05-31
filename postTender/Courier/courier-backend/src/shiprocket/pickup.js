import axios from "axios";
import { getShiprocketToken } from "./auth.js";

/* =====================================================
   GET PICKUP LOCATIONS (REAL SHIPROCKET)
===================================================== */
export const getPickupLocations = async (req, res) => {
    try {
        const token = await getShiprocketToken();

        const response = await axios.get(
            "https://apiv2.shiprocket.in/v1/external/settings/company/pickup",
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        // ShipRocket returns locations in data.shipping_address
        const locations = response.data?.data?.shipping_address || [];

        console.log(`✅ Fetched ${locations.length} pickup locations from ShipRocket`);

        return res.json(locations);

    } catch (error) {
        console.error(
            "❌ PICKUP LOCATION ERROR:",
            error.response?.data || error.message
        );

        return res.status(500).json({
            message: "Failed to fetch pickup locations from Shiprocket"
        });
    }
};

/* =====================================================
   SCHEDULE PICKUP (REAL SHIPROCKET) - BACKUP/ALTERNATIVE
===================================================== */
export const schedulePickup = async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const { shipment_id, pickup_date, pickup_time } = req.body;

        if (!shipment_id || !pickup_date || !pickup_time) {
            return res.status(400).json({
                message: "shipment_id, pickup_date and pickup_time are required"
            });
        }

        const response = await axios.post(
            "https://apiv2.shiprocket.in/v1/external/pickups/create",
            {
                shipment_id: Array.isArray(shipment_id)
                    ? shipment_id
                    : [shipment_id],
                pickup_date,
                pickup_time
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
