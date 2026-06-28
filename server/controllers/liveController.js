import { addClient } from "../services/sseManager.js";

export function liveDonations(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write("data: {\"connected\":true}\n\n");

  addClient(res);
}
