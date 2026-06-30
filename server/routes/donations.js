import { Router } from "express";
import { validateBody } from "../middlewares/validateBody.js";
import {
  mpCreate,
  mpWebhook,
  paypalCreate,
  paypalCapture,
  listDonations,
} from "../controllers/donationsController.js";
import { liveDonations } from "../controllers/liveController.js";

const router = Router();

router.get("/", listDonations);
router.post("/mp/create", validateBody(["amount"]), mpCreate);
router.post("/mp/webhook", mpWebhook);
router.post("/paypal/create", validateBody(["amount"]), paypalCreate);
router.post("/paypal/capture", validateBody(["order_id"]), paypalCapture);
router.get("/live", liveDonations);

export default router;
