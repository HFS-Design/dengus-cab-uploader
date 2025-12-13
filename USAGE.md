# Dengus Cab Web Updater

One-click firmware updater for the Dengus Cab ESP32-S3.

## Quick Start

1. Place your firmware files in the `firmware/` directory:
   - `bootloader.bin` - ESP32-S3 bootloader
   - `partition-table.bin` - Partition table
   - `firmware.bin` - Your application firmware

2. Host the files on a web server (GitHub Pages, Netlify, etc.)

3. Users visit the page, click "Connect & Update", and select their device.

## How It Works

1. User clicks "Connect & Update"
2. Browser prompts for serial device selection
3. Sends `BOOTLOAD` command to prepare device (disables peripherals)
4. Connects to ESP32-S3 bootloader
5. Flashes all firmware files
6. Resets device

## Adding BOOTLOAD Support to Your Firmware

Add this to your ESP32 code to handle the BOOTLOAD command:

```cpp
void setup() {
    Serial.begin(115200);
    // ... your setup code
}

void loop() {
    // Check for BOOTLOAD command
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();

        if (cmd == "BOOTLOAD") {
            Serial.println("BOOTLOAD_ACK");

            // Disable your peripherals here
            // stopMotors();
            // disableDisplay();
            // etc.

            delay(100);
            ESP.restart();
        }
    }

    // ... your loop code
}
```

Or include the provided `bootload_handler.h`:

```cpp
#include "bootload_handler.h"

void loop() {
    BootloadHandler::checkAndReboot();
    // ... your code
}
```

## Configuration

Edit `config.json` to customize:

- `project.name` - Display name
- `device.baudrate` - Flash speed (921600 recommended)
- `bootloadCommand.enabled` - Enable/disable BOOTLOAD command
- `bootloadCommand.timeout` - Wait time after sending command
- `firmware.*` - Firmware file paths and flash addresses

## Browser Support

Requires WebSerial API:
- Chrome 89+
- Edge 89+
- Opera 76+

## Local Testing

Due to CORS, you need a local server:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve
```

Then open http://localhost:8000

## Generating Firmware Files

From PlatformIO:
```bash
pio run
# Files are in .pio/build/your-env/
# - bootloader.bin
# - partitions.bin
# - firmware.bin
```

From Arduino IDE:
- Sketch > Export Compiled Binary
- Use ESP32 Sketch Data Upload for partition table
