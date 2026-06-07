const mqtt = require("mqtt");

require("dotenv").config();

const STATE_TOPIC = "watering/nodes/+/state";

const HUMIDITY_THRESHOLD = Number(process.env.HUMIDITY_THRESHOLD ?? 20);
const DEFAULT_VALVE_TIME_MS = Number(process.env.DEFAULT_VALVE_TIME_MS ?? 1000);
const MAX_VALVE_TIME_MS = Number(process.env.MAX_VALVE_TIME_MS ?? 30000);

let devices = {};
let io = null;

const mqttClient = mqtt.connect(process.env.MQTT_URL, {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
});

function emitDevices() {
  if (io) {
    io.emit("devices", Object.values(devices));
  }
}

function getDevices() {
  return Object.values(devices);
}

function getDevice(id) {
  return devices[id];
}

function controlTopic(id) {
  return `watering/nodes/${id}/control`;
}

function publishValveCommand(id, openValve, valveTime = 0) {
  const payload = {
    id: Number(id),
    openValve: Boolean(openValve),
  };

  if (openValve) {
    payload.valveTime = valveTime;
  }

  mqttClient.publish(
      controlTopic(id),
      JSON.stringify(payload),
      {
        qos: 0,
        retain: false,
      }
  );

  console.log("Published valve command:", payload);
}

function requestValveOpen(id, valveTime = DEFAULT_VALVE_TIME_MS) {
  const device = devices[id];

  console.log("valve open request for device: ", id, valveTime);
  if (!device) {
    throw new Error(`Unknown device: ${id}`);
  }

  if (device.openValve) {
    console.log(`Ignoring open request for ${id}: valve already open`);
    return false;
  }

  const safeValveTime = Math.max(1, Math.min(Number(valveTime), MAX_VALVE_TIME_MS));

  publishValveCommand(id, true, safeValveTime);

  devices[id] = {
    ...device,
    requestedValveOpen: true,
    requestedValveTime: safeValveTime,
    lastCommandAt: new Date().toISOString(),
  };

  emitDevices();
  return true;
}

function requestValveClose(id) {
  const device = devices[id];

  if (!device) {
    throw new Error(`Unknown device: ${id}`);
  }

  publishValveCommand(id, false);

  devices[id] = {
    ...device,
    openValve: false,
    requestedValveOpen: false,
    lastCommandAt: new Date().toISOString(),
  };

  emitDevices();
  return true;
}

mqttClient.on("connect", () => {
  console.log("Connected to HiveMQ.");
  mqttClient.subscribe(STATE_TOPIC);
  console.log("Subscribed:", STATE_TOPIC);
});

mqttClient.on("message", (topic, message) => {
  if (!topic.endsWith("/state")) {
    return;
  }

  let incoming;

  try {
    incoming = JSON.parse(message.toString());
  } catch (e) {
    console.error("Bad MQTT JSON:", e);
    return;
  }

  if (incoming.id === undefined || incoming.id === null) {
    console.error("Ignoring state without id:", incoming);
    return;
  }

  const id = String(incoming.id);
  const previous = devices[id] || {};

  const updatedDevice = {
    ...previous,
    ...incoming,
    id: Number(incoming.id),
    lastSeen: new Date().toISOString(),
  };

  devices[id] = updatedDevice;

  console.log("Device state:", updatedDevice);

  if (
      typeof updatedDevice.humidity === "number" &&
      updatedDevice.humidity < HUMIDITY_THRESHOLD &&
      updatedDevice.openValve === false
  ) {
    try {
      requestValveOpen(id, DEFAULT_VALVE_TIME_MS);
    } catch (e) {
      console.error("Auto-watering failed:", e);
    }
  }

  emitDevices();
});

function setSocket(socketIo) {
  io = socketIo;
}

module.exports = {
  getDevices,
  getDevice,
  requestValveOpen,
  requestValveClose,
  setSocket,
};