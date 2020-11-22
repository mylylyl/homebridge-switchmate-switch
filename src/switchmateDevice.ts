import { Logger } from 'homebridge';
import noble from '@abandonware/noble';

// device information
const INFO_SERVICE_UUID = '180a';
const INFO_MANUFACTURER_CHARACTERISTIC_UUID = '2a29';
const INFO_SERIAL_CHARACTERISTIC_UUID = '2a25';
const INFO_HARDWARE_REVISION_CHARACTERISTIC_UUID = '2a27';
const INFO_FIRMWARE_REVISION_CHARACTERISTIC_UUID = '2a26';
const INFO_SOFTWARE_REVISION_CHARACTERISTIC_UUID = '2a28';
// battery
const BATTERY_SERVICE_UUID = '180f';
const BATTERY_CHARACTERISTIC_UUID = '2a19';
// power control
const POWER_SERVICE_UUID = 'a22bd383ebdd49acb2e740eb55f5d0ab';
const POWER_WRITE_CHARACTERISTIC_UUID = 'a22b0090ebdd49acb2e740eb55f5d0ab';
const POWER_NOTIFY_CHARACTERISTIC_UUID = 'a22b0070ebdd49acb2e740eb55f5d0ab';
// timeout
const DEFAULT_TIMEOUT = 10000; // 10s

export interface SwitchmateDeviceInformation {
	manufacturer: string;
	serial: string;
	hardwareRevision: string;
	firmwareRevision: string;
	softwareRevision: string;
}

export class SwitchmateDevice {
	private log: Logger;
	private peripheral: noble.Peripheral;

	private characteristics: {
		battery: noble.Characteristic | null;
		motor: {
			state: noble.Characteristic | null;
			target: noble.Characteristic | null;
			control: noble.Characteristic | null;
		};
	};

	private connected = false;
	private initialized = false;

	constructor(log: Logger, peripheral: noble.Peripheral) {
		this.log = log;
		this.peripheral = peripheral;

		this.characteristics = {
			battery: null,
			motor: {
				state: null,
				target: null,
				control: null,
			},
		};
	}

	public connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			// Check the connection state
			const state = this.peripheral.state;
			if (state === 'connected') {
				this.connected = true;
				resolve();
				return;
			} else if (state === 'connecting' || state === 'disconnecting') {
				reject(new Error('current state is ' + state + '. Wait for a few seconds then try again.'));
				return;
			}

			// Set event handlers
			this.peripheral.once('connect', () => {
				this.log.debug('peripheral connected');
				this.connected = true;
			});

			this.peripheral.once('disconnect', () => {
				this.log.debug('peripheral disconnected');
				this.connected = false;
				this.initialized = false;
				this.peripheral.removeAllListeners();
			});

			this.peripheral.connectAsync().then(() => {
				this.connected = true;
				this.log.debug('successfully connect to device');
				return this.getCharacteristics();
			}).then(() => {
				if (this.initialized) {
					this.log.debug('device characteristics is initialized');
					resolve();
				} else {
					reject(new Error('failed to initialize characteristics'));
				}
			}).catch((error) => {
				reject(error);
			});
		});
	}

	async getInfomationCharacteristics(): Promise<SwitchmateDeviceInformation> {
		if (!this.connected) {
			return this.connect().then(() => this.getInfomationCharacteristics());
		}

		this.log.debug('getting information characteristics');

		const deviceInfo: SwitchmateDeviceInformation = {
			manufacturer: 'Default Manufacturer',
			serial: 'Default Serial',
			hardwareRevision: 'Default Hardware Revision',
			firmwareRevision: 'Default Firmware Revision',
			softwareRevision: 'Default Software Revision',
		};

		const services = await this.peripheral.discoverServicesAsync([INFO_SERVICE_UUID]);
		if (!services || services.length !== 1 || services[0].uuid !== INFO_SERVICE_UUID) {
			this.log.error('Invalid service discovered');
			return deviceInfo;
		}

		const characteristics = await services[0].discoverCharacteristicsAsync();
		if (!characteristics || characteristics.length <= 0) {
			this.log.error('Invalid characteristics discovered');
			return deviceInfo;
		}

		for (const characteristic of characteristics) {
			switch (characteristic.uuid) {
				case INFO_MANUFACTURER_CHARACTERISTIC_UUID:
					deviceInfo.manufacturer = (await characteristic.readAsync()).toString();
					break;
				case INFO_SERIAL_CHARACTERISTIC_UUID:
					deviceInfo.serial = (await characteristic.readAsync()).toString();
					break;
				case INFO_HARDWARE_REVISION_CHARACTERISTIC_UUID:
					deviceInfo.hardwareRevision = (await characteristic.readAsync()).toString();
					break;
				case INFO_FIRMWARE_REVISION_CHARACTERISTIC_UUID:
					deviceInfo.firmwareRevision = (await characteristic.readAsync()).toString();
					break;
				case INFO_SOFTWARE_REVISION_CHARACTERISTIC_UUID:
					deviceInfo.softwareRevision = (await characteristic.readAsync()).toString();
					break;
				default:
					break;
			}
		}

		return deviceInfo;
	}

	private async getCharacteristics(): Promise<void> {
		if (this.initialized) {
			this.log.debug('characteristics is inisitalized already');
			return;
		}

		const services = await this.peripheral.discoverServicesAsync([POWER_SERVICE_UUID]);
		if (!services || services.length !== 1 || services[0].uuid !== POWER_SERVICE_UUID) {
			this.log.error('Invalid power services: %s', services.toString());
			return;
		}

		const powerCharacteristics = await services[0].discoverCharacteristicsAsync();
		if (!powerCharacteristics) {
			this.log.error('Invalid power characteristics');
			return;
		}

		this.log.debug('characteristics %d', powerCharacteristics.length);

		for (const characteristic of powerCharacteristics) {
			this.log.debug(characteristic.toString());
		}

		this.log.debug('successfully get characteristics');
		this.initialized = true;
	}

	public disconnect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.connected = false;

			const state = this.peripheral.state;
			if (state === 'disconnected') {
				resolve();
				return;
			} else if (state === 'connecting' || state === 'disconnecting') {
				reject(new Error('Now ' + state + '. Wait for a few seconds then try again.'));
				return;
			}

			return this.peripheral.disconnectAsync();
		});
	}
}