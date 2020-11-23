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
const DEFAULT_TIMEOUT = 10000; // 10s

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
			model: 'Default Model',
			hardwareRevision: 'Default Hardware Revision',
			firmwareRevision: 'Default Firmware Revision',
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
				case INFO_MODEL_CHARACTERISTIC_UUID:
					deviceInfo.model = (await characteristic.readAsync()).toString();
					break;
				case INFO_HARDWARE_REVISION_CHARACTERISTIC_UUID:
					deviceInfo.hardwareRevision = (await characteristic.readAsync()).toString();
					break;
				case INFO_FIRMWARE_REVISION_CHARACTERISTIC_UUID:
					deviceInfo.firmwareRevision = (await characteristic.readAsync()).toString();
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

		const services = await this.peripheral.discoverServicesAsync([BATTERY_SERVICE_UUID, POWER_SERVICE_UUID]);
		if (!services || services.length !== 2 || services[0].uuid !== BATTERY_SERVICE_UUID || services[1].uuid !== POWER_SERVICE_UUID) {
			this.log.error('Invalid services: %s', services.toString());
			return;
		}

		const batteryCharacteristics = await services[0].discoverCharacteristicsAsync([BATTERY_LEVEL_CHARACTERISTIC_UUID]);
		if (!batteryCharacteristics || batteryCharacteristics.length !== 1 || batteryCharacteristics[0].uuid !== BATTERY_LEVEL_CHARACTERISTIC_UUID) {
			this.log.error('Invalid battery characteristics');
			return;
		}

		this.characteristics.battery = batteryCharacteristics[0];

		const powerCharacteristics = await services[1].discoverCharacteristicsAsync([POWER_CURRENT_CHARACTERISTIC_UUID, POWER_TARGET_CHARACTERISTIC_UUID]);
		if (!powerCharacteristics || powerCharacteristics.length !== 2) {
			this.log.error('Invalid power characteristics');
			return;
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

		this.log.debug('successfully get characteristics');
		this.initialized = true;
	}

	async getBatteryLevel(): Promise<number> {
		if (!this.connected) {
			this.log.info('[getBatteryLevel] Peripheral not connected');
			return this.connect().then(() => this.getBatteryLevel()).catch((error) => {
				this.log.error('[getBatteryLevel] failed to get after trying to reconnect: %s', error);
				return 0;
			});
		}

		if (!this.initialized) {
			this.log.error('[getBatteryLevel] Peripheral characteristics not initialized');
			return this.getCharacteristics().then(() => this.getBatteryLevel()).catch((error) => {
				this.log.error('[getBatteryLevel] failed to get after trying to get characteristics: %s', error);
				return 0;
			});
		}

		if (!this.characteristics.battery) {
			this.log.error('[getBatteryLevel] Peripheral characteristic is invalid');
			return 0;
		}

		return Promise.race([
			await this.characteristics.battery.readAsync(),
			new Promise((_, reject) => setTimeout(() => reject(new Error('[getBatteryLevel] timed out')), DEFAULT_TIMEOUT)),
		]).then((buf) => {
			if (buf instanceof Buffer) {
				this.log.debug('[getBatteryLevel] return buf as buffer');
				return (buf as Buffer)[0];
			}
			this.log.error('[getBatteryLevel] return buf as false');
			return 0;
		}).catch((error) => {
			this.log.error('[getBatteryLevel] error: %s', error);
			return 0;
		});
	}

	async getCurrentState(): Promise<number> {
		if (!this.connected) {
			this.log.info('[getCurrentState] Peripheral not connected');
			return this.connect().then(() => this.getCurrentState()).catch((error) => {
				this.log.error('[getCurrentState] failed to get current state after trying to reconnect: %s', error);
				return 0;
			});
		}

		if (!this.initialized) {
			this.log.error('[getCurrentState] Peripheral characteristics not initialized');
			return this.getCharacteristics().then(() => this.getCurrentState()).catch((error) => {
				this.log.error('[getCurrentState] failed to get current state after trying to get characteristics: %s', error);
				return 0;
			});
		}

		if (!this.characteristics.power.current) {
			this.log.error('[getCurrentState] Peripheral characteristics.power.current is invalid');
			return 0;
		}

		return Promise.race([
			await this.characteristics.power.current.readAsync(),
			new Promise((_, reject) => setTimeout(() => reject(new Error('[getCurrentState] timed out')), DEFAULT_TIMEOUT)),
		]).then((buf) => {
			if (buf instanceof Buffer) {
				this.log.debug('[getCurrentState] return buf as buffer');
				return (buf as Buffer)[0];
			}
			this.log.error('[getCurrentState] return buf as false');
			return 0;
		}).catch((error) => {
			this.log.error('[getCurrentState] error: %s', error);
			return 0;
		});
	}

	async getTargetState(): Promise<number> {
		if (!this.connected) {
			this.log.info('[getTargetState] Peripheral not connected');
			return this.connect().then(() => this.getTargetState()).catch((error) => {
				this.log.error('[getTargetState] failed to get target state after trying to reconnect: %s', error);
				return 0;
			});
		}

		if (!this.initialized) {
			this.log.error('[getTargetState] Peripheral characteristics not initialized');
			return this.getCharacteristics().then(() => this.getTargetState()).catch((error) => {
				this.log.error('[getTargetState] failed to get target state after trying to get characteristics: %s', error);
				return 0;
			});
		}

		if (!this.characteristics.power.target) {
			this.log.error('[getTargetState] Peripheral characteristics.power.target is invalid');
			return 0;
		}

		return Promise.race([
			await this.characteristics.power.target.readAsync(),
			new Promise((_, reject) => setTimeout(() => reject(new Error('[getTargetState] timed out')), DEFAULT_TIMEOUT)),
		]).then((buf) => {
			if (buf instanceof Buffer) {
				this.log.debug('[getTargetState] return buf as buffer');
				return (buf as Buffer)[0];
			}
			this.log.error('[getTargetState] return buf as false');
			return 0;
		}).catch((error) => {
			this.log.error('[getTargetState] error: %s', error);
			return 0;
		});
	}

	async setTargetState(state: number): Promise<void> {
		if (!this.connected) {
			this.log.info('[setTargetState] Peripheral not connected');
			return this.connect().then(() => this.setTargetState(state)).catch((error) => {
				this.log.error('[setTargetState] failed to set position after trying to reconnect: %s', error);
			});
		}

		if (!this.initialized) {
			this.log.error('[setTargetState] Peripheral characteristics not initialized');
			return this.getCharacteristics().then(() => this.setTargetState(state)).catch((error) => {
				this.log.error('[setTargetState] failed to set position after trying to get characteristics: %s', error);
			});
		}

		if (!this.characteristics.power.target) {
			this.log.error('[setTargetState] Peripheral characteristics.power.target is invalid');
			return;
		}

		Promise.race([
			await this.characteristics.power.target.writeAsync(Buffer.from([state]), false),
			new Promise((_, reject) => setTimeout(() => reject(new Error('[setTargetState] timed out')), DEFAULT_TIMEOUT)),
		]).catch((error) => this.log.error('[setTargetState] error: %s', error));
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