#!/bin/bash

# Dengus Cab Firmware Deployer
# Copies latest firmware from build directory and pushes to GitHub

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIRMWARE_SRC="../m100301-dengus_cab_firmware/.pio/build/esp32-s3-wroom-1-n4"
FIRMWARE_DEST="$SCRIPT_DIR/firmware"

echo "Copying firmware files..."
cp "$SCRIPT_DIR/$FIRMWARE_SRC/bootloader.bin" "$FIRMWARE_DEST/"
cp "$SCRIPT_DIR/$FIRMWARE_SRC/partitions.bin" "$FIRMWARE_DEST/"
cp "$SCRIPT_DIR/$FIRMWARE_SRC/firmware.bin" "$FIRMWARE_DEST/"

echo "Checking for changes..."
cd "$SCRIPT_DIR"

if git diff --quiet firmware/; then
    echo "No firmware changes detected."
    exit 0
fi

echo "Committing changes..."
git add firmware/
git commit -m "Update firmware binary"

echo "Pushing to GitHub..."
git push

echo "Done!"
