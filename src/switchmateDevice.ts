import { Logger } from 'homebridge';
import noble from '@abandonware/noble';

// device information
const INFO_SERVICE_UUID = '180a';
const INFO_MANUFACTURER_CHARACTERISTIC_UUID = '2a29';
const INFO_MODEL_CHARACTERISTIC_UUID = '2a24';
const INFO_HARDWARE_REVISION_CHARACTERISTIC_UUID = '2a27';
const INFO_FIRMWARE_REVISION_CHARACTERISTIC_UUID = '2a26';
// battery
const BATTERY_SERVICE_UUID = '180f';
const BATTERY_LEVEL_CHARACTERISTIC_UUID = '2a19';
// power control
const POWER_SERVICE_UUID = 'a22bd383ebdd49acb2e740eb55f5d0ab';
const POWER_CURRENT_CHARACTERISTIC_UUID = 'a22b0070ebdd49acb2e740eb55f5d0ab';
const POWER_TARGET_CHARACTERISTIC_UUID = 'a22b0090ebdd49acb2e740eb55f5d0ab';
// timeout
const DEFAULT_TIMEOUT = 15000; // 15s

export interface SwitchmateDeviceInformation {
	manufacturer: string;
	model: string;
	hardwareRevision: string;
	firmwareRevision: string;
}

export class SwitchmateDevice {
	private log: Logger;
	private peripheral: noble.Peripheral;

	private characteristics: {
		battery: noble.Characteristic | null;
		power: {
			current: noble.Characteristic | null;
			target: noble.Characteristic | null;
		};
	};

	private connected = false;
	private initialized = false;

	constructor(log: Logger, peripheral: noble.Peripheral) {
		this.log = log;
		this.peripheral = peripheral;

		this.characteristics = {
			battery: null,
			power: {
				current: null,
				target: null,
			},
		};
	}

	initialize(): Promise<boolean> {
		if (!this.connected) {
			this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is not connected`);
			return this.connect().then(() => this.initialize());
		}

		if (!this.initialized) {
			this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is not initialized`);
			return this.getCharacteristics().then(() => this.initialize());
		}

