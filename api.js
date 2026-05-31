const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { setSocket } = require("./mqttServer");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

setSocket(io);

app.get("/devices", (req, res) => {
  res.json(getDevices());
});

server.listen(4000, () => console.log("Backend running on port 4000"));
