# Smart Plant Hydration Monitor

> A 3D printed plant stake with an RGB LED. Glows green when the soil is healthy, red when it's dry.

[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=flat&logo=youtube&logoColor=white)][yt]
[![TikTok](https://img.shields.io/badge/TikTok-000000?style=flat&logo=tiktok&logoColor=white)][tt]
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=flat&logo=instagram&logoColor=white)][ig]
[![Wokwi](https://img.shields.io/badge/Wokwi-simulate-2A2A2A?style=flat)][wokwi]

## What it does

A soil moisture probe on a stake you push into the pot. An RGB LED sits at the top and shows hydration at a glance: green for happy, red for water me.

First hardware project.

## Simulated

| Sim | Link | Notes |
| --- | --- | --- |
| Wokwi | [Open][wokwi] | |

## Bill of materials

| Qty | Component | Part | Unit cost | Notes |
| --- | --- | --- | --- | --- |
| 1 | Microcontroller | ESP32 | from kit | 3.3 V logic |
| 1 | Soil moisture sensor | Capacitive v1.2 | £0.48 | 3.3 to 5.5 V in, 0 to 3.0 V out, PH2.0-3P, 98 × 23 mm |
| 1 | RGB LED | 5050, IP30 | from kit | Run at 3.3 V, not 5 V |
| 3 | Resistor | 220 Ω | from kit | |
| 1 | Prototyping board | Perma-Proto half-size | £2.63 | |
| 1 | Header pins | | £0.11 | |
| 1 | USB cable | Micro USB | from kit | |
| 1 | Mains USB plug | | owned | |
| 1 | Enclosure | 3D printed stake | filament | See Enclosure below |
| 1 | Plant | Peace lily | £5 to £8 | |

**Total: ~£3.20** plus the plant and filament.

## Wiring

Everything runs off the ESP32's 3.3 V rail. The sensor and the LED share VCC and GND.

| Component | Pin | MCU connection | Notes |
| --- | --- | --- | --- |
| Soil moisture sensor | VCC | 3V3 | |
| | GND | GND | |
| | AOUT | ADC1 pin, TBD | Not ADC2: those stop working once Wi-Fi is active |
| RGB LED | VCC | 3V3 | Shared with the sensor |
| | GND | GND | Shared with the sensor |
| | DIN | TBD | |

Check sensor's timer chip before powering it: a TLC555 with a 662K regulator is happy at 3.3 V, a bare NE555 with no regulator needs 5 V.

## Enclosure

The sensor case is a print of [danielkrah's Capacitive Soil Moisture Sensor v1.2 Case][printables-vendor]. The four parts I print are in `print/stl/`. 

| File | Part |
| --- | --- |
| `v4-outer-box.stl` | The sleeve |
| `v4-upper-case.stl` | Green half |
| `v4-bottom-case.stl` | Green half |
| `v4-sensor-dummy.stl` | Fit test, so you can check clearances without the real sensor |

His TPU lids and the v5 outer box with mounting holes aren't here. Grab those from [the original][printables-vendor] if you want them.

- Sliced in Bambu Studio for a Bambu P1S
- Filament: PLA

---

All projects at [github.com/TikitaTolley][gh].

[yt]: https://youtube.com/@tikitatech
[tt]: https://tiktok.com/@tikitatech
[ig]: https://instagram.com/tikitatech
[gh]: https://github.com/TikitaTolley

[wokwi]: https://wokwi.com/projects/471268493966479361
[printables-vendor]: https://www.printables.com/model/277601-capacitive-soil-moisture-sensor-v12-case-waterproo
