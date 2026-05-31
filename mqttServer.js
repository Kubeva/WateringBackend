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
      id: Math.floor(Math.random() * 1),
      humidity: Math.floor(Math.random() * 30),
      lum: Math.floor(Math.random() * 100),
      openValve: false
    });

    mqttClient.publish("devices/test", payload);
  }, 5000);
});

mqttClient.on("message", (topic, message) => {
  const device = JSON.parse(message.toString());
  const currDev = devices[device.id] || {};

  let updatedDev = {
    ...currDev,
    ...device
  }

  if (updatedDev.humidity < 20) {
    updatedDev.openValve = true;
  } else {
    updatedDev.openValve = false;
  }

  devices[device.id] = updatedDev;

  mqttClient.publish(
    `devices/${device.id}/control`,
    JSON.stringify({
      openValve: updatedDev.openValve,
    })
  );

  if (io) {
    io.emit("devices", Object.values(devices));
  }

  console.log(updatedDev);
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