		this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} finished initialize`);
		return new Promise((resolve) => resolve(true));
	}

	private connect(): Promise<void> {
		// Check the connection state
		const state = this.peripheral.state;
		if (state === 'connected') {
			this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is already connected`);
			this.connected = true;
			return new Promise((resolve) => resolve());
		}

		this.peripheral.once('disconnect', () => {
			this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} disconnected`);
			this.peripheral.removeAllListeners();
			this.connected = false;
			this.initialized = false;
			this.characteristics = {
				battery: null,
				power: {
					current: null,
					target: null,
				},
			};
		});

		return Promise.race([
			this.peripheral.connectAsync(),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), DEFAULT_TIMEOUT)),
		]).then(() => {
			this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is connected`);
			this.connected = true;
			return new Promise<void>(resolve => resolve());
		}).catch((error) => {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to connect ${error}`);
			return new Promise((_, reject) => reject(new Error(error)));
		});
	}

	async getInfomationCharacteristics(): Promise<SwitchmateDeviceInformation> {
		if (!this.connected) {
			this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is not connected to get info characteristics`);
			return this.initialize().then(() => this.getInfomationCharacteristics());
		}

		const deviceInfo: SwitchmateDeviceInformation = {
			manufacturer: 'Default Manufacturer',
			model: 'Default Model',
			hardwareRevision: 'Default Hardware Revision',
			firmwareRevision: 'Default Firmware Revision',
		};

		this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is getting information services`);

		const services: noble.Service[] = await Promise.race([
			this.peripheral.discoverServicesAsync([INFO_SERVICE_UUID]),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), DEFAULT_TIMEOUT)),
		]).then((ret) => {
			if (ret && Array.isArray(ret)) {
				this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is discovering info services as array`);
				return (ret as noble.Service[]);
			}
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to discover info services as array`);
			return [];
		}).catch((error) => {
			this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} failed to discover info services: ${error}`);
			return [];
		});

		if (services.length !== 1 || services[0].uuid !== INFO_SERVICE_UUID) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} has invalid info services`);
			return deviceInfo;
		}

		this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is getting information characteristics`);

		const characteristics: noble.Characteristic[] = await Promise.race([
			services[0].discoverCharacteristicsAsync(),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), DEFAULT_TIMEOUT)),
		]).then((ret) => {
			if (ret && Array.isArray(ret)) {
				this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is discovering info characteristics as array`);
				return (ret as noble.Characteristic[]);
			}
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to discover info characteristics as array`);
			return [];
		}).catch((error) => {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to discover info characteristics: ${error}`);
			return [];
		});

		if (characteristics.length !== 5) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} has invalid info characteristics`);
			return deviceInfo;
		}

		for (const characteristic of characteristics) {
			if (characteristic.uuid === INFO_MANUFACTURER_CHARACTERISTIC_UUID) {
				deviceInfo.manufacturer = await characteristic.readAsync()
					.then((buffer) => {
						if (buffer instanceof Buffer) {
							this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is reading INFO_MANUFACTURER_CHARACTERISTIC_UUID as buffer`);
							return buffer.toString();
						}
						this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read INFO_MANUFACTURER_CHARACTERISTIC_UUID as buffer`);
						return deviceInfo.manufacturer;
					}).catch((error) => {
						this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read INFO_MANUFACTURER_CHARACTERISTIC_UUID: ${error}`);
						return deviceInfo.manufacturer;
					});
				continue;
			}
			if (characteristic.uuid === INFO_MODEL_CHARACTERISTIC_UUID) {
				deviceInfo.model = await characteristic.readAsync()
					.then((buffer) => {
						if (buffer instanceof Buffer) {
							this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is reading INFO_MODEL_CHARACTERISTIC_UUID as buffer`);
							return buffer.toString();
						}
						this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read INFO_MODEL_CHARACTERISTIC_UUID as buffer`);
						return deviceInfo.manufacturer;
					}).catch((error) => {
						this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read INFO_MODEL_CHARACTERISTIC_UUID: ${error}`);
						return deviceInfo.manufacturer;
					});
				continue;
			}
			if (characteristic.uuid === INFO_HARDWARE_REVISION_CHARACTERISTIC_UUID) {
				deviceInfo.hardwareRevision = await characteristic.readAsync()
					.then((buffer) => {
						if (buffer instanceof Buffer) {
							this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is reading INFO_HARDWARE_REVISION_CHARACTERISTIC_UUID as buffer`);
							return buffer.toString();
						}
						this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read INFO_HARDWARE_REVISION_CHARACTERISTIC_UUID as buffer`);
						return deviceInfo.manufacturer;
					}).catch((error) => {
						this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read INFO_HARDWARE_REVISION_CHARACTERISTIC_UUID: ${error}`);
						return deviceInfo.manufacturer;
					});
				continue;
			}
			if (characteristic.uuid === INFO_FIRMWARE_REVISION_CHARACTERISTIC_UUID) {
				deviceInfo.firmwareRevision = await characteristic.readAsync()
					.then((buffer) => {
						if (buffer instanceof Buffer) {
							this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is reading INFO_FIRMWARE_REVISION_CHARACTERISTIC_UUID as buffer`);
							return buffer.toString();
						}
						this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read INFO_FIRMWARE_REVISION_CHARACTERISTIC_UUID as buffer`);
						return deviceInfo.manufacturer;
					}).catch((error) => {
						this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read INFO_FIRMWARE_REVISION_CHARACTERISTIC_UUID: ${error}`);
						return deviceInfo.manufacturer;
					});
				continue;
			}
		}

		return deviceInfo;
	}

	private async getCharacteristics(): Promise<void> {
		if (!this.connected) {
			this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is not connected to get characteristics`);
			return this.connect().then(() => this.getCharacteristics());
		}

		if (this.initialized) {
			this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is initialized already`);
			return new Promise(resolve => resolve());
		}

		this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is getting services`);

		const services: noble.Service[] = await Promise.race([
			this.peripheral.discoverServicesAsync([BATTERY_SERVICE_UUID, POWER_SERVICE_UUID]),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), DEFAULT_TIMEOUT)),
		]).then((ret) => {
			if (ret && Array.isArray(ret)) {
				this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is discovering services as array`);
				return (ret as noble.Service[]);
			}
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to discover services as array`);
			return [];
		}).catch((error) => {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to discover services: ${error}`);
			return [];
		});

		if (services.length !== 2 || services[0].uuid !== BATTERY_SERVICE_UUID || services[1].uuid !== POWER_SERVICE_UUID) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} has invalid services`);
			return new Promise((_, reject) => reject(new Error('invalid services')));
		}

		this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is getting battery characteristics`);

		const batteryCharacteristics: noble.Characteristic[] = await Promise.race([
			services[0].discoverCharacteristicsAsync([BATTERY_LEVEL_CHARACTERISTIC_UUID]),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), DEFAULT_TIMEOUT)),
		]).then((ret) => {
			if (ret && Array.isArray(ret)) {
				this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is discovering battery characteristics as array`);
				return (ret as noble.Characteristic[]);
			}
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to discover battery characteristics as array`);
			return [];
		}).catch((error) => {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to discover battery characteristics: ${error}`);
			return [];
		});

		if (batteryCharacteristics.length !== 1 || batteryCharacteristics[0].uuid !== BATTERY_LEVEL_CHARACTERISTIC_UUID) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} has invalid battery characteristics`);
			return new Promise((_, reject) => reject(new Error('invalid battery characteristics')));
		}

		this.characteristics.battery = batteryCharacteristics[0];

		this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is getting power characteristics`);

		const powerCharacteristics: noble.Characteristic[] = await Promise.race([
			services[1].discoverCharacteristicsAsync([POWER_CURRENT_CHARACTERISTIC_UUID, POWER_TARGET_CHARACTERISTIC_UUID]),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), DEFAULT_TIMEOUT)),
		]).then((ret) => {
			if (ret && Array.isArray(ret)) {
				this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is discovering power characteristics as array`);
				return (ret as noble.Characteristic[]);
			}
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to discover power characteristics as array`);
			return [];
		}).catch((error) => {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to discover power characteristics: ${error}`);
			return [];
		});

		if (powerCharacteristics.length !== 2) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} has invalid power characteristics`);
			return new Promise((_, reject) => reject(new Error('invalid power characteristics')));
		}

		for (const characteristic of powerCharacteristics) {
			switch (characteristic.uuid) {
				case POWER_CURRENT_CHARACTERISTIC_UUID:
					this.characteristics.power.current = characteristic;
					break;
				case POWER_TARGET_CHARACTERISTIC_UUID:
					this.characteristics.power.target = characteristic;
					break;
				default:
					break;
			}
		}

		this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} has successfully get all characteristics`);
		this.initialized = true;

		return new Promise(resolve => resolve());
	}

	getBatteryLevel(): Promise<number> {
		if (!this.connected) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} is not connected for getBatteryLevel`);
			return this.initialize().then(() => this.getBatteryLevel());
		}

		if (!this.initialized) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} is not initialized for getBatteryLevel`);
			return this.getCharacteristics().then(() => this.getBatteryLevel());
		}

		if (!this.characteristics.battery) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} has invalid battery characteristic`);
			return new Promise((_, reject) => reject(new Error('invalid battery characteristic')));
		}

		return Promise.race([
			this.characteristics.battery.readAsync(),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), DEFAULT_TIMEOUT)),
		]).then((buffer) => {
			if (buffer instanceof Buffer) {
				this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is reading battery as buffer`);
				return buffer[0];
			}
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read battery as buffer`);
			return new Promise<number>((_, reject) => reject(new Error('failed to read as buffer')));
		}).catch((error) => {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read battery: ${error}`);
			return new Promise((_, reject) => reject(new Error(error)));
		});
	}

	getCurrentState(): Promise<number> {
		if (!this.connected) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} is not connected for getCurrentState`);
			return this.initialize().then(() => this.getCurrentState());
		}

		if (!this.initialized) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} is not initialized for getCurrentState`);
			return this.getCharacteristics().then(() => this.getCurrentState());
		}

		if (!this.characteristics.power.current) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} has invalid current state characteristic`);
			return new Promise((_, reject) => reject(new Error('invalid current state characteristic')));
		}

		return Promise.race([
			this.characteristics.power.current.readAsync(),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), DEFAULT_TIMEOUT)),
		]).then((buffer) => {
			if (buffer instanceof Buffer) {
				this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is reading current state as buffer`);
				return buffer[0];
			}
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read current state as buffer`);
			return new Promise<number>((_, reject) => reject(new Error('failed to read as buffer')));
		}).catch((error) => {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read current state: ${error}`);
			return new Promise((_, reject) => reject(new Error(error)));
		});
	}

	getTargetState(): Promise<number> {
		if (!this.connected) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} is not connected for getTargetState`);
			return this.initialize().then(() => this.getTargetState());
		}

		if (!this.initialized) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} is not initialized for getTargetState`);
			return this.getCharacteristics().then(() => this.getTargetState());
		}

		if (!this.characteristics.power.target) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} has invalid target state characteristic`);
			return new Promise((_, reject) => reject(new Error('invalid target state characteristic')));
		}

		return Promise.race([
			this.characteristics.power.target.readAsync(),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), DEFAULT_TIMEOUT)),
		]).then((buffer) => {
			if (buffer instanceof Buffer) {
				this.log.debug(`peripheral ${this.peripheral.id.toLowerCase()} is reading target state as buffer`);
				return buffer[0];
			}
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read target state as buffer`);
			return new Promise<number>((_, reject) => reject(new Error('failed to read as buffer')));
		}).catch((error) => {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to read target state: ${error}`);
			return new Promise((_, reject) => reject(new Error(error)));
		});
	}

	setTargetState(state: number): Promise<void> {
		if (!this.connected) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} is not connected for setTargetState`);
			return this.initialize().then(() => this.setTargetState(state));
		}

		if (!this.initialized) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} is not initialized for setTargetState`);
			return this.getCharacteristics().then(() => this.setTargetState(state));
		}

		if (!this.characteristics.power.target) {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} has invalid target state characteristic`);
			return new Promise((_, reject) => reject(new Error('invalid target state characteristic')));
		}

		return Promise.race([
			this.characteristics.power.target.writeAsync(Buffer.from([state]), false),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), DEFAULT_TIMEOUT)),
		]).then(() => {
			return new Promise<void>(resolve => resolve());
		}).catch((error) => {
			this.log.error(`peripheral ${this.peripheral.id.toLowerCase()} failed to set target state: ${error}`);
			return new Promise((_, reject) => reject(new Error(error)));
		});
	}
}