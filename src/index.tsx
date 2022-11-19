import { NativeModules } from 'react-native'
import BleManager from 'react-native-ble-manager'

export const UART_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
export const RX_CHARACTERISTIC = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
export const TX_CHARACTERISTIC = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'

const MyriotaDFU = async () => {}

export { MyriotaDFU }

export default NativeModules.RNMyriotBLEDFU
