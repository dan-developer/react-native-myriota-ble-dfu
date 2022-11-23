import RNMyriotaBLEDFUModule, { MyriotaDFU } from 'react-native-myriota-ble-dfu'
import React, { useEffect, useState } from 'react'
import BLE from './modules/BLE'
import { Peripheral } from 'react-native-ble-manager'
import DeviceModal from './components/peripherals'

const App = () => {
  const [peripherals, setPeriperals] = useState<Peripheral[]>([])
  const ble = new BLE(setPeriperals)

  useEffect(() => {
    ble
      .requestPermissions()
      .then(() => ble.start())
      // .then(() =>
      //   ble.scanForPeripheral({
      //     name: 'PLS9896B7',
      //     serviceUUIDs: [BLE.UART_UUID],
      //     timeout: 7,
      //   })
      // )
      // .then((peripheral: Peripheral) => console.log('Found:', peripheral.name))
      .then(async () => await ble.startScan({ serviceUUIDs: [BLE.UART_UUID] }))
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

      ble.stopScan()
    }
  }, [])

  return <DeviceModal devices={peripherals} />
}

export default App
