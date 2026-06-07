const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { setSocket, requestValveOpen, requestValveClose } = require("./mqttServer");

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

app.post("/devices/:id/valve/open", (req, res) => {
  const { id } = req.params;
  const data = req.body;

  requestValveOpen(id, data.valveTime);

  res.json({message: `Opened valve for ${data.valveTime}.`})
});

app.post("/devices/:id/valve/close", (req, res) => {
  const { id } = req.params;

  requestValveClose(id)
});

server.listen(4000, () => console.log("Backend running on port 4000"));
