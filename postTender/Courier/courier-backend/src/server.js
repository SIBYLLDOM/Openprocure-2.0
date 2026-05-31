import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import orderRoutes from "./routes/order.routes.js";
import courierRoutes from "./routes/courier.routes.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/order", orderRoutes);
app.use("/api/courier", courierRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Backend running on port ${PORT}`)
);
