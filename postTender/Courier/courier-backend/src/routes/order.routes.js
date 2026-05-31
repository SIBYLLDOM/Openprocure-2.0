import express from "express";
import {
  createOrder,
  generateAwb,
  getReadyToShipOrders
} from "../shiprocket/order.js";

import { getPickupLocations } from "../shiprocket/pickup.js";
import { generateManifest } from "../shiprocket/documents.js";
import { generatePickup } from "../shiprocket/pickupGenerate.js";
import { generateLabel } from "../shiprocket/labelGenerate.js";
import { getCourierStatus } from "../services/courierTracking.js";
import { trackShipment } from "../shiprocket/tracking.js";
import { cancelShipment } from "../shiprocket/cancel.js";

const router = express.Router();

/* ORDERS */
router.post("/create", createOrder);
router.post("/generate-awb", generateAwb);
router.get("/ready-to-ship", getReadyToShipOrders);

/* PICKUP LOCATIONS */
router.get("/pickup/locations", getPickupLocations);

/* PICKUP REQUEST */
router.post("/pickup/generate", generatePickup);

/* LABEL GENERATION */
router.post("/label/generate", generateLabel);

/* COURIER STATUS CHECK */
router.get("/status/:contract_no", getCourierStatus);

/* TRACKING */
router.get("/track/:awb_code", trackShipment);

/* CANCEL SHIPMENT */
router.post("/cancel", cancelShipment);

/* MANIFEST = PICKUP SCHEDULE */
router.post("/manifest/generate", generateManifest);

export default router;
