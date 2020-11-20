
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge Plugin for Switchmate Switch

This is a homebridge plugin for Switchmate Switches.

Currently supports:
* [Switchmate Switch (v3)](https://www.mysimplysmarthome.com/products/switchmate-switches/)


## Installation

### Install bluetooth libraries
##### Ubuntu, Debian, Raspbian
```sh
sudo apt install bluetooth bluez libbluetooth-dev libudev-dev
```
See the document of the [@abandonware/noble](https://github.com/abandonware/noble#readme) for other operating systems details.

### Install package
```sh
sudo npm install -g homebridge-switchmate-switch
```
You can also install it on the homebridge plugins page.

## Configuration
You can configure it using [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x)
or add below to ```config.json``` manually
```json
{
    "devices": [
        {
            "name": "Living Room Switch",
            "id": "CHANGE ME TO YOUR SWITCH MAC ADDRESS WITHOUT COLON"
        }
    ],
    "platform": "SwitchmateSwitch"
}
```




