import { Router } from "express";
import { listTransparency, listInventario } from "../controllers/transparencyController.js";

const router = Router();

router.get("/", listTransparency);
router.get("/inventario", listInventario);

export default router;
