import { Dispatch, SetStateAction } from 'react'
import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native'
import BleManager, { Peripheral } from 'react-native-ble-manager'
import DeviceInfo from 'react-native-device-info'
import Config from 'react-native-dotenv'
import { Logger } from 'react-native-myriota-ble-dfu'
import { PERMISSIONS, requestMultiple } from 'react-native-permissions'

interface ScanOptions {
  serviceUUIDs: string[]
  name?: string
  timeout?: number
}

class BLE {
  private bleManagerEmitter
  private setPeripherals: Dispatch<SetStateAction<Peripheral[]>>
  private static isScanning: boolean = false
  private connectedPeripheral: Peripheral = { id: '', rssi: 0, advertising: {} }
  private logger: Logger

  constructor(setPeripherals: Dispatch<SetStateAction<Peripheral[]>>) {
    this.bleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager)
    this.setPeripherals = setPeripherals
    this.logger = new Logger(Config.DEBUG_BLE)
    this.logger.info('BLE: constructor')
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
          this.logger.info('BLE: requestPermissions:', isGranted)

          if (isGranted === PermissionsAndroid.RESULTS.GRANTED) {
            success()
          } else {
            error('Permissions not granted!')
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

          this.logger.info('BLE: requestPermissions:', isGranted)

          if (isGranted) {
            success()
          } else {
            error('Permissions not granted!')
          }
        }
      } else {
        this.logger.info('BLE: requestPermissions: iOS')
        success()
      }
    })
  }

  public start(): Promise<void> {
    return new Promise(async (success, error) => {
      this.logger.info('BLE: start: starting')
      await BleManager.start({ showAlert: false })

      const errorTimeout = setTimeout(() => {
        error('Initialization error: Timed out starting BLE manager')
      }, 5000)

      const handleUpdateState = (state: any) => {
        this.logger.info('BLE: start: handleUpdateState', state)
        if (state.state == 'on') {
          this.logger.info('BLE: start: started')
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
        error('Already scanning!')
      }

      this.logger.info('BLE: startScan: starting')
      this.setPeripherals(() => [])

      const stopScanSubscription = this.bleManagerEmitter.addListener(
        'BleManagerStopScan',
        async () => {
          this.logger.info('BLE: startScan: stopped')
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
              this.logger.info('BLE: startScan: found', scanOptions.name)

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
          this.logger.info('BLE: startScan: started')
          BLE.isScanning = true
        },
        (err) => error('Error scanning for devices: ' + err)
      )
    })
  }

  public async stopScan(): Promise<void> {
    return new Promise<void>(async (success) => {
      if (!BLE.isScanning) {
        return success()
      }
      this.logger.info('BLE: stopScan: stoping')

      const stopScanSubscription = this.bleManagerEmitter.addListener(
        'BleManagerStopScan',
        async () => {
          this.logger.info('BLE: stopScan: stopped')
          stopScanSubscription.remove()
          success()
        }
      )

      await BleManager.stopScan()
    })
  }

  public async connect(peripheral: Peripheral): Promise<void> {
    return new Promise<void>(async (success, error) => {
      if (!peripheral.advertising.localName) {
        error('Error connecting to device: invalid peripheral provided!')
      }

      const connected = await BleManager.isPeripheralConnected(
        this.connectedPeripheral.id,
        []
      )

      if (connected || this.connectedPeripheral.id != '') {
        this.logger.warn('BLE: connect: already connected!')
        return success()
      }

      this.logger.info('BLE: connect: connecting...')

      const connectSubscription = this.bleManagerEmitter.addListener(
        'BleManagerConnectPeripheral',
        async (event) => {
          this.logger.info('BLE: connect: connected to', event.peripheral)
          this.connectedPeripheral = peripheral
          connectSubscription.remove()

          await BleManager.retrieveServices(peripheral.id).then(
            (event) => {
              this.logger.info(
                'BLE: connect: services retrieved for',
                event.name,
                event.services
              )
              if (Platform.OS == 'android') {
                this.logger.info('BLE: requesting MTU change...')
                BleManager.requestMTU(peripheral.id, 247).then(
                  (mtu) => {
                    this.logger.info(
                      'BLE: MTU size changed to ' + mtu + ' bytes'
                    )
                    success()
                  },
                  (err) => {
                    error('Error changing MTU: ' + err)
                  }
                )
              } else {
                success()
              }
            },
            (err) => {
              error('Error retrieving services: ' + err)
            }
          )
        }
      )

      await BleManager.connect(peripheral.id).then(
        () => {},
        (err) => {
          connectSubscription.remove()
          error('Error connecting to device: ' + err)
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
        this.logger.warn('BLE: disconnect: already disconnected!')
        return success()
      }

      this.logger.info(
        'BLE: disonnect: disconnecting...',
        this.connectedPeripheral.id
      )

      await BleManager.disconnect(this.connectedPeripheral.id, true).then(
        () => {
          this.logger.info(
            'BLE: disconnect: disconnected from ',
            this.connectedPeripheral.advertising.localName
          )

          this.connectedPeripheral = { id: '', rssi: 0, advertising: {} }
          success()
        },
        (err) => {
          error('Error disconnecting from device: ' + err)
        }
      )
    })
  }
}

export default BLE
