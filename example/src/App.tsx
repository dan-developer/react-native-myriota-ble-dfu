import RNMyriotaBLEDFUModule, { MyriotaDFU } from 'react-native-myriota-ble-dfu'
import React, { useEffect, useState } from 'react'
import BLE from './modules/BLE'
import { Peripheral } from 'react-native-ble-manager'
import { Buffer } from 'buffer'
import MyriotaUpdater from './modules/MyriotaUpdater'
import { Button, Platform, Text, TextInput, View } from 'react-native'
import DocumentPicker, {
  DocumentPickerResponse,
} from 'react-native-document-picker'
import RNPickerSelect from 'react-native-picker-select'
import * as RNFS from 'react-native-fs'
import Xmodem from './modules/xmodem'

/**
 * Sleep for ms milliseconds
 * @param ms the number of milliseconds to sleep for
 * @returns promise the will resolve in ms milliseconds
 */
const sleep = (ms: number) => new Promise((success) => setTimeout(success, ms))

const App = () => {
  const [text, setText] = useState('MYRIOTA-DFU')
  const [file, setFile] = useState<DocumentPickerResponse>()
  const [peripherals, setPeriperals] = useState<Peripheral[]>([])
  const [firmwareType, setFirmwareType] = useState<string>()

  const firmwareTypeOptions = [
    {
      label: 'Network information',
      value: 'a',
    },
    {
      label: 'CI application',
      value: 'a',
    },
    {
      label: 'Myriota system image',
      value: 'b',
    },
  ]

  const ble = new BLE(setPeriperals) //TODO: fix this

  /**
   *  Pick a file from device storage and perform Myriota DFU
   */
  const pickFile = async () => {
    try {
      /* Pick a single file from device storage */
      const res = await DocumentPicker.pick({
        allowMultiSelection: false,
        type: [DocumentPicker.types.allFiles],
      })

      console.log('File Picker: file:', res[0])

      /* Set picked file state */
      setFile(res[0])
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        console.warn('File Picker: user cancelled the picker')
      } else {
        console.error('File Picker:', err)
      }
    }
  }

  const doMDFU = async () => {
    /* Make sure file was loaded */
    if (file == undefined) {
      throw Error('Failed loading file')
    }

    /* Conver contets of file to buffer */
    const buf = await RNFS.readFile(file.uri, 'base64').then((b64string) => {
      return Buffer.from(b64string, 'base64')
    })

    /* Start BLE manager */
    await ble.start()

    /* Perform BLE scan */
    await ble.startScan({
      serviceUUIDs: [BLE.UART_UUID],
      name: 'MYRIOTA-DFU',
      timeout: 5,
    })

    console.log('peripherals:', peripherals)

    /* Make sure device was loaded */
    if (peripherals[0] == undefined) {
      throw Error('MYRIOTA-DFU not found')
    }

    /* Connect to device */
    await ble.connect(peripherals[0])

    /* Deal with platform specific case for service and characteristic */ // TODO: improve this
    const UART_UUID: string =
      Platform.OS !== 'android' ? BLE.UART_UUID : BLE.UART_UUID.toLowerCase()
    const UART_TX_UUID: string =
      Platform.OS !== 'android'
        ? BLE.UART_TX_UUID
        : BLE.UART_TX_UUID.toLowerCase()
    const UART_RX_UUID: string =
      Platform.OS !== 'android'
        ? BLE.UART_RX_UUID
        : BLE.UART_RX_UUID.toLowerCase()

    // /* Create */
    // let readData: Buffer = Buffer.from([0])

    // await ble.write('U', UART_UUID, UART_RX_UUID)
    // readData = await ble.read(UART_UUID, UART_TX_UUID)
    // console.log('readData', readData)

    // await ble.write('s', UART_UUID, UART_RX_UUID)
    // readData = await ble.read(UART_UUID, UART_TX_UUID)
    // console.log(readData)
    // console.log('readData', readData)

    // await myriotaUpdater.write(Buffer.from('s', 'utf-8'))
    // await sleep(1000)
    // readData = myriotaUpdater.readLine(Buffer.from('\r\n'))
    // console.log(readData.toString())
    // readData = myriotaUpdater.readLine(Buffer.from('\r\n'))
    // console.log(readData.toString())

    // readData = myriotaUpdater.readLine(Buffer.from('\r\n'))
    // console.log(readData.toString())

    /* Crate Myriota DFU class */ // TODO: improve this
    const myriotaUpdater = new MyriotaUpdater(
      peripherals[0],
      UART_UUID,
      UART_TX_UUID,
      UART_RX_UUID
    )

    /* Open the Stream */
    await myriotaUpdater.open().then(
      () => console.log('MyriotaUpdater: Open: success'),
      (error) => console.error('MyriotaUpdater: Open: error:', error)
    )

    await myriotaUpdater.write(Buffer.from('U', 'utf-8'))
    do {
      const read = await myriotaUpdater.readUntil(1000, Buffer.from('\n'))
      // console.log('ret1', read.toString())
    } while (myriotaUpdater.available())

    // await myriotaUpdater.write(Buffer.from('a4000', 'utf-8'))
    // await myriotaUpdater.write(Buffer.from('s', 'utf-8'))
    await myriotaUpdater.write(Buffer.from('o', 'utf-8'))
    do {
      const read = await myriotaUpdater.readUntil(1000, Buffer.from('\n'))
      // console.log('ret2', read.toString())
    } while (myriotaUpdater.available())

    // await myriotaUpdater.xmodemSend2(buf)
    await xmodemSend(
      myriotaUpdater,
      buf,
      (ready: any) =>
        console.log('MyriotaUpdater: Ready to send', ready, 'blocks'),
      (blockNumber: any) =>
        console.log('MyriotaUpdater: Current block:', blockNumber)
    )

    await myriotaUpdater.close().then(
      () => console.log('MyriotaUpdater: Close success'),
      (error: any) => console.error('MyriotaUpdater: Close error:', error)
    )

    await ble.disconnect()
  }

  /**
   * Emulate componentDidMount and componentWillUnmount
   */
  useEffect(() => {
    console.log('App: did mount')

    /* Wrap async calls in a function that is not top level */
    const moutRoutine = async () => {
      /* Request BLE permissions */
      await ble.requestPermissions()
    }

    /* Run unmounting rountine */
    moutRoutine()

    return () => {
      console.log('App: will unmount')

      /* Wrap async calls in a function that is not top level */
      const unmoutRoutine = async () => {
        try {
          /* Stop scan */
          await ble.stopScan()

          /* Disconnect from connected device */
          await ble.disconnect()
        } catch (error) {
          console.error(error)
        }
      }

      /* Run unmounting rountine */
      unmoutRoutine()

      return
    }
  }, [])

  return (
    <View>
      <Text>Select firmware file</Text>

      <Button title='Browse' onPress={pickFile}></Button>
      {file && <Text>Loaded {file.name}</Text>}

      <Text>Select firmware type</Text>
      <RNPickerSelect
        onValueChange={(value) => {
          setFirmwareType(value)
        }}
        items={firmwareTypeOptions}
        // placeholder={{ value: firmwareType }}
        useNativeAndroidPickerStyle={true}
      />

      <Text>Insert BLE device SSID</Text>
      <TextInput value={text} onChangeText={(text) => setText(text)} />

      <Button title='Perform MDFU' onPress={doMDFU}></Button>
    </View>
  )
}

const xmodemSend = async (
  mu: MyriotaUpdater,
  data: Buffer,
  readyCb: Function,
  sentCb: Function
) => {
  return new Promise<void>(async (success, error) => {
    try {
      /* Create an Xmodem object */
      const xmodem = new Xmodem()

      /* Create listener to on 'ready' events in xmodem and trigger readyCb */
      xmodem.on('ready', (event) => readyCb(event))

      /* Create listener to on 'status' events in xmodem and trigger readyCb */
      xmodem.on('status', (event) => {
        /* If event is 'send' */
        if (event.action == 'send') {
          /* Trigger sentCb with number of chunks sent so far */
          sentCb(event.block)
        }
      })

      /* Create listener to on 'stop' events in xmodem */
      xmodem.on('stop', async () => {
        /* Delay 500 milliseconds */
        await sleep(500)

        /* Remove all listeners from xmodem */
        xmodem.removeAllListeners()

        /* Trigger resolve function  */
        success()
      })

      /* Perform xmodem send  */
      xmodem.send(mu, data)
    } catch (err) {
      /* Reject promisse with errors */
      error(err)
    }
  })
}
export default App
