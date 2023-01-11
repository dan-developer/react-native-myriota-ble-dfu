import RNMyriotaBLEDFUModule, { MyriotaDFU } from 'react-native-myriota-ble-dfu'
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

    /* Crate Myriota DFU class */ // TODO: improve this
    const myriotaUpdater = new MyriotaDFU(
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

export default App
