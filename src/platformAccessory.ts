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
		this.switchmateDevice.initialize()
			.then(() => this.switchmateDevice.getInfomationCharacteristics())
			.then((deviceInformation) => {
				this.platform.log.debug('successfully get device information');

				this.accessory.getService(this.platform.Service.AccessoryInformation)!
					.setCharacteristic(this.platform.Characteristic.Manufacturer, deviceInformation.manufacturer)
					.setCharacteristic(this.platform.Characteristic.Model, deviceInformation.model)
					.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id) // use mac address as serial number
					.setCharacteristic(this.platform.Characteristic.HardwareRevision, deviceInformation.hardwareRevision)
					.setCharacteristic(this.platform.Characteristic.FirmwareRevision, deviceInformation.firmwareRevision);

				void this.poll();
			})
			.catch((error) => this.platform.log.error('Failed to get device information: %s', error));
	}

	private getState(callback: CharacteristicGetCallback): void {
		callback(null, this.switchState === 1 ? true : false);
	}

	private async setState(value: CharacteristicValue, callback: CharacteristicSetCallback): Promise<void> {
		this.platform.log.debug('setting switch state to %s', value as boolean);

		const numberedState = (value as boolean) ? 1 : 0;

		const targetState = await this.switchmateDevice.getTargetState();
		// only change when we need to
		if (targetState !== numberedState) {
			await this.switchmateDevice.setTargetState(numberedState);
			this.switchState = numberedState;
			this.platform.log.debug('switch state set');
		}

		callback(null);
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
		for (;;) {
			this.platform.log.debug('refreshing...');

			this.batteryState.level = await this.switchmateDevice.getBatteryLevel();
			this.platform.log.debug('setting battery level to %d', this.batteryState.level);
			
			if (this.batteryState.level <= LOW_BATTERY_LEVEL) {
				this.batteryState.low_battery = LOW_BATTERY.LOW;
			} else {
				this.batteryState.low_battery = LOW_BATTERY.NORMAL;
			}

			this.switchState = await this.switchmateDevice.getCurrentState();
			this.platform.log.debug('setting switch state to %d', this.switchState);

			// Sleep until our next update.
			await this.sleep(REFRESH_RATE);
		}
	}

	// Emulate a sleep function.
	private sleep(s: number): Promise<NodeJS.Timeout> {
		return new Promise(resolve => setTimeout(resolve, s * 1000));
	}

}
