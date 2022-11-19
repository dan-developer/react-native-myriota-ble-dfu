import RNMyriotaBLEDFUModule, { MyriotaDFU } from 'react-native-myriota-ble-dfu'
import BleManager from 'react-native-ble-manager'
import { PERMISSIONS, requestMultiple } from 'react-native-permissions'
import DeviceInfo from 'react-native-device-info'
import React, { useState, useEffect } from 'react'
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
  const [isScanning, setIsScanning] = useState(false)

  const peripherals = new Map()

  const sleep = async (ms: number) =>
    await new Promise((success) => setTimeout(success, ms))

  const handleStopScan = () => {
    console.log('handleStopScan')
    console.log('Scan is stopped')
    setIsScanning(false)
  }

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

  const handleDiscoverPeripheral = (peripheral) => {
    console.log('handleDiscoverPeripheral')
    console.log('Got ble peripheral', peripheral)
    if (!peripheral.name) {
      peripheral.name = 'NO NAME'
    }
    peripherals.set(peripheral.id, peripheral)
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

  const startScan = async () => {
    console.log('startScan: starting')
    // await sleep(5000)
    // console.log('here2')
    if (!isScanning) {
      await BleManager.scan([UART_SERVICE_UUID], 15, false)

      console.log('startScan: started')
      setIsScanning(true)
    }
  }

  const stopScan = async () => {
    console.log('stopScan: stoping')
    await BleManager.stopScan()
    console.log('stopScan: stopped')
    setIsScanning(false)
  }

  const startBLE = (): Promise<void> => {
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
    const init = async () => {
      await requestPermissions()
      await startBLE()
      await startScan()
    }

    init().catch((error) => console.error('Initialization error:', error))
    // scanForUUID('test')
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
        'BleManagerDiscoverPeripheral',
        handleDiscoverPeripheral
      ),
      bleManagerEmitter.addListener('BleManagerStopScan', handleStopScan),
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
      stopScan()

      subscriptions.forEach((s) => s?.remove?.())
    }
  }, [])

  return <></>
}

export default App
