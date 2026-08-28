# 🏍️ Scooter Link — Sistema de Rastreamento & Proteção Antifurto para Bike Elétrica

O **Scooter Link** é uma plataforma completa (Frontend + Backend + Firmware ESP32) para rastreamento em tempo real, monitoramento de telemetria e proteção antifurto de bikes e patinetes elétricos equipados com **ESP32**, GPS **NEO-6M** e módulo GSM/GPRS **SIM800L**.

---

## ⚡ Principais Funcionalidades

- **🗺️ Mapa em Tempo Real (OpenStreetMap & Leaflet):**
  - Marcador da bike com emoji 🏍️ sem borda e animação de radar/pulso.
  - Marcador do usuário com 📱 (celular) ou 💻 (computador) e cálculo de distância em metros.
  - Alternância de camadas (Dark High-Tech, Padrão OSM e Satélite).
- **📊 Painel de Informações & Telemetria:**
  - Velocidade atual em km/h e altitude em metros.
  - Rumo / Direção com rosa dos ventos (N, NE, E, SE, S, SO, O, NO).
  - Número de satélites GPS e índice de precisão HDOP.
  - Data e hora sincronizadas no fuso oficial de **Brasília (UTC-3)**.
  - Coordenadas geográficas com botão de cópia rápida e atalho para o Google Maps.
  - Tensão da bateria em Volts e porcentagem estimada com medidor gráfico.
- **🚨 Botão "ROUBO" & Modo Emergência:**
  - Botão vermelho com janela de confirmação de segurança.
  - Ao ser ativado, o ESP32 acelera a transmissão para **1 segundo**.
  - Disparo de alertas imediatos estruturados para **SMS**, **Telegram** e contatos autorizados.
  - Botões de ação rápida: Ligar 190 (Polícia Militar) e compartilhar link de rastreamento ao vivo.
- **🛡️ Cerca Virtual (Geofence):**
  - Criação de perímetros seguros com raios personalizáveis (50m a 500m).
  - Alerta automático quando a bike sai do raio seguro definido.
- **📈 Histórico de Trajetos com Playback:**
  - Player interativo com slider de tempo, controle de velocidade (1x, 2x, 5x) e estatísticas de distância total e velocidade máxima.
- **📱 Contatos Autorizados:**
  - Gerenciamento de números para notificações de emergência via SMS e Telegram Bot.
- **⚙️ Gerador de Firmware ESP32 + Simulador:**
  - Código C++ pronto para gravação no Arduino IDE com reconexão automática e leitura do divisor de tensão da bateria.
  - Simulador de telemetria no navegador para testes sem hardware conectado.

---

## 🔌 Diagrama de Ligação do Hardware

| Componente | Pino no Módulo | Pino no ESP32 | Descrição |
|---|---|---|---|
| **GPS NEO-6M** | VCC | 3.3V / 5V | Alimentação |
| **GPS NEO-6M** | GND | GND | Terra |
| **GPS NEO-6M** | TX | GPIO 16 (RX2) | Serial Hardware 2 |
| **GPS NEO-6M** | RX | GPIO 17 (TX2) | Serial Hardware 2 |
| **SIM800L GSM** | VCC | 3.7V - 4.2V (2A pico) | Bateria 1S ou Step-down |
| **SIM800L GSM** | GND | GND (Comum) | Terra comum com ESP32 |
| **SIM800L GSM** | TXD | GPIO 26 (RX1) | Serial Hardware 1 |
| **SIM800L GSM** | RXD | GPIO 27 (TX1) | Serial Hardware 1 |
| **SIM800L GSM** | RST / DTR | GPIO 4 | Reset do Modem |
| **Bateria (Divisor)** | Saída divisor | GPIO 34 (ADC) | Leitura de Tensão da Bateria |

> 💡 **Nota de Alimentação:** O SIM800L consome picos de até 2A na transmissão GSM. Use um capacitor eletrolítico de 1000µF em paralelo com a alimentação do SIM800L.

---

