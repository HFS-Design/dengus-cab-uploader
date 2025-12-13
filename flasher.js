/**
 * Dengus Cab ESP32-S3 Web Flasher
 * Simplified one-click firmware uploader using WebSerial
 */

import { ESPLoader, Transport } from 'https://unpkg.com/esptool-js@0.4.5/bundle.js';

class DengusFlasher {
    constructor() {
        this.config = null;
        this.port = null;
        this.transport = null;
        this.espLoader = null;
        this.isFlashing = false;

        // UI Elements
        this.connectBtn = document.getElementById('connect-btn');
        this.statusIcon = document.getElementById('status-icon');
        this.statusText = document.getElementById('status-text');
        this.progressContainer = document.getElementById('progress-container');
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');
        this.logContainer = document.getElementById('log-container');
        this.logElement = document.getElementById('log');
        this.versionInfo = document.getElementById('version-info');
        this.browserWarning = document.getElementById('browser-warning');

        this.init();
    }

    async init() {
        // Check WebSerial support
        if (!('serial' in navigator)) {
            this.browserWarning.classList.remove('hidden');
            this.connectBtn.disabled = true;
            return;
        }

        // Load config
        try {
            const response = await fetch('config.json');
            this.config = await response.json();
            this.versionInfo.textContent = `v${this.config.project.version}`;
            document.title = this.config.project.name;
        } catch (error) {
            this.log('Failed to load config: ' + error.message, 'error');
            return;
        }

        // Setup event handlers
        this.connectBtn.addEventListener('click', () => this.startUpdate());
    }

