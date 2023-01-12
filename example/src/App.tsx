import { MyriotaUpdater } from 'react-native-myriota-ble-dfu'
import React, { useEffect, useState } from 'react'
import BLE from './modules/BLE'
import { Peripheral } from 'react-native-ble-manager'
import { Buffer } from 'buffer'
import { Button, Platform, Text, TextInput, View } from 'react-native'
import DocumentPicker, {
  DocumentPickerResponse,
} from 'react-native-document-picker'
import RNPickerSelect from 'react-native-picker-select'
import * as RNFS from 'react-native-fs'

/* The defaulf SSID to connect */
const CONNECTION_SSID = 'MYRIOTA-DFU'

/* Connection service and characteristic */
const UART_UUID_RAW = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
const UART_RX_UUID_RAW = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
const UART_TX_UUID_RAW = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'

/* Deal with platform specific case sensitiveness for service and characteristic */
const UART_UUID =
  Platform.OS !== 'android'
    ? UART_UUID_RAW.toLocaleUpperCase()
    : UART_UUID_RAW.toLowerCase()

const UART_TX_UUID =
  Platform.OS !== 'android'
    ? UART_TX_UUID_RAW.toLocaleUpperCase()
    : UART_TX_UUID_RAW.toLowerCase()

const UART_RX_UUID =
  Platform.OS !== 'android'
    ? UART_RX_UUID_RAW.toLocaleUpperCase()
    : UART_RX_UUID_RAW.toLowerCase()

const App = () => {
  const [file, setFile] = useState<DocumentPickerResponse>()
  const [peripherals, setPeriperals] = useState<Peripheral[]>([])

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
    } catch (error) {
      if (DocumentPicker.isCancel(error)) {
        console.warn('File Picker: user cancelled the picker')
      } else {
        console.error('File Picker:', error)
      }
    }
  }

  const doMDFU = async () => {
    try {
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
        serviceUUIDs: [UART_UUID],
        name: CONNECTION_SSID,
        timeout: 5,
      })

      console.log('peripherals:', peripherals)

      /* Make sure device was loaded */
      if (peripherals[0] == undefined) {
        throw 'Device with SSID ' + CONNECTION_SSID + ' not found!'
      }

      /* Connect to device */
      await ble.connect(peripherals[0])

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

      console.log('Checking if Myriota module is in bootloader mode...')

      /* Check if Myriota module is in bootloader mode */
      const bootloaderMode = await myriotaUpdater.isBootloaderMode()

      /* If Myriota module is not in bootloader mode */
      if (!bootloaderMode) {
        /* Throw exeption */
        throw new Error('Could not enter bootloader mode!')
      }

      console.log('Bootloader detected!')

      console.log('Uploading network information')
      await myriotaUpdater.sendNetworkInformation(
        buf,
        (totalChuncks: number) =>
          console.log('MyriotaUpdater: Ready to send', totalChuncks, 'blocks'),
        (currentChunk: any) =>
          console.log('MyriotaUpdater: Current block:', currentChunk)
      )

      await myriotaUpdater.close().then(
        () => console.log('MyriotaUpdater: Close success'),
        (error: any) => console.error('MyriotaUpdater: Close error:', error)
      )

      await ble.disconnect()
    } catch (error) {
      console.error('MDFU:', error)
    }
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

      <Text>Perform MDFU</Text>
      <Button title='Perform MDFU' onPress={doMDFU}></Button>
    </View>
  )
}

export default App
