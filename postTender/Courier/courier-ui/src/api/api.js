import axios from "axios";

const api = axios.create({
  baseURL: "https://post-api.openprocure.ai/api", // backend URL
  headers: {
    "Content-Type": "application/json"
  }
});

export default api;
