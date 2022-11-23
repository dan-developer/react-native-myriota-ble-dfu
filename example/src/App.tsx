import RNMyriotaBLEDFUModule, { MyriotaDFU } from 'react-native-myriota-ble-dfu'
import React, { useEffect } from 'react'
import BLEApi from './modules/BLE'
import DeviceModal from './components/peripherals'

const App = () => {
  const {
    peripherals,
    requestPermissions,
    scanForPeripheral,
    scan,
    stopScan,
    initBLE,
    UART_SERVICE_UUID,
  } = BLEApi()

  useEffect(() => {
    requestPermissions()
      .then(() => initBLE())
      // .then(() =>
      //   scanForPeripheral({
      //     name: 'PLS9896B0',
      //     serviceUUIDs: [UART_SERVICE_UUID],
      //     timeout: 5,
      //   })
      // )
      // .then((peripheral: Peripheral) => console.log('Found:', peripheral.name))
      .then(async () => await scan({ serviceUUIDs: [UART_SERVICE_UUID] }))
      // .then(() => {
      //   console.log('here')
      //   console.log(periperals)
      //   periperals.forEach((peripheral: Peripheral) =>
      //     console.log(peripheral.name)
      //   )
      // })
      .catch((error) => console.error(error))

    return () => {
      console.log('unmount')

      stopScan()
    }
  }, [])

  return <DeviceModal devices={peripherals} />
}

export default App
