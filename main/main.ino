#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <Preferences.h>
#include <WiFi.h>
#include <time.h>
#include "certificates.h"
#include "secrets.h"

constexpr int moisturePin = 34;
constexpr int redPin = 25;
constexpr int greenPin = 26;
constexpr int bluePin = 27;

constexpr int dryRaw = 3200; // temporary estimate - recalibrate in dry soil
constexpr int wetRaw = 2000; // temporary estimate - recalibrate after watering
constexpr char deviceId[] = "lemon-lime-dracaena-01";
constexpr char firmwareVersion[] = "0.2.1";
constexpr unsigned long uploadIntervalMs = 300000;
constexpr time_t minimumValidTime = 1700000000;

unsigned long sequence = 1;
unsigned long lastUploadAttemptAt = 0;
Preferences preferences;
bool preferencesReady = false;
char pendingPayload[256];
bool hasPendingReading = false;

void loadSequence() {
  preferencesReady = preferences.begin("plant-monitor", false);

  if (!preferencesReady) {
    Serial.println("Failed to open sequence storage");
    return;
  }

  sequence = preferences.getULong("next-seq", 1);
  Serial.print("Next reading sequence: ");
  Serial.println(sequence);
}

bool advanceSequence() {
  if (!preferencesReady) {
    Serial.println("Sequence storage is unavailable");
    return false;
  }

  if (sequence == UINT32_MAX) {
    Serial.println("Sequence has reached its maximum value");
    return false;
  }

  const unsigned long nextSequence = sequence + 1;

  if (preferences.putULong("next-seq", nextSequence) == 0) {
    Serial.println("Failed to save sequence");
    return false;
  }

  sequence = nextSequence;
  return true;
}

float moisturePercent(int raw) {
  const float percent =
    100.0f * (dryRaw - raw) / (dryRaw - wetRaw);
  return constrain(percent, 0.0f, 100.0f);
}

int readAverageMoisture() {
  constexpr int sampleCount = 10;
  int total = 0;

  for (int sample = 0; sample < sampleCount; sample++) {
    total += analogRead(moisturePin);
    delay(10);
  }

  return total / sampleCount;
}

const char* moistureStatus(int percent) {
  if (percent <= 25) {
    return "dry";
  }

  if (percent <= 45) {
    return "getting-dry";
  }

  return "moist";
}

bool formatReadingJson(
  char* buffer,
  size_t bufferSize,
  int raw,
  int percent
) {
  const char* status = moistureStatus(percent);
  const int rssi = WiFi.RSSI();

  const int length = snprintf(
    buffer,
    bufferSize,
    "{\"deviceId\":\"%s\","
    "\"sequence\":%lu,"
    "\"raw\":%d,"
    "\"moisturePercent\":%d,"
    "\"status\":\"%s\","
    "\"rssi\":%d,"
    "\"firmwareVersion\":\"%s\"}",
    deviceId,
    sequence,
    raw,
    percent,
    status,
    rssi,
    firmwareVersion
  );

  return length >= 0 && static_cast<size_t>(length) < bufferSize;
}

bool clockIsReady() {
  return time(nullptr) >= minimumValidTime;
}

bool sendReading(const char* payload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Upload deferred: Wi-Fi is disconnected");
    return false;
  }

  if (!clockIsReady()) {
    Serial.println("Upload deferred: waiting for clock sync");
    return false;
  }

  NetworkClientSecure client;
  client.setCACert(gtsRootR4);

  HTTPClient http;

  if (!http.begin(client, API_URL)) {
    Serial.println("Failed to start HTTPS request");
    return false;
  }

  const String authorization = String("Bearer ") + DEVICE_KEY;
  http.addHeader("Authorization", authorization);
  http.addHeader("Content-Type", "application/json");

  Serial.print("Uploading sequence ");
  Serial.println(sequence);

  const int responseCode = http.POST(String(payload));
  const bool accepted = responseCode == 200 || responseCode == 201;

  if (responseCode > 0) {
    Serial.print("Worker response: ");
    Serial.println(responseCode);
  } else {
    Serial.print("HTTPS request failed: ");
    Serial.println(http.errorToString(responseCode));
  }

  http.end();
  return accepted;
}

void setColour(int red, int green, int blue) {
  analogWrite(redPin, red);
  analogWrite(greenPin, green);
  analogWrite(bluePin, blue);
}

constexpr unsigned long wifiRetryIntervalMs = 30000;

unsigned long lastWifiAttemptAt = 0;
bool wifiWasConnected = false;

void startWifi() {
  Serial.print("Connecting to ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  lastWifiAttemptAt = millis();
}

void maintainWifi() {
  const bool wifiIsConnected = WiFi.status() == WL_CONNECTED;

  if (wifiIsConnected) {
    if (!wifiWasConnected) {
      Serial.println("Wi-Fi connected");
      Serial.print("IP address: ");
      Serial.println(WiFi.localIP());
      configTime(0, 0, "pool.ntp.org", "time.nist.gov");
      Serial.println("Clock sync requested");
    }

    wifiWasConnected = true;
    return;
  }

  if (wifiWasConnected) {
    Serial.println("Wi-Fi disconnected");
  }

  wifiWasConnected = false;

  const unsigned long now = millis();

  if (now - lastWifiAttemptAt < wifiRetryIntervalMs) {
    return;
  }

  lastWifiAttemptAt = now;

  Serial.println("Retrying Wi-Fi connection...");
  WiFi.reconnect();
}

void setup() {
  Serial.begin(115200);

  loadSequence();

  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);

  Serial.println("Smart Plant Moisture Monitor ready");
  startWifi();
}

void loop() {
  maintainWifi();
  const int moisture = readAverageMoisture();
  //Serial.println(moisture);
  setColour(255, 0, 0);

  const int percent = moisturePercent(moisture);

  const unsigned long now = millis();

  if (percent <= 25) {
    setColour(255, 0, 0);     // dry: red
  } else if (percent <= 45) {
    setColour(255, 100, 0);   // getting dry: yellow
  } else {
    setColour(0, 255, 0);     // moist: green
  }

  if (now - lastUploadAttemptAt >= uploadIntervalMs) {
    lastUploadAttemptAt = now;

    if (!hasPendingReading) {
      hasPendingReading = formatReadingJson(
        pendingPayload,
        sizeof(pendingPayload),
        moisture,
        percent
      );

      if (hasPendingReading) {
        Serial.print("Reading queued: ");
        Serial.println(pendingPayload);
      } else {
        Serial.println("Reading JSON was too large");
      }
    }

    if (hasPendingReading && sendReading(pendingPayload)) {
      if (advanceSequence()) {
        hasPendingReading = false;
        pendingPayload[0] = '\0';
        Serial.println("Reading accepted and sequence advanced");
      }
    }
  }

  delay(50);
}