## 🗄️ Configuração do Banco de Dados: SQLiteCloud

O Scooter Link utiliza **SQLiteCloud** para armazenamento em nuvem de alta performance.

### Como configurar o SQLiteCloud:
1. Crie uma conta gratuita em [https://sqlitecloud.io/](https://sqlitecloud.io/).
2. Crie um novo cluster/banco de dados chamado `scooter_link.db`.
3. Copie sua Connection String no formato:
   ```env
   SQLITECLOUD_CONNECTION_STRING="sqlitecloud://usuario:senha@seu-host.sqlite.cloud:8860/scooter_link.db?apikey=SEU_API_KEY"
   ```
4. Cole a variável no arquivo `.env` da aplicação.
5. As tabelas (`users`, `devices`, `telemetry`, `alerts`, `geofences`, `authorized_contacts`) serão criadas automaticamente na inicialização.

> 🛠️ **Modo Fallback / Desenvolvimento:** Caso `SQLITECLOUD_CONNECTION_STRING` não esteja preenchida, o sistema inicializa um banco em memória automaticamente com dados de demonstração em Brasília para que a aplicação funcione imediatamente sem travas.

---

## 🚀 Como Executar o Projeto Localmente

### 1. Clonar e Instalar Dependências
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```
Preencha `SQLITECLOUD_CONNECTION_STRING` se possuir o cluster no SQLiteCloud.

### 3. Iniciar em Modo de Desenvolvimento
```bash
npm run dev
```
Acesse no navegador: `http://localhost:3000`

### 4. Credenciais Padrão do Painel:
- **E-mail:** `admin@scooterlink.com`
- **Senha:** `admin123`
*(Você também pode clicar no botão "Entrar direto com Conta Demo")*

---

## 📡 Documentação da API REST

### 1. Ingestão de Telemetria (ESP32)
- **Método:** `POST /api/telemetry`
- **Exemplo de Payload JSON:**
```json
{
  "deviceId": "SL-EBIKE-2026",
  "token": "sec_tok_ebike_9843a87f2e",
  "latitude": -15.794200,
  "longitude": -47.882200,
  "speedKmh": 28.4,
  "altitudeMeters": 1172.5,
  "courseDegrees": 285.0,
  "satellites": 11,
  "hdop": 0.85,
  "batteryVoltage": 4.12,
  "theftMode": false,
  "gpsDateTime": "2026-08-25T19:30:00.000Z"
}
```
- **Resposta:**
```json
{
  "success": true,
  "theftMode": false,
  "recommendedIntervalMs": 10000,
  "serverTime": "2026-08-25T19:30:01.000Z"
}
```

### 2. Última Posição Registrada
- **Método:** `GET /api/telemetry/latest?deviceId=SL-EBIKE-2026`

### 3. Histórico de Trajetos
- **Método:** `GET /api/telemetry/history?deviceId=SL-EBIKE-2026&limit=100`

### 4. Ativar / Desativar Modo Roubo
- **Método:** `POST /api/theft-mode`
- **Body:** `{ "deviceId": "SL-EBIKE-2026", "enabled": true }`

### 5. Obter Código Fonte C++ do ESP32
- **Método:** `GET /api/esp32/firmware`

---

## 📲 Conversão para APK (Android)

Como a interface do Scooter Link foi desenhada mobile-first:
1. **PWA (Instalação Direta):** Abra no Google Chrome do celular e clique em "Adicionar à tela de início".
2. **Capacitor / APK nativo:**
   ```bash
   npm run build
   npx cap init "Scooter Link" com.scooterlink.app --web-dir dist
   npx cap add android
   npx cap open android
   ```
   No Android Studio, gere o APK em **Build > Build APK(s)**.

---

## 🔒 Segurança

- Todos os acessos de telemetria exigem token criptográfico de hardware.
- Credenciais e tokens não são expostos no bundle do cliente.
- O ESP32 envia dados autenticados via HTTPS/TLS para a API do backend, e o backend é o único que se comunica com o SQLiteCloud.
