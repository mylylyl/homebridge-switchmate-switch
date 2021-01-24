import {
	Service,
	PlatformAccessory,
	CharacteristicValue,
	CharacteristicEventTypes,
	CharacteristicSetCallback,
	CharacteristicGetCallback,
} from 'homebridge';

import { SwitchmateSwitchPlatform } from './platform';

import { SwitchmateDevice } from './switchmateDevice';

// battery level below 10% is considered low battery
const LOW_BATTERY_LEVEL = 10;

// refresh every 10 seconds
// TODO: set through configuration
const REFRESH_RATE = 10;

// dummy replica of HAP.ChargingState
enum CHARGING_STATE {
	NOT_CHARGING = 0,
	CHARGING = 1,
	NOT_CHARGEABLE = 2
}

// dummy replica of HAP.LowBattery
enum LOW_BATTERY {
	NORMAL = 0,
	LOW = 1
}

export class SwitchAccessory {
	private service: Service;
	private batteryService: Service;

	// off -> 0
	// on -> 1
	private switchState = 0;

	private batteryState = {
		level: 100,
		charging: CHARGING_STATE.NOT_CHARGEABLE,
		low_battery: LOW_BATTERY.NORMAL,
	};

	constructor(
		private readonly platform: SwitchmateSwitchPlatform,
		private readonly accessory: PlatformAccessory,
		private readonly switchmateDevice: SwitchmateDevice,
	) {
		// setup switch service
		this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
		this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.switchState);
		this.service
			.getCharacteristic(this.platform.Characteristic.On)
			.on(CharacteristicEventTypes.GET, this.getState.bind(this))
			.on(CharacteristicEventTypes.SET, this.setState.bind(this));

		// setup battery service
		this.batteryService = this.accessory.getService(this.platform.Service.BatteryService) || this.accessory.addService(this.platform.Service.BatteryService);
		this.batteryService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name + ' Battery');
		this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel).updateValue(this.batteryState.level);
		this.batteryService.getCharacteristic(this.platform.Characteristic.ChargingState).updateValue(this.batteryState.charging);
		this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery).updateValue(this.batteryState.low_battery);
		this.batteryService
			.getCharacteristic(this.platform.Characteristic.BatteryLevel)
			.on(CharacteristicEventTypes.GET, this.getBatteryLevel.bind(this));
		this.batteryService
			.getCharacteristic(this.platform.Characteristic.ChargingState)
			.on(CharacteristicEventTypes.GET, this.getChargingState.bind(this));
		this.batteryService
			.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
			.on(CharacteristicEventTypes.GET, this.getLowBatteryState.bind(this));

		// set accessory information
		this.switchmateDevice.getInfomationCharacteristics()
			.then((deviceInformation) => {
				this.platform.log.debug(`accessory ${this.accessory.displayName} successfully gets device information`);

				this.accessory.getService(this.platform.Service.AccessoryInformation)!
					.setCharacteristic(this.platform.Characteristic.Manufacturer, deviceInformation.manufacturer)
					.setCharacteristic(this.platform.Characteristic.Model, deviceInformation.model)
					.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id) // use mac address as serial number
					.setCharacteristic(this.platform.Characteristic.HardwareRevision, deviceInformation.hardwareRevision)
					.setCharacteristic(this.platform.Characteristic.FirmwareRevision, deviceInformation.firmwareRevision);

				void this.poll();
			})
			.catch((error) => this.platform.log.error(`accessory ${this.accessory.displayName} failed to get device information: ${error}`));
	}

	private getState(callback: CharacteristicGetCallback): void {
		callback(null, this.switchState === 1 ? true : false);
	}

	private setState(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
		this.platform.log.info(`setting ${this.accessory.displayName} state to ${(value as boolean) ? 'on' : 'off'}`);

		const numberedState = (value as boolean) ? 1 : 0;

		this.switchmateDevice.getTargetState()
			.then((targetState) => {
				// only change when we need to
				if (targetState !== numberedState) {
					return this.switchmateDevice.setTargetState(numberedState);
				}
			})
			.then(() => {
				this.platform.log.debug(`${this.accessory.displayName} successfully set state to ${numberedState ? 'on' : 'off'}`);
				this.switchState = numberedState;
				callback(null);
			})
			.catch((error) => {
				this.platform.log.error(`${this.accessory.displayName} failed to set state: ${error}`);
				callback(new Error(error));
			});
	}

	private getBatteryLevel(callback: CharacteristicGetCallback): void {
		callback(null, this.batteryState.level);
	}

	private getChargingState(callback: CharacteristicGetCallback): void {
		callback(null, this.batteryState.charging);
	}

	private getLowBatteryState(callback: CharacteristicGetCallback): void {
		callback(null, this.batteryState.low_battery);
	}

	private async poll() {
		// Loop forever.
		for (; ;) {
			this.platform.log.debug(`${this.accessory.displayName} started polling`);

			const initialized = await this.switchmateDevice.initialize().catch((error) => {
				this.platform.log.error(`${this.accessory.displayName} failed to initialize: ${error}`);
				return false;
			});
			if (!initialized) {
				await this.sleep(REFRESH_RATE);
				continue;
			}

			this.batteryState.level = await this.switchmateDevice.getBatteryLevel().catch((error) => {
				this.platform.log.error(`${this.accessory.displayName} failed to get battery level: ${error}`);
				return 0;
			});
			this.platform.log.debug(`setting ${this.accessory.displayName} battery level to ${this.batteryState.level}`);
			this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel).updateValue(this.batteryState.level);
		

			if (this.batteryState.level <= LOW_BATTERY_LEVEL) {
				this.batteryState.low_battery = LOW_BATTERY.LOW;
			} else {
				this.batteryState.low_battery = LOW_BATTERY.NORMAL;
			}
			this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery).updateValue(this.batteryState.low_battery);

			this.switchState = await this.switchmateDevice.getCurrentState().catch((error) => {
				this.platform.log.error(`${this.accessory.displayName} failed to get switch state: ${error}`);
				return 0;
			});
			this.platform.log.debug(`updating ${this.accessory.displayName} switch state to ${this.switchState === 1 ? 'on' : 'off'}`);
			this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(this.switchState);

			this.platform.log.debug(`${this.accessory.displayName} done polling`);

			// Sleep until our next update.
			await this.sleep(REFRESH_RATE);
		}
	}

	// Emulate a sleep function.
	private sleep(s: number): Promise<NodeJS.Timeout> {
		return new Promise(resolve => setTimeout(resolve, s * 1000));
	}

}
