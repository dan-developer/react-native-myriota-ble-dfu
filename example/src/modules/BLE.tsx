import { Dispatch, SetStateAction } from 'react'
import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  PermissionsAndroid,
} from 'react-native'
import { PERMISSIONS, requestMultiple } from 'react-native-permissions'
import DeviceInfo from 'react-native-device-info'
import BleManager, { Peripheral } from 'react-native-ble-manager'
import { Buffer } from 'buffer'

// Events
// BleManagerStopScan
// BleManagerDidUpdateState
// BleManagerDiscoverPeripheral
// BleManagerDidUpdateValueForCharacteristic
// BleManagerConnectPeripheral
// BleManagerDisconnectPeripheral
// BleManagerPeripheralDidBond
// BleManagerCentralManagerWillRestoreState [iOS only]
// BleManagerDidUpdateNotificationStateFor [iOS only]
interface ScanOptions {
  serviceUUIDs: string[]
  name?: string
  timeout?: number
}

class BLE {
  public static UART_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
  public static UART_RX_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
  public static UART_TX_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'
  private bleManagerEmitter
  private setPeripherals: Dispatch<SetStateAction<Peripheral[]>>
  private static isScanning: boolean = false
  private connectedPeripheral: Peripheral = { id: '', rssi: 0, advertising: {} }

