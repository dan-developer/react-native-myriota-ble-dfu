import BleManager, { Peripheral } from 'react-native-ble-manager'
import { PERMISSIONS, requestMultiple } from 'react-native-permissions'
import DeviceInfo from 'react-native-device-info'
// import { useState } from 'react'
import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  PermissionsAndroid,
} from 'react-native'
import { useState } from 'react'

// Android events
// BleManagerDidUpdateState
// BleManagerPeripheralDidBond
// BleManagerStopScan
//
// iOS events
// BleManagerDidUpdateValueForCharacteristic,
// BleManagerStopScan,
// BleManagerDiscoverPeripheral,
// BleManagerConnectPeripheral,
// BleManagerDisconnectPeripheral,
// BleManagerDidUpdateState,
// BleManagerCentralManagerWillRestoreState,
// BleManagerDidUpdateNotificationStateFor

interface ScanForPeripheralOptions {
  name: string
  serviceUUIDs: string[]
  timeout?: number
}
interface ScanOptions {
  serviceUUIDs: string[]
  timeout?: number
}
interface BLEinterface {
  peripherals: BleManager.Peripheral[]
  requestPermissions: () => Promise<void>
  scanForPeripheral: (
    scanForPeripheralOptions: ScanForPeripheralOptions
  ) => Promise<Peripheral>
  scan: (scanOptions: ScanOptions) => Promise<void>
  stopScan: () => Promise<void>
  initBLE: () => Promise<void>
  UART_SERVICE_UUID: string
}

const BLEApi = (): BLEinterface => {
  const BleManagerModule = NativeModules.BleManager
  const bleManagerEmitter = new NativeEventEmitter(BleManagerModule)
  const [peripherals, setPeriperals] = useState<Peripheral[]>([])

  // const peripherals = new Map()

  const requestPermissions = (): Promise<void> => {
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
          console.log('requestPermissions:', isGranted)

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

          console.log('requestPermissions:', isGranted)

          if (isGranted) {
            success()
          } else {
            error('Permission error: Permissions not granted!')
          }
        }
      } else {
        console.log('requestPermissions: iOS')
        success()
      }
    })
  }

  const scanForPeripheral = async (
    scanForPeripheralOptions: ScanForPeripheralOptions
  ): Promise<Peripheral> => {
    return new Promise(async (success, error) => {
      console.log('scanForPeripheral: starting')
      let deviceFound = false

      const timeout = scanForPeripheralOptions.timeout
        ? scanForPeripheralOptions.timeout
        : 15

      const errorTimeout = setTimeout(async () => {
        error(
          'Scan error: Timed out looking for ' + scanForPeripheralOptions.name
        )
        await BleManager.stopScan()
      }, timeout * 1000)

      const stopScanSubscription = bleManagerEmitter.addListener(
        'BleManagerStopScan',
        async () => {
          console.log('scanForPeripheral: stopped')
          discoverSubscription.remove()
          stopScanSubscription.remove()
          clearTimeout(errorTimeout)
          if (!deviceFound) {
            error('Scan error: device not found!')
          }
        }
      )

      const discoverSubscription = bleManagerEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        async (peripheral: Peripheral) => {
          if (
            peripheral.name == scanForPeripheralOptions.name ||
            peripheral.advertising.localName == scanForPeripheralOptions.name
          ) {
            deviceFound = true
            await BleManager.stopScan()
            success(peripheral)
          }
        }
      )

      await BleManager.scan(
        scanForPeripheralOptions.serviceUUIDs,
        timeout,
        false
      )

      console.log('scanForPeripheral: started')
    })
  }

  const scan = async (scanOptions: ScanOptions): Promise<void> => {
    return new Promise(async (success) => {
      console.log('scan: starting')
      setPeriperals(() => [])

      const stopScanSubscription = bleManagerEmitter.addListener(
        'BleManagerStopScan',
        async () => {
          console.log('scan: stopped')
          discoverSubscription.remove()
          stopScanSubscription.remove()
          success()
        }
      )

      const discoverSubscription = bleManagerEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        async (peripheral: Peripheral) => {
          // console.log(peripheral)
          setPeriperals((prevState: Peripheral[]) => [...prevState, peripheral])
        }
      )

      const timeout = scanOptions.timeout ? scanOptions.timeout : 15

      await BleManager.scan(scanOptions.serviceUUIDs, timeout, false)

      console.log('scan: started')
    })
  }

  const stopScan = async () => {
    return new Promise<void>(async (success) => {
      console.log('stopScan: stoping')

      const stopScanSubscription = bleManagerEmitter.addListener(
        'BleManagerStopScan',
        async () => {
          console.log('stopScan: stopped')
          stopScanSubscription.remove()
          success()
        }
      )

      await BleManager.stopScan()
    })
  }

  const initBLE = (): Promise<void> => {
    return new Promise(async (success, error) => {
      console.log('startBLE: starting')
      await BleManager.start({ showAlert: false })

      const errorTimeout = setTimeout(() => {
        error('Initialization error: Timed out starting BLE manager')
      }, 5000)

      const handleUpdateState = (state: any) => {
        console.log('handleUpdateState', state)
        if (state.state == 'on') {
          console.log('startBLE: started')
          clearTimeout(errorTimeout)
          success()
          stateSubscription.remove()
        }
      }

      const stateSubscription = bleManagerEmitter.addListener(
        'BleManagerDidUpdateState',
        handleUpdateState
      )

      BleManager.checkState()
    })
  }

  const UART_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'

  return {
    peripherals,
    requestPermissions,
    scanForPeripheral,
    scan,
    stopScan,
    initBLE,
    UART_SERVICE_UUID,
  }
}

export default BLEApi