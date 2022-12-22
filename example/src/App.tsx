import RNMyriotaBLEDFUModule, { MyriotaDFU } from 'react-native-myriota-ble-dfu'
import React, { useEffect, useState } from 'react'
import BLE from './modules/BLE'
import { Peripheral } from 'react-native-ble-manager'
import PeripheralView from './components/peripherals'
import { Buffer } from 'buffer'
import BLEUartStream from './modules/BLEUartStream'
import { Button, Platform, Text, View } from 'react-native'
import ReactNativeBlobUtil from 'react-native-blob-util'
import DocumentPicker, {
  DocumentPickerResponse,
} from 'react-native-document-picker'

/**
 * Sleep for ms milliseconds
 * @param ms the number of milliseconds to sleep for
 * @returns promise the will resolve in ms milliseconds
 */
const sleep = (ms: number) => new Promise((success) => setTimeout(success, ms))

const App = () => {
  const [peripherals, setPeriperals] = useState<Peripheral[]>([])
  const [file, setFile] = useState<DocumentPickerResponse>()

  const ble = new BLE(setPeriperals)

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
      })
      setFile(res)

      if (file != undefined) {
        const buf = await ReactNativeBlobUtil.fs
          .readFile(
            file.uri,
            //   // assetsFolder + 'myriota-system-image-v1.5.4.img',
            'base64'
          )
          .then((b64string) => {
            return Buffer.from(b64string, 'base64')
          })

        ble
          .requestPermissions()
          .then(() => ble.start())
          .then(async () => {
            await ble.startScan({
              serviceUUIDs: [BLE.UART_UUID],
              name: 'MYRIOTA-DFU',
              timeout: 5,
            })

            console.log('peripherals:', peripherals)

            if (peripherals[0] == undefined) {
              throw Error('MYRIOTA-DFU not found')
            }

            await ble.connect(peripherals[0])

            const UART_UUID: string =
              Platform.OS !== 'android'
                ? BLE.UART_UUID
                : BLE.UART_UUID.toLowerCase()
            const UART_TX_UUID: string =
              Platform.OS !== 'android'
                ? BLE.UART_TX_UUID
                : BLE.UART_TX_UUID.toLowerCase()
            const UART_RX_UUID: string =
              Platform.OS !== 'android'
                ? BLE.UART_RX_UUID
                : BLE.UART_RX_UUID.toLowerCase()

            const bleUartStream = new BLEUartStream(
              peripherals[0],
              UART_UUID,
              UART_TX_UUID,
              UART_RX_UUID
            )

            await bleUartStream.open().then(
              () => console.log('open: success'),
              (error) => console.error('open: error:', error)
            )
            let readData: Buffer = Buffer.from([0])

            await bleUartStream.writeTo(Buffer.from('U', 'utf-8'))
            await sleep(1000)
            readData = bleUartStream.readTo()
            console.log(readData.toString())

            await bleUartStream.writeTo(Buffer.from('s', 'utf-8'))
            await sleep(1000)
            readData = bleUartStream.readLine(Buffer.from('\r\n'))
            console.log(readData.toString())
            readData = bleUartStream.readLine(Buffer.from('\r\n'))
            console.log(readData.toString())
            // readData = await bleUartStream.readTo()
            // console.log(readData.toString())
            // readData = bleUartStream.readLine()
            // console.log(readData.toString())
            // readData = bleUartStream.readLine()
            // console.log(readData.toString())
            // await sleep(1000)
            // readData = bleUartStream.readTo()
            // console.log(readData.toString())
            // await sleep(1000)
            // readData = bleUartStream.readTo()
            // console.log(readData.toString())

            // await bleUartStream.xmodemSend(
            //   bleUartStream,
            //   // assetsFolder + 'networkinfo.bin',
            //   assetsFolder + 'myriota-firmware-v1.0.1.bin',
            //   // assetsFolder + 'myriota-system-image-v1.5.4.img',
            //   (totalChuncks: number) => console.log('totalChuncks', totalChuncks),
            //   (currentChunk: any) => console.log('currentChunk', currentChunk)
            // )

            // const buf = await ReactNativeBlobUtil.fs
            //   .readFile(
            //     // assetsFolder + 'networkinfo.bin',
            //     assetsFolder + 'myriota-firmware-v1.0.1.bin',
            //     //   // assetsFolder + 'myriota-system-image-v1.5.4.img',
            //     'base64'
            //   )
            //   .then((b64string) => {
            //     return Buffer.from(b64string, 'base64')
            //   })

            readData = bleUartStream.readLine(Buffer.from('\r\n'))
            console.log(readData.toString())

            await bleUartStream.xmodemSend2(buf)

            await bleUartStream.close().then(
              () => console.log('Close: success'),
              (error) => console.error('Close: error:', error)
            )

            await ble.disconnect()
          })
          .catch((error) => console.error(error))
      }
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        // User cancelled the picker, do nothing
      } else {
        throw err
      }
    }
  }

  useEffect(() => {
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
    <View>
      <Button title='Pick a file' onPress={pickFile} />
      {file && <Text>{file.name}</Text>}
    </View>
    // <PeripheralView
    //   devices={peripherals}
    //   connectToPeripheral={async (peripheral) => {
    //     ble
    //       .stopScan()
    //       .then(() => ble.connect(peripheral))
    //       .then(() => ble.write('U', BLE.UART_UUID, BLE.UART_RX_UUID))
    //       .then(() => ble.readNotify(BLE.UART_UUID, BLE.UART_TX_UUID))
    //       .then((readData) => {
    //         // const buffer = Buffer.from(data)
    //         // const sensorData = buffer.readUInt8(1, true);
    //         console.warn(Buffer.from(readData).toString())
    //       })
    //       .catch((error) => console.error(error))
    //   }}
    //   scan={() =>
    //     ble
    //       .startScan({
    //         serviceUUIDs: [BLE.UART_UUID],
    //         // name: 'MYRIOTA-DFU',
    //         // timeout: 5,
    //       })
    //       .catch((error) => console.error(error))
    //   }
    // />
  )
}

export default App
