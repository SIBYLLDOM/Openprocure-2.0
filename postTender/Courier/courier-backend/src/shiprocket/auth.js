import axios from "axios";

/**
 * Cache token to avoid repeated logins
 */
let cachedToken = null;
let tokenExpiry = null;

export const getShiprocketToken = async () => {
  // ✅ Return cached token if valid
  if (cachedToken && tokenExpiry && tokenExpiry > Date.now()) {
    return cachedToken;
  }

  // 🔴 HARD CHECK — prevents silent failure
  if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) {
    console.error("❌ SHIPROCKET ENV NOT LOADED");
    console.error("EMAIL:", process.env.SHIPROCKET_EMAIL);
    console.error(
      "PASSWORD:",
      process.env.SHIPROCKET_PASSWORD ? "SET" : "NOT SET"
    );
    throw new Error("SHIPROCKET_CREDENTIALS_MISSING");
  }

  try {
    console.log(`🔐 REQUESTING NEW SHIPROCKET TOKEN FOR: ${process.env.SHIPROCKET_EMAIL}`);

    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/auth/login",
      {
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.data || !response.data.token) {
      console.error("❌ TOKEN NOT FOUND IN RESPONSE", response.data);
      throw new Error("SHIPROCKET_AUTH_FAILED");
    }

    cachedToken = response.data.token;

    // Shiprocket tokens usually valid ~24h
    tokenExpiry = Date.now() + 24 * 60 * 60 * 1000;

    console.log("✅ SHIPROCKET TOKEN GENERATED SUCCESSFULLY");

    return cachedToken;

  } catch (error) {
    console.error(
      "❌ SHIPROCKET AUTH ERROR DETAILS:",
      error.response?.data || error.message
    );
    throw new Error("SHIPROCKET_AUTH_FAILED");
  }
};