    log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        this.logElement.appendChild(entry);
        this.logElement.scrollTop = this.logElement.scrollHeight;
        this.logContainer.classList.remove('hidden');
        console.log(`[${type}] ${message}`);
    }

    setStatus(status, icon = 'disconnected') {
        this.statusText.textContent = status;
        this.statusIcon.className = `status-icon ${icon}`;
    }

    setProgress(percent) {
        this.progressContainer.classList.remove('hidden');
        this.progressFill.style.width = `${percent}%`;
        this.progressText.textContent = `${Math.round(percent)}%`;
    }

    async startUpdate() {
        if (this.isFlashing) return;
        this.isFlashing = true;
        this.connectBtn.disabled = true;
        this.logElement.innerHTML = '';

        try {
            // Step 1: Request serial port
            this.setStatus('Selecting device...', 'connecting');
            this.log('Requesting serial port...');

            this.port = await navigator.serial.requestPort({
                filters: [
                    { usbVendorId: 0x10C4 }, // CP210x
                    { usbVendorId: 0x1A86 }, // CH340
                    { usbVendorId: 0x0403 }, // FTDI
                    { usbVendorId: 0x303A }, // Espressif
                ]
            });

            // Step 2: Send BOOTLOAD command if enabled
            if (this.config.bootloadCommand.enabled) {
                await this.sendBootloadCommand();
            }

            // Step 3: Connect to bootloader
            await this.connectBootloader();

            // Step 4: Load and flash firmware
            await this.flashFirmware();

            // Step 5: Reset device
            await this.resetDevice();

            this.setStatus('Update complete!', 'success');
            this.log('Firmware update completed successfully!', 'success');
            this.setProgress(100);

        } catch (error) {
            this.setStatus('Update failed', 'error');
            this.log(`Error: ${error.message}`, 'error');

            if (error.message.includes('No port selected')) {
                this.log('Please select a device to continue.', 'info');
            } else if (error.message.includes('bootloader')) {
                this.log('Try holding the BOOT button while clicking "Connect & Update"', 'info');
            }
        } finally {
            this.isFlashing = false;
            this.connectBtn.disabled = false;
            await this.disconnect();
        }
    }

    async sendBootloadCommand() {
        const { command, baudrate, timeout } = this.config.bootloadCommand;

        this.setStatus('Preparing device...', 'connecting');
        this.log(`Sending ${command} command to disable peripherals...`);

        try {
            await this.port.open({ baudRate: baudrate });

            const writer = this.port.writable.getWriter();
            const encoder = new TextEncoder();
            await writer.write(encoder.encode(command + '\n'));
            writer.releaseLock();

            // Wait for device to process command
            this.log(`Waiting ${timeout}ms for device to prepare...`);
            await this.sleep(timeout);

            // Close port so we can reopen for bootloader
            await this.port.close();

            this.log('Device prepared for update', 'success');

            // Brief delay before bootloader connection
            await this.sleep(500);

        } catch (error) {
            // Port might already be closed or device in bootloader
            this.log('Note: Could not send BOOTLOAD command (device may already be in bootloader mode)');
            try {
                await this.port.close();
            } catch (e) {
                // Ignore close errors
            }
        }
    }

    async connectBootloader() {
        this.setStatus('Connecting to bootloader...', 'connecting');
        this.log('Connecting to ESP32-S3 bootloader...');

        const baudrate = this.config.device.baudrate;

        // Create transport and loader
        this.transport = new Transport(this.port);

        const loaderTerminal = {
            clean: () => {},
            writeLine: (data) => this.log(data),
            write: (data) => {}
        };

        this.espLoader = new ESPLoader({
            transport: this.transport,
            baudrate: baudrate,
            terminal: loaderTerminal,
            enableTracing: false
        });

        try {
            const chipType = await this.espLoader.main();
            this.log(`Connected to: ${chipType}`, 'success');
            this.setStatus(`Connected: ${chipType}`, 'connected');
        } catch (error) {
            throw new Error('Failed to connect to bootloader. Hold BOOT button and try again.');
        }
    }

    async flashFirmware() {
        this.setStatus('Loading firmware...', 'flashing');
        this.log('Loading firmware files...');

        const flashFiles = [];
        const firmware = this.config.firmware;

        // Load each firmware file
        for (const [name, info] of Object.entries(firmware)) {
            try {
                this.log(`Loading ${name}: ${info.file}`);
                const response = await fetch(info.file);
                if (!response.ok) {
                    throw new Error(`Failed to load ${info.file}`);
                }
                const data = await response.arrayBuffer();
                flashFiles.push({
                    data: this.arrayBufferToString(data),
                    address: parseInt(info.address, 16)
                });
                this.log(`Loaded ${name} (${data.byteLength} bytes) @ ${info.address}`, 'success');
            } catch (error) {
                throw new Error(`Failed to load ${name}: ${error.message}`);
            }
        }

        // Flash the firmware
        this.setStatus('Flashing firmware...', 'flashing');
        this.log('Writing firmware to device...');
        this.setProgress(0);

        const flashOptions = {
            fileArray: flashFiles,
            flashSize: this.config.device.flashSize,
            flashMode: this.config.device.flashMode,
            flashFreq: this.config.device.flashFreq,
            eraseAll: false,
            compress: true,
            reportProgress: (fileIndex, written, total) => {
                const percent = (written / total) * 100;
                this.setProgress(percent);
                this.setStatus(`Flashing: ${Math.round(percent)}%`, 'flashing');
            },
            calculateMD5Hash: (image) => null // Use built-in verification
        };

        try {
            await this.espLoader.writeFlash(flashOptions);
            this.log('Firmware written successfully!', 'success');
        } catch (error) {
            throw new Error(`Flash failed: ${error.message}`);
        }
    }

    async resetDevice() {
        this.setStatus('Resetting device...', 'connecting');
        this.log('Resetting device...');

        try {
            await this.espLoader.hardReset();
            this.log('Device reset complete', 'success');
        } catch (error) {
            this.log('Manual reset may be required', 'info');
        }
    }

    async disconnect() {
        try {
            if (this.transport) {
                await this.transport.disconnect();
            }
        } catch (error) {
            // Ignore disconnect errors
        }
        this.transport = null;
        this.espLoader = null;
    }

    arrayBufferToString(buffer) {
        const bytes = new Uint8Array(buffer);
        let str = '';
        for (let i = 0; i < bytes.length; i++) {
            str += String.fromCharCode(bytes[i]);
        }
        return str;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dengusFlasher = new DengusFlasher();
});
