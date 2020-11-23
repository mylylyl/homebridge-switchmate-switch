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

export class SwitchAccessory {
	private service: Service;
	private batteryService: Service;

	// off -> 0
	// on -> 1
	private switchState = 0;

	private batteryState = {
		level: 100,
		charging: 2, // not chargable
		low_battery: 0, // normal
	};

	constructor(
		private readonly platform: SwitchmateSwitchPlatform,
		private readonly accessory: PlatformAccessory,
		private readonly switchmateDevice: SwitchmateDevice,
	) {
		// setup switch service
		this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);
		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
		this.service.getCharacteristic(this.platform.api.hap.Characteristic.On).updateValue(this.switchState);
		this.service
			.getCharacteristic(this.platform.api.hap.Characteristic.On)
			.on(CharacteristicEventTypes.GET, this.getState.bind(this))
			.on(CharacteristicEventTypes.SET, this.setState.bind(this));

		// setup battery service
		this.batteryService = this.accessory.getService(this.platform.Service.BatteryService) || this.accessory.addService(this.platform.Service.BatteryService);
		this.batteryService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name + ' Battery');
		this.batteryService.getCharacteristic(this.platform.api.hap.Characteristic.BatteryLevel).updateValue(this.batteryState.level);
		this.batteryService.getCharacteristic(this.platform.api.hap.Characteristic.ChargingState).updateValue(this.batteryState.charging);
		this.batteryService.getCharacteristic(this.platform.api.hap.Characteristic.StatusLowBattery).updateValue(this.batteryState.low_battery);
		this.batteryService
			.getCharacteristic(this.platform.api.hap.Characteristic.BatteryLevel)
			.on(CharacteristicEventTypes.GET, this.getBatteryLevel.bind(this));
		this.batteryService
			.getCharacteristic(this.platform.api.hap.Characteristic.ChargingState)
			.on(CharacteristicEventTypes.GET, this.getChargingState.bind(this));
		this.batteryService
			.getCharacteristic(this.platform.api.hap.Characteristic.StatusLowBattery)
			.on(CharacteristicEventTypes.GET, this.getLowBatteryState.bind(this));

		// set accessory information
		this.switchmateDevice.getInfomationCharacteristics().then((deviceInformation) => {
			this.platform.log.debug('successfully get device information');

			this.accessory.getService(this.platform.Service.AccessoryInformation)!
				.setCharacteristic(this.platform.Characteristic.Manufacturer, deviceInformation.manufacturer)
				.setCharacteristic(this.platform.Characteristic.Model, deviceInformation.model)
				.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id) // use mac address as serial number
				.setCharacteristic(this.platform.Characteristic.HardwareRevision, deviceInformation.hardwareRevision)
				.setCharacteristic(this.platform.Characteristic.FirmwareRevision, deviceInformation.firmwareRevision);

			void this.poll();
		}).catch((error) => this.platform.log.error('Failed to get device information: %s', error));
	}

	private getState(callback: CharacteristicGetCallback): void {
		callback(undefined, this.switchState === 1 ? true : false);
	}

	private async setState(value: CharacteristicValue, callback: CharacteristicSetCallback): Promise<void> {
		this.platform.log.debug('setting switch state to %s', value as boolean);

		const numberedState = (value as boolean) ? 1 : 0;

		const targetState = await this.switchmateDevice.getTargetState();
		// only change when we need to
		if (targetState !== numberedState) {
			await this.switchmateDevice.setTargetState(numberedState);
			this.switchState = numberedState;
		}

		callback(null);
	}

	private getBatteryLevel(callback: CharacteristicGetCallback): void {
		callback(undefined, this.batteryState.level);
	}

	private getChargingState(callback: CharacteristicGetCallback): void {
		callback(undefined, this.batteryState.charging);
	}

	private getLowBatteryState(callback: CharacteristicGetCallback): void {
		callback(undefined, this.batteryState.low_battery);
	}

	private async poll() {
		// Loop forever.
		for (;;) {
			this.platform.log.debug('refreshing...');

			this.batteryState.level = await this.switchmateDevice.getBatteryLevel();
			this.platform.log.debug('setting battery level to %d', this.batteryState.level);
			
			if (this.batteryState.level <= 10) {
				this.batteryState.low_battery = this.platform.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
			} else {
				this.batteryState.low_battery = this.platform.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
			}

			this.switchState = await this.switchmateDevice.getCurrentState();
			this.platform.log.debug('setting switch state to %d', this.switchState);

			// Sleep until our next update.
			await this.sleep(10);
		}
	}

	// Emulate a sleep function.
	private sleep(s: number): Promise<NodeJS.Timeout> {
		return new Promise(resolve => setTimeout(resolve, s * 1000));
	}

}
