const mqtt = require("mqtt");
require("dotenv").config();

let devices = {};
let io = null;

const mqttClient = mqtt.connect(
  process.env.MQTT_URL,
  {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS
  }
);

mqttClient.on("connect", () => {
  console.log("Connected to HiveMQ.");

  mqttClient.subscribe("devices/test");

  setInterval(() => {
    const payload = JSON.stringify({
      id: Math.floor(Math.random() * 3),
      humidity: Math.floor(Math.random() * 30),
      lum: Math.floor(Math.random() * 100),
    });

    mqttClient.publish("devices/test", payload);
  }, 5000);
});

mqttClient.on("message", (topic, message) => {
  const device = JSON.parse(message.toString());
  devices[device.id] = device;

  if (io) {
    io.emit("devices", Object.values(devices));
  }

  console.log(device);
});

function getDevices() {
  return Object.values(devices);
}

function setSocket(socketIo) {
  io = socketIo;
}

module.exports = {
  getDevices,
  setSocket
}