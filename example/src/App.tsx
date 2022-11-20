import RNMyriotaBLEDFUModule, { MyriotaDFU } from 'react-native-myriota-ble-dfu'
import BleManager, { Peripheral } from 'react-native-ble-manager'
import { PERMISSIONS, requestMultiple } from 'react-native-permissions'
import DeviceInfo from 'react-native-device-info'
import React, { useEffect } from 'react'
import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  PermissionsAndroid,
} from 'react-native'

const BleManagerModule = NativeModules.BleManager
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule)

const UART_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
const RX_CHARACTERISTIC = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
const TX_CHARACTERISTIC = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'

const App = () => {
  const peripherals = new Map()

  const handleDisconnectedPeripheral = (data) => {
    console.log('handleDisconnectedPeripheral')
    let peripheral = peripherals.get(data.peripheral)
    if (peripheral) {
      peripheral.connected = false
      peripherals.set(peripheral.id, peripheral)
    }
    console.log('Disconnected from ' + data.peripheral)
  }

  const handleUpdateValueForCharacteristic = (data) => {
    console.log('handleUpdateValueForCharacteristic')
    console.log(
      'Received data from ' +
        data.peripheral +
        ' characteristic ' +
        data.characteristic,
      data.value
    )
  }

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

          console.log('requestPermissions:', isGranted)

          if (isGranted) {
            success()
          } else {
            error('Permissions not granted!')
          }
        }
      } else {
        console.log('requestPermissions: iOS')
        success()
      }
    })
  }

  interface ScanBLEOptions {
    name: string
    serviceUUIDs: string[]
    timeout?: number
  }

  const scanForBLE = async (
    scanBLEOptions: ScanBLEOptions
  ): Promise<Peripheral> => {
    return new Promise(async (success) => {
      console.log('startScan: starting')

      const stopScanSubscription = bleManagerEmitter.addListener(
        'BleManagerStopScan',
        async () => {
          console.log('startScan: stopped')
          discoverSubscription.remove()
          stopScanSubscription.remove()
        }
      )

      const discoverSubscription = bleManagerEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        async (peripheral: Peripheral) => {
          if (
            peripheral.name == scanBLEOptions.name ||
            peripheral.advertising.localName == scanBLEOptions.name
          ) {
            await BleManager.stopScan()
            success(peripheral)
          }
        }
      )

      const timeout = scanBLEOptions.timeout ? scanBLEOptions.timeout : 15

      await BleManager.scan(scanBLEOptions.serviceUUIDs, timeout, false)

      console.log('startScan: started')
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
        error('Timed out starting BLE manager')
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

  useEffect(() => {
    const init = async () => {}

    init()
      .then(async () => await requestPermissions())
      .catch((error) => console.error('Permission error:', error))
      .then(async () => await initBLE())
      .catch((error) => console.error('BLE initialization error:', error))
      .then(
        async () =>
          await scanForBLE({
            name: 'PLS9896B7',
            serviceUUIDs: [UART_SERVICE_UUID],
          })
      )
      .catch((error) => console.error('BLE scan error:', error))
      .then((peripheral) => console.log('peripheral:', peripheral))

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

    const subscriptions = [
      bleManagerEmitter.addListener(
        'BleManagerDisconnectPeripheral',
        handleDisconnectedPeripheral
      ),
      bleManagerEmitter.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        handleUpdateValueForCharacteristic
      ),
    ]

    return () => {
      console.log('unmount')

      const stop = async () => {}

      stop()
        .then(async () => await stopScan())
        .catch((error) => console.error('BLE stopScan error:', error))

      subscriptions.forEach((s) => s?.remove?.())
    }
  }, [])

  return <></>
}

export default App
