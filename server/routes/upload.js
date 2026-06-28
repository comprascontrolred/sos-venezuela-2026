import { Router } from "express";
import multer from "multer";
import { upload } from "../controllers/uploadController.js";

const router = Router();
const storage = multer.memoryStorage();
const uploader = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post("/", uploader.single("file"), upload);

export default router;