  constructor(setPeripherals: Dispatch<SetStateAction<Peripheral[]>>) {
    this.bleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager)
    this.setPeripherals = setPeripherals
    console.log('BLE constructor')
  }

  public requestPermissions(): Promise<void> {
    return new Promise(async (success, error) => {
      if (Platform.OS === 'android') {
        await BleManager.enableBluetooth()
        const apiLevel = await DeviceInfo.getApiLevel()
        if (apiLevel < 31) {
          const isGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message: 'Bluetooth Low Energy requires Location',
              buttonNeutral: 'Ask Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          )
          console.log('BLE requestPermissions:', isGranted)

          if (isGranted === PermissionsAndroid.RESULTS.GRANTED) {
            success()
          } else {
            error('Permission error: Permissions not granted!')
          }
        } else {
          const result = await requestMultiple([
            PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
            PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
            PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          ])
          const isGranted =
            result['android.permission.BLUETOOTH_CONNECT'] ===
              PermissionsAndroid.RESULTS.GRANTED &&
            result['android.permission.BLUETOOTH_SCAN'] ===
              PermissionsAndroid.RESULTS.GRANTED &&
            result['android.permission.ACCESS_FINE_LOCATION'] ===
              PermissionsAndroid.RESULTS.GRANTED

          console.log('BLE requestPermissions:', isGranted)

          if (isGranted) {
            success()
          } else {
            error('Permission error: Permissions not granted!')
          }
        }
      } else {
        console.log('BLE requestPermissions: iOS')
        success()
      }
    })
  }

  public start(): Promise<void> {
    return new Promise(async (success, error) => {
      console.log('BLE start: starting')
      await BleManager.start({ showAlert: false })

      const errorTimeout = setTimeout(() => {
        error('Initialization error: Timed out starting BLE manager')
      }, 5000)

      const handleUpdateState = (state: any) => {
        console.log('BLE start: handleUpdateState', state)
        if (state.state == 'on') {
          console.log('BLE start: started')
          clearTimeout(errorTimeout)
          success()
          stateSubscription.remove()
        }
      }

      const stateSubscription = this.bleManagerEmitter.addListener(
        'BleManagerDidUpdateState',
        handleUpdateState
      )

      BleManager.checkState()
    })
  }

  public async startScan(scanOptions: ScanOptions): Promise<void> {
    return new Promise(async (success, error) => {
      if (BLE.isScanning) {
        return error('Scan error: already scanning!')
      }

      console.log('BLE startScan: starting')
      this.setPeripherals(() => [])

      const stopScanSubscription = this.bleManagerEmitter.addListener(
        'BleManagerStopScan',
        async () => {
          console.log('BLE startScan: stopped')
          BLE.isScanning = false
          discoverSubscription.remove()
          stopScanSubscription.remove()
          success()
        }
      )

      const isDuplicteDevice = (
        devices: Peripheral[],
        nextDevice: Peripheral
      ) => devices.findIndex((device) => nextDevice.id === device.id) > -1

      const discoverSubscription = this.bleManagerEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        async (peripheral: Peripheral) => {
          if (scanOptions.name != undefined) {
            if (peripheral.advertising.localName == scanOptions.name) {
              console.log('BLE startScan: found', scanOptions.name)

              this.setPeripherals(() => {
                return [peripheral]
              })

              await BleManager.stopScan()
            }
          } else {
            this.setPeripherals((prevState: Peripheral[]) => {
              if (!isDuplicteDevice(prevState, peripheral)) {
                return [...prevState, peripheral]
              }

              return prevState
            })
          }
        }
      )

      const timeout = scanOptions.timeout ? scanOptions.timeout : 15

      BleManager.scan(scanOptions.serviceUUIDs, timeout, false, {
        scanMode: 2,
      }).then(
        () => {
          console.log('BLE startScan: started')
          BLE.isScanning = true
        },
        (err) => error('BLE startScan: ' + err)
      )
    })
  }

  public async stopScan(): Promise<void> {
    return new Promise<void>(async (success) => {
      if (!BLE.isScanning) {
        return success()
      }
      console.log('BLE stopScan: stoping')

      const stopScanSubscription = this.bleManagerEmitter.addListener(
        'BleManagerStopScan',
        async () => {
          console.log('BLE stopScan: stopped')
          stopScanSubscription.remove()
          success()
        }
      )

      await BleManager.stopScan()
    })
  }

  public async isConnected(): Promise<boolean> {
    return new Promise<boolean>(async (success) => {
      const connected = await BleManager.isPeripheralConnected(
        this.connectedPeripheral.id,
        []
      )

      if (!connected || this.connectedPeripheral.id == '') {
        return success(false)
      }

      success(true)
    })
  }

  public async connect(peripheral: Peripheral): Promise<void> {
    return new Promise<void>(async (success, error) => {
      if (!peripheral.advertising.localName) {
        return error('BLE Connect: invalid peripheral provided!')
      }

      const connected = await BleManager.isPeripheralConnected(
        this.connectedPeripheral.id,
        []
      )

      if (connected || this.connectedPeripheral.id != '') {
        console.warn('BLE Connect: already connected!')
        return success()
      }

      console.log('BLE Connect: connecting')

      const connectSubscription = this.bleManagerEmitter.addListener(
        'BleManagerConnectPeripheral',
        async (event) => {
          console.log(
            'BLE connect: connected to',
            event.peripheral,
            event.status
          )
          this.connectedPeripheral = peripheral
          connectSubscription.remove()

          await BleManager.retrieveServices(peripheral.id).then(
            (event) => {
              console.log(
                'BLE connect: services retrieved for',
                event.name,
                event.services
              )
              if (Platform.OS == 'android') {
                console.log('Requesting MTU...')
                BleManager.requestMTU(peripheral.id, 247).then(
                  (mtu) => {
                    console.log('MTU size changed to ' + mtu + ' bytes')
                    success()
                  },
                  (err) => {
                    error(
                      'BLE connect: error changing MTU services for' +
                        peripheral.advertising.localName +
                        ': ' +
                        err
                    )
                  }
                )
              } else {
                success()
              }
            },
            (err) => {
              error(
                'BLE connect: error retrieving services for' +
                  peripheral.advertising.localName +
                  ': ' +
                  err
              )
            }
          )

          // await BleManager.startNotification(
          //   peripheral.id,
          //   BLE.UART_UUID,
          //   BLE.UART_TX_UUID.toLowerCase()
          // ).then(success, error)
        }
      )

      await BleManager.connect(peripheral.id).then(
        () => {},
        (err) => {
          connectSubscription.remove()
          error(
            'BLE connect: error connecting to ' +
              peripheral.advertising.localName +
              ': ' +
              err
          )
        }
      )
    })
  }

  public async disconnect(): Promise<void> {
    return new Promise<void>(async (success, error) => {
      const connected = await BleManager.isPeripheralConnected(
        this.connectedPeripheral.id,
        []
      )

      if (!connected || this.connectedPeripheral.id == '') {
        console.warn('BLE Disconnect: already disconnected!')
        return success()
      }

      console.log('BLE disonnect: disconnecting', this.connectedPeripheral.id)

      await BleManager.disconnect(this.connectedPeripheral.id, true).then(
        () => {
          console.log(
            'BLE disconnect: disconnected from ',
            this.connectedPeripheral.advertising.localName
          )

          this.connectedPeripheral = { id: '', rssi: 0, advertising: {} }
          success()
        },
        (err) => {
          error(
            'BLE disconnect: error disconnecting from ' +
              this.connectedPeripheral.advertising.localName +
              ': ' +
              err
          )
        }
      )
    })
  }

  public async write(
    data: string,
    serviceUUIDs: string,
    characteristicUUID: string
  ): Promise<void> {
    return new Promise<void>(async (success, error) => {
      const connected = await BleManager.isPeripheralConnected(
        this.connectedPeripheral.id,
        [serviceUUIDs]
      )

      if (!connected || this.connectedPeripheral.id == '') {
        return error('BLE write: device not connected!')
      }
      console.log('BLE write: writting')

      await BleManager.write(
        this.connectedPeripheral.id,
        serviceUUIDs,
        Platform.OS !== 'android'
          ? characteristicUUID
          : characteristicUUID.toLowerCase(),
        this.toBytes(data)
        // ,245
      ).then(
        () => {
          console.log('BLE write: done!')
          success()
        },
        (err) => {
          return error(
            'BLE write: error writing to ' +
              this.connectedPeripheral.id +
              ': ' +
              err
          )
        }
      )
    })
  }

  public async read(
    serviceUUIDs: string,
    characteristicUUID: string
  ): Promise<any> {
    return new Promise<any>(async (success, error) => {
      const connected = await BleManager.isPeripheralConnected(
        this.connectedPeripheral.id,
        [serviceUUIDs]
      )

      if (!connected || this.connectedPeripheral.id == '') {
        return error('BLE read: device not connected!')
      }
      console.log('BLE read: reading')

      await BleManager.read(
        this.connectedPeripheral.id,
        serviceUUIDs,
        Platform.OS !== 'android'
          ? characteristicUUID
          : characteristicUUID.toLowerCase()
      ).then(
        (data) => {
          console.warn(data)
          console.log('BLE read: done!')
          success(data)
        },
        (err) => {
          return error(
            'BLE read: error reading to ' +
              this.connectedPeripheral.id +
              ': ' +
              err
          )
        }
      )
    })
  }

  public async readNotify(
    serviceUUIDs: string,
    characteristicUUID: string
  ): Promise<any> {
    return new Promise<any>(async (success, error) => {
      const connected = await BleManager.isPeripheralConnected(
        this.connectedPeripheral.id,
        [serviceUUIDs]
      )

      if (!connected || this.connectedPeripheral.id == '') {
        return error('BLE read: device not connected!')
      }
      console.log('BLE read: reading')

      const handleRX = (state: any) => {
        console.log('BLE read: handleRX:', state)
        if (
          Platform.OS !== 'android'
            ? state.characteristic == characteristicUUID
            : state.characteristic == characteristicUUID.toLowerCase()
        ) {
          success(state.value)
          RXSubscription.remove()
        }
      }

      const RXSubscription = this.bleManagerEmitter.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        handleRX
      )
    })
  }

  private toBytes(text: string): number[] {
    const buffer = Buffer.from(text, 'utf8')
    const result = Array(buffer.length)
    for (let i = 0; i < buffer.length; ++i) {
      result[i] = buffer[i]
    }
    return result
  }
}

export default BLE
