import { Router } from "express";
import { adminAuth } from "../middlewares/adminAuth.js";
import { validateBody } from "../middlewares/validateBody.js";
import { list, create } from "../controllers/transparencyController.js";

const router = Router();

router.get("/", list);
router.post("/", adminAuth, validateBody(["type", "title"]), create);

export default router;
