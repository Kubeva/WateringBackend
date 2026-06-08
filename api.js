const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const {
  setSocket,
  getDevices,
  getDevice,
  getDeviceHistory,
  requestValveOpen,
  requestValveClose,
} = require("./mqttServer");

const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

setSocket(io);

app.get("/devices", (req, res) => {
  res.json(getDevices());
});

app.get("/devices/:id", (req, res) => {
  const device = getDevice(req.params.id);

  if (!device) {
    return res.status(404).json({
      ok: false,
      error: "Device not found",
    });
  }

  res.json(device);
});

app.get("/devices/:id/history", (req, res) => {
  res.json(getDeviceHistory(req.params.id));
});

app.post("/devices/:id/valve/open", (req, res) => {
  try {
    const valveTime = Number(req.body?.valveTime ?? 1000);
    const accepted = requestValveOpen(req.params.id, valveTime);

    res.json({
      ok: true,
      accepted,
    });
  } catch (e) {
    res.status(400).json({
      ok: false,
      error: e.message,
    });
  }
});

app.post("/devices/:id/valve/close", (req, res) => {
  try {
    requestValveClose(req.params.id);

    res.json({
      ok: true,
    });
  } catch (e) {
    res.status(400).json({
      ok: false,
      error: e.message,
    });
  }
});

server.listen(4000, () => {
  console.log("Backend running on port 4000");
});