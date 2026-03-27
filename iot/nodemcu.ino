/*
 * ════════════════════════════════════════════════════════
 *  KRISHI MITRAAN — NodeMCU ESP8266 Smart Irrigation
 *  Sensors: Soil Moisture (A0), DHT11 (D2), Relay (D5)
 *
 *  How it works:
 *  1. Reads moisture, temperature, humidity every 5 sec
 *  2. POSTs to backend → backend calculates irrigation
 *     duration based on PLANT TYPE + TEMPERATURE
 *  3. NodeMCU runs pump for exactly the duration the
 *     server tells it to (plant-specific smart control)
 *
 *  Libraries needed (Arduino Library Manager):
 *    - DHT sensor library (Adafruit)
 *    - Adafruit Unified Sensor
 *    - ArduinoJson v6.x (Benoit Blanchon)
 *    - ESP8266WiFi (built-in with esp8266 board package)
 * ════════════════════════════════════════════════════════
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ── WiFi ─────────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ── Backend URL ───────────────────────────────────────
// Find your PC's IP: open CMD → ipconfig → IPv4 Address
const char* SERVER_URL = "http://192.168.1.XXX:3000/update-sensor";

// ── Pin Configuration ─────────────────────────────────
#define MOISTURE_PIN  A0   // Capacitive/resistive soil moisture sensor
#define DHT_PIN       D2   // DHT11 data pin
#define RELAY_PIN     D5   // Relay IN pin (active LOW = pump ON)
#define STATUS_LED    D4   // Built-in LED (active LOW)

// ── DHT11 ─────────────────────────────────────────────
#define DHT_TYPE DHT11
DHT dht(DHT_PIN, DHT_TYPE);

// ── Moisture Calibration ──────────────────────────────
// Calibrate these values for YOUR sensor:
//   1. Put sensor in dry air  → note raw value (DRY_VALUE)
//   2. Put sensor in water    → note raw value (WET_VALUE)
const int DRY_VALUE = 950;
const int WET_VALUE = 350;

// ── Timing ────────────────────────────────────────────
const unsigned long READ_INTERVAL = 5000;  // 5 sec between readings
unsigned long lastReadTime = 0;

// ── Irrigation State ──────────────────────────────────
bool pumpRunning = false;
unsigned long pumpStartTime = 0;
unsigned long pumpDurationMs = 0;   // milliseconds to run pump

// ══════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println(F("\n\n╔══════════════════════════════════╗"));
  Serial.println(F(  "║  KRISHI MITRAAN — Smart Irrigator ║"));
  Serial.println(F(  "╚══════════════════════════════════╝"));

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  pumpOff();  // ensure pump is off at startup

  dht.begin();
  delay(2000);  // DHT11 needs 2 sec after power-on

  connectWiFi();
}

// ══════════════════════════════════════════════════════
void loop() {
  // ── Auto-stop pump after scheduled duration ───────
  if (pumpRunning && millis() - pumpStartTime >= pumpDurationMs) {
    pumpOff();
    Serial.println(F("⏹  Irrigation cycle complete."));
  }

  // ── WiFi watchdog ─────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("⚠️  WiFi lost. Reconnecting..."));
    pumpOff();  // safety: turn off pump if WiFi lost
    connectWiFi();
    return;
  }

  // ── Read and send sensor data ──────────────────────
  if (millis() - lastReadTime >= READ_INTERVAL) {
    lastReadTime = millis();
    readAndSend();
  }
}

// ══════════════════════════════════════════════════════
void readAndSend() {
  // Read DHT11
  float temperature = dht.readTemperature();
  float humidity    = dht.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println(F("❌ DHT11 read failed! Check D2 wiring."));
    return;
  }

  // Read and convert moisture
  int rawMoisture   = analogRead(MOISTURE_PIN);
  int moisturePct   = map(rawMoisture, DRY_VALUE, WET_VALUE, 0, 100);
  moisturePct       = constrain(moisturePct, 0, 100);

  // Log to Serial
  Serial.println(F("────────────────────────────────────"));
  Serial.printf("🌡️  Temp:     %.1f °C\n", temperature);
  Serial.printf("💧 Humidity: %.1f %%\n", humidity);
  Serial.printf("🌱 Moisture: %d %% (ADC:%d)\n", moisturePct, rawMoisture);
  Serial.printf("⚡ Pump:     %s\n", pumpRunning ? "RUNNING" : "IDLE");

  // Send to backend and get irrigation command
  sendToServer(moisturePct, temperature, humidity);
}

// ══════════════════════════════════════════════════════
void sendToServer(int moisture, float temperature, float humidity) {
  WiFiClient wifiClient;
  HTTPClient http;

  if (!http.begin(wifiClient, SERVER_URL)) {
    Serial.println(F("❌ HTTP begin failed"));
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.setTimeout(6000);

  // Build JSON
  StaticJsonDocument<128> doc;
  doc["moisture"]    = moisture;
  doc["temperature"] = roundf(temperature * 10) / 10.0;
  doc["humidity"]    = roundf(humidity * 10) / 10.0;

  String payload;
  serializeJson(doc, payload);

  Serial.printf("📡 POST → %s\n", SERVER_URL);

  int code = http.POST(payload);

  if (code == HTTP_CODE_OK) {
    String body = http.getString();

    // Parse server response
    StaticJsonDocument<256> resp;
    DeserializationError err = deserializeJson(resp, body);

    if (!err) {
      bool   shouldPump = resp["pumpOn"]           | false;
      int    durSecs    = resp["pumpDurationSecs"]  | 0;
      String urgency    = resp["urgency"]           | "none";
      String plant      = resp["plant"]             | "Unknown";

      Serial.printf("✅ Server: Plant=%s Pump=%s Duration=%ds Urgency=%s\n",
        plant.c_str(),
        shouldPump ? "ON" : "OFF",
        durSecs,
        urgency.c_str()
      );

      // Act on pump command (don't restart if already running)
      if (shouldPump && !pumpRunning) {
        pumpOn(durSecs);
        Serial.printf("💦 Starting irrigation for %d seconds\n", durSecs);
      } else if (!shouldPump && pumpRunning) {
        pumpOff();
        Serial.println(F("🛑 Server says stop — pump off"));
      }
    } else {
      Serial.println(F("⚠️  JSON parse failed on server response"));
    }
  } else {
    Serial.printf("❌ HTTP %d — Check server is running and IP is correct\n", code);
    Serial.printf("   URL was: %s\n", SERVER_URL);
  }

  http.end();
}

// ══════════════════════════════════════════════════════
void pumpOn(int durationSeconds) {
  if (durationSeconds <= 0) return;
  pumpRunning    = true;
  pumpStartTime  = millis();
  pumpDurationMs = (unsigned long)durationSeconds * 1000UL;
  digitalWrite(RELAY_PIN, LOW);   // Active LOW relay → pump ON
  digitalWrite(STATUS_LED, LOW);  // LED ON
}

void pumpOff() {
  pumpRunning = false;
  digitalWrite(RELAY_PIN, HIGH);  // Relay OFF → pump OFF
  digitalWrite(STATUS_LED, HIGH); // LED OFF
}

// ══════════════════════════════════════════════════════
void connectWiFi() {
  Serial.printf("🔌 Connecting to: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  WiFi.setAutoReconnect(true);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("\n✅ WiFi connected!"));
    Serial.printf("   IP: %s  Signal: %d dBm\n",
      WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println(F("\n❌ WiFi failed. Check SSID/password. Restarting in 10s..."));
    delay(10000);
    ESP.restart();
  }
}
