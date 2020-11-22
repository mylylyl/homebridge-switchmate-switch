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

	// use false -> off and true -> on
	private switchState = false;

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
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			.on(CharacteristicEventTypes.SET, this.setState.bind(this));

		// setup battery service
		this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery);
		this.batteryService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name + ' Battery');
		this.batteryService.getCharacteristic(this.platform.api.hap.Characteristic.BatteryLevel).updateValue(this.batteryState.level);
		this.batteryService.getCharacteristic(this.platform.api.hap.Characteristic.ChargingState).updateValue(this.batteryState.charging);
		this.batteryService.getCharacteristic(this.platform.api.hap.Characteristic.StatusLowBattery).updateValue(this.batteryService.low_battery);
		this.batteryService
			.getCharacteristic(this.platform.api.hap.Characteristic.BatteryLevel)
			.on(CharacteristicEventTypes.GET, this.getState.bind(this));
		this.batteryService
			.getCharacteristic(this.platform.api.hap.Characteristic.ChargingState)
			.on(CharacteristicEventTypes.GET, this.getState.bind(this));
		this.batteryService
			.getCharacteristic(this.platform.api.hap.Characteristic.StatusLowBattery)
			.on(CharacteristicEventTypes.GET, this.getState.bind(this));

		// set accessory information
		this.switchmateDevice.getInfomationCharacteristics().then((deviceInformation) => {
			this.platform.log.debug('successfully get device information');

			this.accessory.getService(this.platform.Service.AccessoryInformation)!
				.setCharacteristic(this.platform.Characteristic.Manufacturer, deviceInformation.manufacturer)
				.setCharacteristic(this.platform.Characteristic.Model, 'Smart Switch')
				.setCharacteristic(this.platform.Characteristic.SerialNumber, deviceInformation.serial)
				.setCharacteristic(this.platform.Characteristic.HardwareRevision, deviceInformation.hardwareRevision)
				.setCharacteristic(this.platform.Characteristic.SoftwareRevision, deviceInformation.softwareRevision)
				.setCharacteristic(this.platform.Characteristic.FirmwareRevision, deviceInformation.firmwareRevision);

			void this.poll();
		}).catch((error) => this.platform.log.error('Failed to get device information: %s', error));
	}

	private getState(callback: CharacteristicGetCallback): void {
		callback(undefined, this.switchState);
	}

	private async setState(value: CharacteristicValue, callback: CharacteristicSetCallback): Promise<void> {
		this.platform.log.debug('setting switch state to %s', value as boolean);

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
		for (; ;) {
			this.platform.log.debug('refreshing...');

			

			// Sleep until our next update.
			await this.sleep(10);
		}
	}

	// Emulate a sleep function.
	private sleep(s: number): Promise<NodeJS.Timeout> {
		return new Promise(resolve => setTimeout(resolve, s * 1000));
	}

}
