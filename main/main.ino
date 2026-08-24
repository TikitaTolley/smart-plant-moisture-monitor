constexpr int moisturePin = 34;
constexpr int redPin = 25;
constexpr int greenPin = 26;
constexpr int bluePin = 27;

constexpr int dryThreshold = 3000;
constexpr int moistThreshold = 2000;

void setColour(int red, int green, int blue) {
  analogWrite(redPin, red);
  analogWrite(greenPin, green);
  analogWrite(bluePin, blue);
}

void setup() {
  Serial.begin(115200);

  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);

  Serial.println("Smart Plant Moisture Monitor ready");
}

void loop() {
  const int moisture = analogRead(moisturePin);
  Serial.println(moisture);

  if (moisture > dryThreshold) {
    setColour(255, 0, 0);     // Dry: red
  } else if (moisture > moistThreshold) {
    setColour(255, 100, 0);   // Getting dry: orange
  } else {
    setColour(0, 255, 0);     // Moist: green
  }

  delay(50);
}
