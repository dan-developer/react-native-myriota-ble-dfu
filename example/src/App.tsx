import RNMyriotaBLEDFUModule, { MyriotaDFU } from 'react-native-myriota-ble-dfu'
import React, { useEffect, useState } from 'react'
import BLE from './modules/BLE'
import { Peripheral } from 'react-native-ble-manager'
import PeripheralView from './components/peripherals'
import { Buffer } from 'buffer'

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

      const unmoutRoutine = async () => {
        console.log('unmount')
        try {
          await ble.disconnect()
          await ble.stopScan()
        } catch (error) {
          console.error(error)
        }
      }

      unmoutRoutine()
    }
  }, [])

  return (
    <PeripheralView
      devices={peripherals}
      connectToPeripheral={async (peripheral) => {
        ble
          .stopScan()
          .then(() => ble.connect(peripheral))
          .then(() => ble.write('U', BLE.UART_UUID, BLE.UART_RX_UUID))
          .then(() => ble.readNotify(BLE.UART_UUID, BLE.UART_TX_UUID))
          .then((readData) => {
            // const buffer = Buffer.from(data)
            // const sensorData = buffer.readUInt8(1, true);
            console.warn(Buffer.from(readData).toString())
          })
          .catch((error) => console.error(error))
      }}
      scan={() =>
        ble
          .startScan({
            serviceUUIDs: [BLE.UART_UUID],
            // name: 'MYRIOTA-DFU',
            // timeout: 5,
          })
          .catch((error) => console.error(error))
      }
    />
  )
}

export default App
