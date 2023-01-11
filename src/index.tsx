import { NativeModules } from 'react-native'
import MyriotaUpdater from './modules/MyriotaUpdater'

const MyriotaDFU = MyriotaUpdater

export { MyriotaDFU }

export default NativeModules.RNMyriotBLEDFU
