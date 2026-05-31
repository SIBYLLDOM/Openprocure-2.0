import axios from "axios";
import { getShiprocketToken } from "./auth.js";

export const checkServiceability = async (
  pickupPincode,
  deliveryPincode,
  weight
) => {
  const token = await getShiprocketToken();

  try {
    const response = await axios.get(
      "https://apiv2.shiprocket.in/v1/external/courier/serviceability/",
      {
        params: {
          pickup_postcode: pickupPincode,
          delivery_postcode: deliveryPincode,
          weight: Number(weight),
          cod: 0,
          pickup_location: "Primary" // ⚠️ MUST match exact name in Shiprocket dashboard
        },
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ SHIPROCKET SERVICEABILITY SUCCESS");

    return response.data;

  } catch (error) {
    console.error(
      "❌ SHIPROCKET SERVICEABILITY ERROR:",
      error.response?.data || error.message
    );

    throw error;
  }
};
