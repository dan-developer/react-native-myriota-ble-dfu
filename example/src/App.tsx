import RNMyriotaBLEDFUModule, { MyriotaDFU } from 'react-native-myriota-ble-dfu'
import React, { useEffect, useState } from 'react'
import BLE from './modules/BLE'
import { Peripheral } from 'react-native-ble-manager'
import PeripheralView from './components/peripherals'

const App = () => {
  const [peripherals, setPeriperals] = useState<Peripheral[]>([])
  const ble = new BLE(setPeriperals)

  useEffect(() => {
    ble
      .requestPermissions()
      .then(() => ble.start())
      .catch((error) => console.error(error))

    return () => {
      console.log('unmount')

      ble.stopScan()
    }
  }, [])

  return (
    <PeripheralView
      devices={peripherals}
      connectToPeripheral={console.warn}
      scan={() =>
        ble
          // .scanForPeripheral({
          //   name: 'PLS9896B7',
          //   serviceUUIDs: [BLE.UART_UUID],
          //   timeout: 5,
          // })
          // .then((peripheral: Peripheral) =>
          //   console.log('Found:', peripheral.name)
          // )
          .startScan({ serviceUUIDs: [BLE.UART_UUID] })
          .catch((error) => console.error(error))
      }
    />
  )
}

export default App
