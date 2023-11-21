import React, { useEffect, useState } from 'react'
import { Button, Platform, Text, View } from 'react-native'
import { Peripheral } from 'react-native-ble-manager'
import DocumentPicker, {
  DocumentPickerResponse,
} from 'react-native-document-picker'
import * as RNFS from 'react-native-fs'
import Config from 'react-native-config'
import { MyriotaUpdater } from 'react-native-myriota-ble-dfu'
import BLE from './modules/BLE'
import { Buffer } from 'buffer'

/* The defaulf SSID to connect to */
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
  let myriotaUpdater: MyriotaUpdater

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

  /**
   * Perform Myriota DFU
   */
  const doMDFU = async () => {
    try {
      console.log('Starting Myritoa DFU')

      /* Make sure file was loaded */
      if (file == undefined) {
        throw Error('Failed loading file')
      }

      /* Perform BLE scan for a specific device */
      await ble.startScan({
        serviceUUIDs: [UART_UUID],
        name: CONNECTION_SSID,
        timeout: 5,
      })

      console.log('peripherals:', peripherals)

      /* Make sure devices were found */
      if (peripherals[0] == undefined) {
        throw 'No devices found!'
      }

      /* Connect to device */
      await ble.connect(peripherals[0])

      /* Crate Myriota DFU class */
      myriotaUpdater = new MyriotaUpdater(
        peripherals[0],
        UART_UUID,
        UART_TX_UUID,
        UART_RX_UUID
      )

      /* Open stream */
      await myriotaUpdater.open()

      console.log('Checking if Myriota module is in bootloader mode...')

      /* Check if Myriota module is in bootloader mode */
      const bootloaderMode = await myriotaUpdater.isBootloaderMode()

      /* If Myriota module is not in bootloader mode */
      if (!bootloaderMode) {
        /* Throw exeption */
        throw new Error('Could not enter bootloader mode!')
      }

      console.log('Bootloader detected!')

      /* Conver contets of file to buffer */
      const fileBuffer = await RNFS.readFile(file.uri, 'base64').then(
        (b64string: string) => {
          return Buffer.from(b64string, 'base64')
        }
      )

      /* Perform update for network information */
      console.log('Uploading network information')
      await myriotaUpdater.sendNetworkInformation(
        fileBuffer,
        (totalChuncks: number) =>
          console.log('MyriotaUpdater: ready to send', totalChuncks, 'blocks'),
        (currentChunk: any) =>
          console.log('MyriotaUpdater: current block:', currentChunk)
      )

      console.log('Starting application...')

      /* Start application */
      await myriotaUpdater.startApplication()

      console.log('Application started!')

      /* Close stream */
      await myriotaUpdater.close()

      /* Connect from device */
      await ble.disconnect()

      console.log('MDFU done!')
    } catch (error) {
      console.error('MDFU:', error)

      if (myriotaUpdater != undefined) {
        /* Close stream */
        await myriotaUpdater.close()
      }

      /* Connect from device */
      await ble.disconnect()
    }
  }

  /**
   * Emulate componentDidMount and componentWillUnmount
   */
  useEffect(() => {
    console.log('App: did mount')

    /* Wrap async calls in a function that is not top level */
    const moutRoutine = async () => {
      try {
        console.log(Config)

        /* Request BLE permissions */
        await ble.requestPermissions()

        /* Start BLE manager */
        await ble.start()
      } catch (error) {
        console.error('App: Error mounting:', error)
      }
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
          console.error('App: Error unmounting:', error)
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
