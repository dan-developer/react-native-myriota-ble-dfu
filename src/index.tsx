import { NativeModules } from 'react-native';
import { Counter } from './components/counter';
import { MyriotaDFU } from './modules/myriota-ble-dfu';

export {
  Counter,
  MyriotaDFU,
}

export default NativeModules.RNMyriotBLEDFU
