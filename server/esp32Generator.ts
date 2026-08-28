export function generateEsp32Sketch(
  serverUrl: string = 'https://scooterlink.app',
  deviceId: string = 'scooter-001',
  deviceKey: string = 'TROCAR_POR_CHAVE_SECRETA',
  apn: string = 'zap.vivo.com.br'
): string {
  const host = serverUrl.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  const isHttps = serverUrl.startsWith('https://');
  const port = isHttps ? 443 : 80;

  return `/*
 * =========================================================================================
 *  SCOOTER-LINK - FIRMWARE OFICIAL ESP32 + SIM800L 2G/GPRS + GPS NEO-6M
 * =========================================================================================
 *  Arquitetura:
 *   - Telemetria periódica via HTTP POST para /api/telemetry
 *   - Polling de fila de comandos remotos a cada 5s via GET /api/scooters/${deviceId}/commands?status=pending
 *   - Confirmação de execução (ACK) via POST /api/commands/<id>/ack
 *   - Autenticação por Header: X-Device-Key: ${deviceKey}
 *
 *  Pinout de Hardware Recomendado:
 *   - ESP32 Serial2 (RX2: GPIO 16, TX2: GPIO 17) -> NEO-6M GPS (TX, RX)
 *   - ESP32 Serial1 (RX1: GPIO 26, TX1: GPIO 27) -> SIM800L (TX, RX)
 *   - SIM800L RST / PWRKEY: GPIO 4 / GPIO 23
 *   - Relé / Ignicao (Start/Stop): GPIO 32
 *   - Relé Farol (Headlight): GPIO 33
 *   - Seta Esquerda (Left Turn): GPIO 25
 *   - Seta Direita (Right Turn): GPIO 14
 *   - Buzina / Sirene (Horn / Buzzer): GPIO 12
 *   - Sensor / Divisor Tensão Bateria: GPIO 34 (ADC)
 * =========================================================================================
 */

#define TINY_GSM_MODEM_SIM800
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <TinyGsmClient.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h> // ArduinoJson v6 ou v7

// Identificação e Autenticação
const char DEVICE_ID[]   = "${deviceId}";
const char DEVICE_KEY[]  = "${deviceKey}";

// Servidor Scooter-Link
const char SERVER_HOST[] = "${host}";
const int  SERVER_PORT   = ${port};

// APN GSM da Operadora (Vivo: zap.vivo.com.br | Claro: claro.com.br | Tim: timbrasil.br)
const char APN[]         = "${apn}";
const char GPRS_USER[]   = "";
const char GPRS_PASS[]   = "";

// Pinos de Controle & Sensores
#define PIN_GPS_RX       16
#define PIN_GPS_TX       17
#define PIN_GSM_RX       26
#define PIN_GSM_TX       27
#define PIN_GSM_RST      4
#define PIN_BATTERY_ADC  34

#define PIN_RELAY_IGNITION  32
#define PIN_RELAY_HEADLIGHT 33
#define PIN_TURN_LEFT       25
#define PIN_TURN_RIGHT      14
#define PIN_HORN_BUZZER     12

// Instâncias de Hardware
HardwareSerial SerialGPS(2);
HardwareSerial SerialGSM(1);
TinyGPSPlus gps;
TinyGsm modem(SerialGSM);
${isHttps ? 'TinyGsmClientSecure gsmClient(modem);' : 'TinyGsmClient gsmClient(modem);'}
HttpClient httpClient(gsmClient, SERVER_HOST, SERVER_PORT);

// Timers de Execução
unsigned long lastTelemetryTime = 0;
unsigned long lastCommandPollTime = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 10000; // 10s normal / 1s modo roubo
const unsigned long COMMAND_POLL_INTERVAL_MS = 5000; // 5 segundos obrigatório

// Estado da Scooter
bool isScooterOn = false;
bool isHeadlightOn = false;
bool isTheftMode = false;

// Leitura de Tensão da Bateria (Li-ion 3.7V - 4.2V ou Bateria 48V com divisor)
float readBatteryVoltage() {
  int raw = analogRead(PIN_BATTERY_ADC);
  float pinVoltage = (raw / 4095.0) * 3.3;
  return pinVoltage * 5.54; // Fator multiplicador do divisor R1/R2
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println(F("\\n=========================================="));
  Serial.println(F("🚀 SCOOTER-LINK - REMOTELY CONTROLLED FIRMWARE"));
  Serial.println(F("=========================================="));

  // Configurar GPIOs de Atuadores
  pinMode(PIN_RELAY_IGNITION, OUTPUT);
  pinMode(PIN_RELAY_HEADLIGHT, OUTPUT);
  pinMode(PIN_TURN_LEFT, OUTPUT);
  pinMode(PIN_TURN_RIGHT, OUTPUT);
  pinMode(PIN_HORN_BUZZER, OUTPUT);

  digitalWrite(PIN_RELAY_IGNITION, LOW);
  digitalWrite(PIN_RELAY_HEADLIGHT, LOW);
  digitalWrite(PIN_TURN_LEFT, LOW);
  digitalWrite(PIN_TURN_RIGHT, LOW);
  digitalWrite(PIN_HORN_BUZZER, LOW);

  // Iniciar GPS NEO-6M
  SerialGPS.begin(9600, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);

  // Iniciar Modem SIM800L
  pinMode(PIN_GSM_RST, OUTPUT);
  digitalWrite(PIN_GSM_RST, HIGH);
  delay(100);
  digitalWrite(PIN_GSM_RST, LOW);
  delay(1000);
  digitalWrite(PIN_GSM_RST, HIGH);

  SerialGSM.begin(9600, SERIAL_8N1, PIN_GSM_RX, PIN_GSM_TX);
  delay(3000);

  Serial.println(F("📡 Inicializando Modem SIM800L..."));
  modem.restart();

  Serial.print(F("Conectando na rede GSM/GPRS... "));
  if (!modem.waitForNetwork(60000L)) {
    Serial.println(F("Falha ao registrar na rede GSM!"));
  } else {
    Serial.println(F("Registrado na rede!"));
  }

  Serial.print(F("Abrindo contexto GPRS APN: "));
  Serial.println(APN);
  if (!modem.gprsConnect(APN, GPRS_USER, GPRS_PASS)) {
    Serial.println(F("Falha ao ativar GPRS!"));
  } else {
    Serial.println(F("✅ Conexão de dados 2G/GPRS estabelecida!"));
  }
}

void loop() {
  // Feed GPS parser continuously
  while (SerialGPS.available() > 0) {
    gps.encode(SerialGPS.read());
  }

  unsigned long currentMillis = millis();

  // 1. Enviar Telemetria a cada TELEMETRY_INTERVAL_MS
  if (currentMillis - lastTelemetryTime >= (isTheftMode ? 1000 : TELEMETRY_INTERVAL_MS)) {
    lastTelemetryTime = currentMillis;
    sendTelemetry();
  }

  // 2. Consultar Fila de Comandos a cada 5 segundos
  if (currentMillis - lastCommandPollTime >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollTime = currentMillis;
    pollPendingCommands();
  }
}

// ---------------------------------------------------------------------------
// 1. Envio de Telemetria (POST /api/telemetry)
// ---------------------------------------------------------------------------
void sendTelemetry() {
  float lat = gps.location.isValid() ? gps.location.lat() : -23.55052;
  float lng = gps.location.isValid() ? gps.location.lng() : -46.63331;
  float speed = gps.speed.isValid() ? gps.speed.kmh() : 0.0;
  float alt = gps.altitude.isValid() ? gps.altitude.meters() : 760.0;
  float course = gps.course.isValid() ? gps.course.deg() : 0.0;
  int sats = gps.satellites.isValid() ? gps.satellites.value() : 0;
  float hdop = gps.hdop.isValid() ? gps.hdop.hdop() : 1.0;
  int signalRssi = modem.getSignalQuality();

  char timeStr[30];
  snprintf(timeStr, sizeof(timeStr), "%04d-%02d-%02dT%02d:%02d:%02dZ",
           gps.date.year() > 2000 ? gps.date.year() : 2026,
           gps.date.month() > 0 ? gps.date.month() : 8,
           gps.date.day() > 0 ? gps.date.day() : 27,
           gps.time.hour(), gps.time.minute(), gps.time.second());

  char dateUtc[12];
  snprintf(dateUtc, sizeof(dateUtc), "%04d-%02d-%02d",
           gps.date.year() > 2000 ? gps.date.year() : 2026,
           gps.date.month() > 0 ? gps.date.month() : 8,
           gps.date.day() > 0 ? gps.date.day() : 27);

  char timeUtc[10];
  snprintf(timeUtc, sizeof(timeUtc), "%02d:%02d:%02d",
           gps.time.hour(), gps.time.minute(), gps.time.second());

  StaticJsonDocument<512> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = timeStr;

  JsonObject gpsObj = doc.createNestedObject("gps");
  gpsObj["latitude"] = lat;
  gpsObj["longitude"] = lng;
  gpsObj["altitudeMeters"] = alt;
  gpsObj["speedKmh"] = speed;
  gpsObj["courseDegrees"] = course;
  gpsObj["satellites"] = sats;
  gpsObj["hdop"] = hdop;
  gpsObj["gpsDateUtc"] = dateUtc;
  gpsObj["gpsTimeUtc"] = timeUtc;

  JsonObject scooterObj = doc.createNestedObject("scooter");
  scooterObj["isOn"] = isScooterOn;

  JsonObject netObj = doc.createNestedObject("network");
  netObj["signalRssi"] = signalRssi;
  netObj["registered"] = true;

  String jsonBody;
  serializeJson(doc, jsonBody);

  Serial.println(F("\\n📤 [POST /api/telemetry] Enviando telemetria..."));
  httpClient.beginRequest();
  httpClient.post("/api/telemetry");
  httpClient.sendHeader("Content-Type", "application/json");
  httpClient.sendHeader("X-Device-Key", DEVICE_KEY);
  httpClient.sendHeader("Content-Length", jsonBody.length());
  httpClient.beginBody();
  httpClient.print(jsonBody);
  httpClient.endRequest();

  int statusCode = httpClient.responseStatusCode();
  String response = httpClient.responseBody();
  Serial.print(F("📥 Resposta Telemetria [HTTP "));
  Serial.print(statusCode);
  Serial.println(F("]: ") + response);
}

// ---------------------------------------------------------------------------
// 2. Consulta de Comandos Pendentes (GET /api/scooters/:deviceId/commands?status=pending)
// ---------------------------------------------------------------------------
void pollPendingCommands() {
  String path = "/api/scooters/";
  path += DEVICE_ID;
  path += "/commands?status=pending";

  Serial.println(F("🔍 [GET] Verificando fila de comandos pendentes no servidor..."));
  httpClient.beginRequest();
  httpClient.get(path);
  httpClient.sendHeader("X-Device-Key", DEVICE_KEY);
  httpClient.endRequest();

  int statusCode = httpClient.responseStatusCode();
  String response = httpClient.responseBody();

  if (statusCode != 200) {
    Serial.print(F("⚠️ Erro ao consultar comandos: HTTP "));
    Serial.println(statusCode);
    return;
  }

  StaticJsonDocument<1024> doc;
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.println(F("⚠️ Erro no parse JSON de comandos"));
    return;
  }

  JsonArray commands = doc["commands"].as<JsonArray>();
  if (commands.size() == 0) {
    Serial.println(F("ℹ️ Nenhum comando pendente na fila."));
    return;
  }

  for (JsonObject cmd : commands) {
    const char* cmdId = cmd["id"];
    const char* cmdType = cmd["type"];
    Serial.print(F("⚡ Executando comando recebido ["));
    Serial.print(cmdId);
    Serial.print(F("]: "));
    Serial.println(cmdType);

    String executionMsg = executeScooterCommand(cmdType);

    // 3. Enviar confirmação de execução (ACK)
    acknowledgeCommand(cmdId, "executed", executionMsg);
  }
}

// ---------------------------------------------------------------------------
// 3. Execução de Comandos Físicos na Scooter
// ---------------------------------------------------------------------------
String executeScooterCommand(const char* type) {
  String msg = "Comando processado";

  if (strcmp(type, "start") == 0) {
    digitalWrite(PIN_RELAY_IGNITION, HIGH);
    isScooterOn = true;
    msg = "Scooter ligada com sucesso";
  }
  else if (strcmp(type, "stop") == 0) {
    digitalWrite(PIN_RELAY_IGNITION, LOW);
    isScooterOn = false;
    msg = "Scooter desligada com sucesso";
  }
  else if (strcmp(type, "headlight_on") == 0) {
    digitalWrite(PIN_RELAY_HEADLIGHT, HIGH);
    isHeadlightOn = true;
    msg = "Farol ligado";
  }
  else if (strcmp(type, "headlight_off") == 0) {
    digitalWrite(PIN_RELAY_HEADLIGHT, LOW);
    isHeadlightOn = false;
    msg = "Farol desligado";
  }
  else if (strcmp(type, "turn_left_on") == 0) {
    digitalWrite(PIN_TURN_LEFT, HIGH);
    digitalWrite(PIN_TURN_RIGHT, LOW);
    msg = "Seta esquerda ativada";
  }
  else if (strcmp(type, "turn_right_on") == 0) {
    digitalWrite(PIN_TURN_RIGHT, HIGH);
    digitalWrite(PIN_TURN_LEFT, LOW);
    msg = "Seta direita ativada";
  }
  else if (strcmp(type, "turn_off") == 0) {
    digitalWrite(PIN_TURN_LEFT, LOW);
    digitalWrite(PIN_TURN_RIGHT, LOW);
    msg = "Setas desligadas";
  }
  else if (strcmp(type, "horn") == 0) {
    digitalWrite(PIN_HORN_BUZZER, HIGH);
    delay(400);
    digitalWrite(PIN_HORN_BUZZER, LOW);
    msg = "Buzina acionada (beep duplo)";
  }
  else if (strcmp(type, "theft_mode_on") == 0) {
    isTheftMode = true;
    msg = "Modo Roubo ATIVADO! Rastreamento em alta frequência (1s)";
  }
  else if (strcmp(type, "theft_mode_off") == 0) {
    isTheftMode = false;
    msg = "Modo Roubo desativado";
  }

  Serial.println("✅ " + msg);
  return msg;
}

// ---------------------------------------------------------------------------
// 4. Confirmação de Execução (POST /api/commands/:id/ack)
// ---------------------------------------------------------------------------
void acknowledgeCommand(const char* commandId, const char* status, String message) {
  String path = "/api/commands/";
  path += commandId;
  path += "/ack";

  StaticJsonDocument<256> doc;
  doc["status"] = status;
  doc["executedAt"] = "2026-08-27T14:35:08Z";
  doc["message"] = message;

  String jsonBody;
  serializeJson(doc, jsonBody);

  Serial.println("📬 Enviando ACK do comando " + String(commandId) + "...");
  httpClient.beginRequest();
  httpClient.post(path);
  httpClient.sendHeader("Content-Type", "application/json");
  httpClient.sendHeader("X-Device-Key", DEVICE_KEY);
  httpClient.sendHeader("Content-Length", jsonBody.length());
  httpClient.beginBody();
  httpClient.print(jsonBody);
  httpClient.endRequest();

  int statusCode = httpClient.responseStatusCode();
  String response = httpClient.responseBody();
  Serial.print(F("📥 ACK Resposta [HTTP "));
  Serial.print(statusCode);
  Serial.println(F("]: ") + response);
}
`;
}
