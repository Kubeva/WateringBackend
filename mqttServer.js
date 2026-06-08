const mqtt = require("mqtt");

require("dotenv").config();

const STATE_TOPIC = "watering/nodes/+/state";

const HUMIDITY_THRESHOLD = Number(process.env.HUMIDITY_THRESHOLD ?? 20);
const DEFAULT_VALVE_TIME_MS = Number(process.env.DEFAULT_VALVE_TIME_MS ?? 1000);
const MAX_VALVE_TIME_MS = Number(process.env.MAX_VALVE_TIME_MS ?? 30000);
const MAX_HISTORY_POINTS = Number(process.env.MAX_HISTORY_POINTS ?? 720);
const AUTO_WATER_COOLDOWN_MS = Number(process.env.AUTO_WATER_COOLDOWN_MS ?? 60000);

let devices = {};
let io = null;

const mqttClient = mqtt.connect(process.env.MQTT_URL, {
  username: process.env.MQTT_USER || undefined,
  password: process.env.MQTT_PASS || undefined,
});

function emitDevices() {
  if (io) {
    io.emit("devices", getDevices());
  }
}

function getDevices() {
  return Object.values(devices);
}

function getDevice(id) {
  return devices[String(id)] ?? null;
}

function getDeviceHistory(id) {
  const device = getDevice(id);
  return device?.history ?? [];
}

function controlTopic(id) {
  return `watering/nodes/${id}/control`;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function createEmptyHumidityStats() {
  return {
    highest: null,
    lowest: null,
  };
}

function addHistorySample(device, incoming, time) {
  const humidity = Number(incoming.humidity);
  const lum = Number(incoming.lum);

  if (!Number.isFinite(humidity) || !Number.isFinite(lum)) {
    return;
  }

  const sample = {
    time,
    humidity,
    lum,
  };

  device.history.push(sample);

  if (device.history.length > MAX_HISTORY_POINTS) {
    device.history = device.history.slice(-MAX_HISTORY_POINTS);
  }

  if (!device.humidityStats) {
    device.humidityStats = createEmptyHumidityStats();
  }

  if (
      device.humidityStats.highest === null ||
      humidity > device.humidityStats.highest.value
  ) {
    device.humidityStats.highest = {
      value: humidity,
      time,
    };
  }

  if (
      device.humidityStats.lowest === null ||
      humidity < device.humidityStats.lowest.value
  ) {
    device.humidityStats.lowest = {
      value: humidity,
      time,
    };
  }
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
  id = String(id);

  const device = devices[id];

  if (!device) {
    throw new Error(`Unknown device: ${id}`);
  }

  if (device.openValve) {
    console.log(`Ignoring open request for ${id}: valve already open`);
    return false;
  }

  const safeValveTime = Math.max(
      1,
      Math.min(Number(valveTime), MAX_VALVE_TIME_MS)
  );

  publishValveCommand(id, true, safeValveTime);

  devices[id] = {
    ...device,
    requestedValveOpen: true,
    requestedValveTime: safeValveTime,
    lastCommandAt: new Date().toISOString(),
    lastValveCommandAtMs: Date.now(),
  };

  emitDevices();

  return true;
}

function requestValveClose(id) {
  id = String(id);

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
    lastValveCommandAtMs: Date.now(),
  };

  emitDevices();

  return true;
}

function shouldAutoWater(device) {
  if (!isFiniteNumber(device.humidity)) {
    return false;
  }

  if (device.humidity >= HUMIDITY_THRESHOLD) {
    return false;
  }

  if (device.openValve) {
    return false;
  }

  const lastAutoWaterAtMs = device.lastAutoWaterAtMs ?? 0;
  const elapsed = Date.now() - lastAutoWaterAtMs;

  return elapsed >= AUTO_WATER_COOLDOWN_MS;
}

mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker.");
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
  const now = new Date().toISOString();

  const previous = devices[id] ?? {
    id: Number(incoming.id),
    history: [],
    humidityStats: createEmptyHumidityStats(),
  };

  const updatedDevice = {
    ...previous,
    ...incoming,
    id: Number(incoming.id),
    history: previous.history ?? [],
    humidityStats: previous.humidityStats ?? createEmptyHumidityStats(),
    lastSeen: now,
  };

  addHistorySample(updatedDevice, incoming, now);

  devices[id] = updatedDevice;

  if (shouldAutoWater(updatedDevice)) {
    try {
      requestValveOpen(id, DEFAULT_VALVE_TIME_MS);

      devices[id] = {
        ...devices[id],
        lastAutoWaterAt: new Date().toISOString(),
        lastAutoWaterAtMs: Date.now(),
      };
    } catch (e) {
      console.error("Auto-watering failed:", e);
    }
  }

  emitDevices();

  console.log("Device state:", devices[id]);
});

mqttClient.on("error", (error) => {
  console.error("MQTT error:", error);
});

function setSocket(socketIo) {
  io = socketIo;
}

module.exports = {
  getDevices,
  getDevice,
  getDeviceHistory,
  requestValveOpen,
  requestValveClose,
  setSocket,
};