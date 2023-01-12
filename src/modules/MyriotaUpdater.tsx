import BleManager, { Peripheral } from 'react-native-ble-manager'
import {
  NativeModules,
  NativeEventEmitter,
  EmitterSubscription,
} from 'react-native'
import EventEmitter from 'events'
import { Buffer } from 'buffer'
import RingBuffer from './RingBuffer'
import Xmodem from './xmodem'
import Logger from './logger'

/**
 * Sleep for ms milliseconds
 * @param ms the number of milliseconds to sleep for
 * @returns promise the will resolve in ms milliseconds
 */
const sleep = (ms: number) => new Promise((success) => setTimeout(success, ms))

class MyriotaUpdater extends EventEmitter {
  private bleManagerEmitter
  private peripheral: Peripheral
  private serviceUUID: string
  private TXcharacteristicUUID: string
  private RXcharacteristicUUID: string
  private RXSubscription: EmitterSubscription | undefined
  private RXBuffer: RingBuffer
  private logger: Logger

  constructor(
    peripheral: Peripheral,
    serviceUUID: string,
    TXcharacteristicUUID: string,
    RXcharacteristicUUID: string
  ) {
    super()
    this.peripheral = peripheral
    this.serviceUUID = serviceUUID
    this.TXcharacteristicUUID = TXcharacteristicUUID
    this.RXcharacteristicUUID = RXcharacteristicUUID
    this.bleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager)
    this.RXBuffer = new RingBuffer(300)
    this.logger = new Logger(false) // TODO: add ability to change this from a .env file
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
              if (state.characteristic == this.TXcharacteristicUUID) {
                this.logger.info(
                  'MyriotaUpdater: RXSubscription:',
                  Buffer.from(state.value).toString('hex'),
                  Buffer.from(state.value).toString()
                )
                this.RXBuffer.write(Buffer.from(state.value))
                this.emit('data', Buffer.from(state.value))
              }
            }
          )
          success()
        },
        (err: any) => error('MyriotaUpdater startNotification: ' + err)
      )
    })
  }

  public available() {
    return this.RXBuffer.available()
  }

  public close(): Promise<void> {
    return new Promise<void>(async (success, error) => {
      return BleManager.stopNotification(
        this.peripheral.id,
        this.serviceUUID,
        this.TXcharacteristicUUID
      ).then(
        () => {
          if (this.RXSubscription != undefined) {
            this.RXSubscription.remove()
          }
          success()
        },
        (err: any) => error
      )
    })
  }

  private toBytes(buffer: Buffer): number[] {
    const result = Array(buffer.length)
    for (let i = 0; i < buffer.length; ++i) {
      result[i] = buffer[i]
    }
    return result
  }

  public async write(buffer: Buffer): Promise<void> {
    return new Promise<void>(async (success, error) => {
      await BleManager.write(
        this.peripheral.id,
        this.serviceUUID,
        this.RXcharacteristicUUID,
        this.toBytes(buffer),
        245
      ).then(
        () => {
          success()
        },
        (err: any) => {
          return error(
            'MyriotaUpdater write: error writing to ' +
              this.peripheral.id +
              ': ' +
              err
          )
        }
      )
    })
  }

  public read(): Buffer {
    return this.RXBuffer.read(1)
  }

  public readAll(): Buffer {
    return this.RXBuffer.read(this.RXBuffer.available())
  }

  public async readUntil(
    timeout: number = 1000,
    endLine: Buffer = Buffer.from('\n')
  ): Promise<Buffer> {
    let ret: Buffer = Buffer.alloc(0)
    let currentBuf = this.read()
    let hasTimedOut = false

    const readTimeout = setTimeout(() => {
      hasTimedOut = true
    }, timeout)

    /* While it hasn't timed out */
    while (!hasTimedOut) {
      /* If endLine was found */
      if (Buffer.compare(currentBuf, endLine) == 0) {
        /* End timeout */
        clearTimeout(readTimeout)

        /* End RXBuffer polling */
        break
      }

      /* Read and concatenate RXBuffer if it is available */
      if (this.RXBuffer.available()) {
        ret = Buffer.concat([ret, currentBuf])

        currentBuf = this.read()
      }

      /* Avoid locking JavaScript runtime */
      await sleep(1)
    }

    return ret
  }

  public async readTimeout(timeout: number = 1000): Promise<Buffer> {
    let ret: Buffer = Buffer.alloc(0)

    let hasTimedOut = false

    const readTimeout = setTimeout(() => {
      hasTimedOut = true
    }, timeout)

    /* While it hasn't timed out */
    while (!hasTimedOut) {
      /* Read and concatenate RXBuffer if it is available */
      if (this.RXBuffer.available()) {
        ret = this.read()
        break
      }

      /* Avoid locking JavaScript runtime */
      await sleep(1)
    }

    return ret
  }

  public readDelimiter(delimiter: string): boolean {
    const data = this.readAll()

    return data.includes(delimiter)
  }

  /**
   * Check if Myriota module is in bootloader mode
   *
   * @returns Promisse which will resolve with bootloader mode or reject with error
   */
  public async isBootloaderMode() {
    return new Promise<boolean>(async (success, error) => {
      try {
        /* Send enter bootload mode command three times */
        await this.write(Buffer.from('U'))
        await this.write(Buffer.from('U'))
        await this.write(Buffer.from('U'))

        // /* Flush serialPortStream */
        // this.serialPortStream.flush()

        /* Look for 'Bootloader' or 'Unknown' in serialPortStream ouput */
        const isBootloaderMode = await Promise.race([
          this.readDelimiter('Bootloader'),
          this.readDelimiter('Unknown'),
        ])

        /* If Bootloader' or 'Unknown' was found on serialPortStream output */
        if (isBootloaderMode) {
          return success(true)
        }

        success(false)
      } catch (err) {
        /* Reject promisse with errors */
        error(
          'Failed entering bootloader!\nRestart Myriota module and try again'
        )
      }
    })
  }

  public xmodemSend = async (
    file: Buffer,
    command: string,
    readyCb: Function,
    sentCb: Function
  ) => {
    return new Promise<void>(async (success, error) => {
      /* Create time out for MDFU process */
      const errorTimeout = setTimeout(() => {
        error('MDFU error: Timed out uploading file!')
      }, 180000)

      try {
        /* Send upload type command */
        await this.write(Buffer.from(command))

        /* Create an Xmodem object */
        const xmodem = new Xmodem()

        /* Create listener to on 'ready' events in xmodem and trigger readyCb */
        xmodem.on('ready', (event) => readyCb(event))

        /* Create listener to on 'status' events in xmodem and trigger readyCb */
        xmodem.on('status', (event) => {
          /* If event is 'send' */
          if (event.block) {
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

          /* Clear errorTimeout */
          clearTimeout(errorTimeout)

          /* Trigger resolve function  */
          success()
        })

        /* Perform xmodem send  */
        xmodem.send(this, file)
      } catch (err) {
        /* Reject promise with error */
        error(err)
      }
    })
  }

  public async sendSystemImage(
    file: Buffer,
    readyCb: Function,
    sentCb: Function
  ) {
    return this.xmodemSend(file, 'a4000', readyCb, sentCb)
  }

  public async sendUserApplication(
    file: Buffer,
    readyCb: Function,
    sentCb: Function
  ) {
    return this.xmodemSend(file, 's', readyCb, sentCb)
  }

  public async sendNetworkInformation(
    file: Buffer,
    readyCb: Function,
    sentCb: Function
  ) {
    return this.xmodemSend(file, 'o', readyCb, sentCb)
  }
}

export default MyriotaUpdater
