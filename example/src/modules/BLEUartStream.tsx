import { Duplex, DuplexOptions } from 'stream'
import BleManager, { Peripheral } from 'react-native-ble-manager'
import {
  NativeModules,
  NativeEventEmitter,
  EmitterSubscription,
} from 'react-native'
import { Buffer } from 'buffer'
import Xmodem from './xmodem'
import ReactNativeBlobUtil from 'react-native-blob-util'

/**
 * Sleep for ms milliseconds
 * @param ms the number of milliseconds to sleep for
 * @returns promise the will resolve in ms milliseconds
 */
const sleep = (ms: number) => new Promise((success) => setTimeout(success, ms))

class BLEUartStream extends Duplex {
  private bleManagerEmitter
  private peripheral: Peripheral
  private serviceUUID: string
  private TXcharacteristicUUID: string
  private RXcharacteristicUUID: string
  private RXSubscription: EmitterSubscription | undefined
  private RXBuffer: Buffer

  constructor(
    peripheral: Peripheral,
    serviceUUID: string,
    TXcharacteristicUUID: string,
    RXcharacteristicUUID: string,
    options?: DuplexOptions
  ) {
    super(options)
    this.peripheral = peripheral
    this.serviceUUID = serviceUUID
    this.TXcharacteristicUUID = TXcharacteristicUUID
    this.RXcharacteristicUUID = RXcharacteristicUUID
    this.bleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager)
    this.RXBuffer = Buffer.from([])
  }

  public open(): Promise<void> {
    return new Promise<void>((success, error) => {
      BleManager.startNotification(
        this.peripheral.id,
        this.serviceUUID,
        this.TXcharacteristicUUID
      ).then(
        () => {
          this.RXSubscription = this.bleManagerEmitter.addListener(
            'BleManagerDidUpdateValueForCharacteristic',
            (state) => {
              console.log(
                'BLEUartStream: RXSubscription: characteristic',
                state
              )
              if (
                state.characteristic == this.TXcharacteristicUUID
                // && peripheral.id == this.peripheral.id
              ) {
                this.RXBuffer = Buffer.concat([
                  this.RXBuffer,
                  Buffer.from(state.value),
                ])
              }
            }
          )
          success()
        },
        (err) => error('BLEUartStream startNotification: ' + err)
      )
    })
  }

  public close(): Promise<void> {
    return new Promise<void>(async (success, error) => {
      return BleManager.stopNotification(
        this.peripheral.id,
        this.serviceUUID,
        this.TXcharacteristicUUID
      ).then(() => {
        if (this.RXSubscription != undefined) {
          this.RXSubscription.remove()
        }
      })
    })
  }

  private toBytes(buffer: Buffer): number[] {
    const result = Array(buffer.length)
    for (let i = 0; i < buffer.length; ++i) {
      result[i] = buffer[i]
    }
    return result
  }

  public async writeTo(buffer: Buffer): Promise<void> {
    return new Promise<void>(async (success, error) => {
      // const connected = await BleManager.isPeripheralConnected(
      //   this.connectedPeripheral.id,
      //   [serviceUUIDs]
      // )

      // if (!connected || this.connectedPeripheral.id == '') {
      //   return error('BLEUartStream write: device not connected!')
      // }
      console.log('BLEUartStream write: writting')

      await BleManager.write(
        this.peripheral.id,
        this.serviceUUID,
        // Platform.OS !== 'android'
        //   ? characteristicUUID
        this.RXcharacteristicUUID,
        this.toBytes(buffer)
        // ,245
      ).then(
        () => {
          console.log('BLEUartStream write: done!')
          success()
        },
        (err) => {
          return error(
            'BLEUartStream write: error writing to ' +
              this.peripheral.id +
              ': ' +
              err
          )
        }
      )
    })
  }

  public readTo(): Buffer {
    // console.log('BLEUartStream read2: reading')
    const ret = this.RXBuffer
    this.RXBuffer = Buffer.from([])
    return ret
  }

  public readLine(endLine: Buffer = Buffer.from('\n')): Buffer {
    console.log('BLEUartStream readLine: reading')
    const firstNewLineIndex = this.RXBuffer.indexOf(endLine) + endLine.length
    // console.log('prev', this.RXBuffer)
    const ret = this.RXBuffer.slice(0, firstNewLineIndex)
    this.RXBuffer = this.RXBuffer.slice(firstNewLineIndex)
    return ret
  }

  public async xmodemSend(
    stream: Duplex,
    file: string,
    readyCb: Function,
    sentCb: Function
  ) {
    return new Promise<void>(async (success, error) => {
      try {
        // if (Platform.OS === 'ios') {
        //   let arr = file.split('/')
        //   const dirs = ReactNativeBlobUtil.fs.dirs
        //   file = `${dirs.DocumentDir}/${arr[arr.length - 1]}`
        // }

        const buf = await ReactNativeBlobUtil.fs
          .readFile(file, 'base64')
          .then((b64string) => {
            return Buffer.from(b64string, 'base64')
          })

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
        xmodem.send(stream, buf)
      } catch (err) {
        /* Reject promisse with errors */
        error(err)
      }
    })
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) {
    console.log('BLEUartStream write: ', chunk, encoding)
    // // The underlying source only deals with strings.
    // if (Buffer.isBuffer(chunk))
    //   chunk = chunk.toString();
    this.writeTo(chunk)
    // await sleep(1000)
    callback()
  }

  async _read(size: number) {
    // console.log('BLEUartStream _read:', size)
    await sleep(1)
    const readData = this.readTo()
    console.log(readData)
    if (readData == Buffer.from([])) {
      return
    }
    this.push(readData)
    // this.push(Buffer.from('C'))
  }
}

export default BLEUartStream
