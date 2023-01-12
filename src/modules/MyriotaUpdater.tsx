import BleManager, { Peripheral } from 'react-native-ble-manager'
import {
  NativeModules,
  NativeEventEmitter,
  EmitterSubscription,
} from 'react-native'
import Config from 'react-native-config'
import EventEmitter from 'events'
import { Buffer } from 'buffer'
import RingBuffer from './RingBuffer'
import Xmodem from './xmodem'
import Logger from './logger'

class MyriotaUpdater extends EventEmitter {
  private bleManagerEmitter
  private connectedPeripheral: Peripheral
  private serviceUUID: string
  private TXcharacteristicUUID: string
  private RXcharacteristicUUID: string
  private RXSubscription: EmitterSubscription | undefined
  private RXBuffer: RingBuffer
  private logger: Logger

  constructor(
    connectedPeripheral: Peripheral,
    serviceUUID: string,
    TXcharacteristicUUID: string,
    RXcharacteristicUUID: string
  ) {
    super()
    this.connectedPeripheral = connectedPeripheral
    this.serviceUUID = serviceUUID
    this.TXcharacteristicUUID = TXcharacteristicUUID
    this.RXcharacteristicUUID = RXcharacteristicUUID
    this.bleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager)
    this.RXBuffer = new RingBuffer(300)
    this.logger = new Logger(Config.DEBUG_MYRIOTA_UPDATER)
  }

  /**
   * Open stream for Myriota Firmware Update
   *
   * @returns a promise which will resolve when stream is open or reject on error
   */
  public open(): Promise<void> {
    return new Promise<void>((success, error) => {
      /*Check if device is connected */
      BleManager.isPeripheralConnected(this.connectedPeripheral.id, [
        this.serviceUUID,
      ]).then(
        (isConnected: boolean) => {
          if (!isConnected) {
            error('Device not connected!')
          }

          /* Start RX notification from connected device */
          BleManager.startNotification(
            this.connectedPeripheral.id,
            this.serviceUUID,
            this.TXcharacteristicUUID
          ).then(
            () => {
              /* Add event listener to BleManagerDidUpdateValueForCharacteristic */
              this.RXSubscription = this.bleManagerEmitter.addListener(
                'BleManagerDidUpdateValueForCharacteristic',
                (state) => {
                  /* Check if received data is meant for TXcharacteristicUUID */
                  if (state.characteristic == this.TXcharacteristicUUID) {
                    this.logger.info(
                      'MyriotaUpdater: RXSubscription:',
                      Buffer.from(state.value).toString('hex'),
                      Buffer.from(state.value).toString()
                    )
                    /* Add data to RXBuffer */
                    this.RXBuffer.write(Buffer.from(state.value))

                    /* Emmit 'data' event */
                    this.emit('data', Buffer.from(state.value))
                  }
                }
              )

              success()
            },
            (err) => error('Error starting notification for device: ' + err)
          )
        },
        (err) => error('Error checking connection status: ' + err)
      )
    })
  }

  /**
   * Close stream for Myriota Firmware Update
   *
   * @returns a promise which will resolve when stream is closed or reject on error
   */
  public close(): Promise<void> {
    return new Promise<void>(async (success, error) => {
      return BleManager.stopNotification(
        this.connectedPeripheral.id,
        this.serviceUUID,
        this.TXcharacteristicUUID
      ).then(
        () => {
          /* Remove event listener from BleManagerDidUpdateValueForCharacteristic */
          if (this.RXSubscription != undefined) {
            this.RXSubscription.remove()
          }

          success()
        },
        (err) => error(err)
      )
    })
  }

  /**
   * Check the number of bytes available on stream
   *
   * @returns the number of bytes available to read
   */
  public available() {
    return this.RXBuffer.available()
  }

  /**
   * Write data to the connected device
   *
   * @param buffer the data to be written
   * @returns a promise which will resolve when data is written or reject on error
   */
  public async write(buffer: Buffer): Promise<void> {
    return new Promise<void>(async (success, error) => {
      await BleManager.write(
        this.connectedPeripheral.id,
        this.serviceUUID,
        this.RXcharacteristicUUID,
        this.toBytes(buffer),
        245
      ).then(
        () => {
          success()
        },
        (err) =>
          error(
            'MyriotaUpdater write: error writing to ' +
              this.connectedPeripheral.id +
              ': ' +
              err
          )
      )
    })
  }

  /**
   * Reads data from stream
   *
   * @param numberOfBytes
   * @returns
   */
  public read(numberOfBytes: number): Buffer {
    return this.RXBuffer.read(numberOfBytes)
  }

  /**
   * Read serialPortStream until delimiter is found or time out is reached
   *
   * @param delimiter the delimiter to be found
   * @param timeout the timeout in milliseconds
   * @returns promise which will resolve with true if delimiter was found or false otherwise
   */
  public readDelimiter(
    delimiter: string,
    timeout: number = 1000
  ): Promise<boolean> {
    return new Promise<boolean>((success) => {
      /* Create timeout */
      const errorTimeout = setTimeout(() => {
        /* Delimiter not found */
        success(false)
      }, timeout)

      /* Subscribe to 'data' event */
      this.on('data', () => {
        /* Read all avalable data in buffer */
        const data = this.RXBuffer.read(this.RXBuffer.available())

        if (data.includes(delimiter)) {
          this.logger.info('MyriotaUpdater: readDelimiter: delimiter found!')
          /* Clear errorTimeout */
          clearTimeout(errorTimeout)

          /* Unsubscribe from 'data' event */
          this.removeAllListeners('data')

          /* Delimiter was succeffully found */
          success(true)
        }
      })
    })
  }

  /**
   * Check if Myriota module is in bootloader mode
   *
   * @returns promise which will resolve with bootloader mode or reject with error
   */
  public async isBootloaderMode() {
    return new Promise<boolean>(async (success, error) => {
      try {
        /* Send enter bootload mode command three times */
        await this.write(Buffer.from('U'))
        await this.write(Buffer.from('U'))
        await this.write(Buffer.from('U'))

        /* Look for 'Bootloader' or 'Unknown' in stream ouput */
        const isBootloaderMode = await Promise.race([
          this.readDelimiter('Bootloader'),
          this.readDelimiter('Unknown'),
        ])

        /* If Bootloader' or 'Unknown' was found on stream output */
        if (isBootloaderMode) {
          return success(true)
        }

        success(false)
      } catch (err) {
        error(
          'Failed entering bootloader!\nRestart Myriota module and try again'
        )
      }
    })
  }

  /**
   * Perform upload of a Myriota system image file
   *
   * @param file the Myriota system image file
   * @param readyCb callback function called when Xmodem is ready. Return number of chunks to be sent
   * @param sentCb callback function called when Xmodem sends a chunk. Return number of chunks sent so far
   * @returns promise which will resolve when Xmodem transfer has finished or reject with error
   */
  public async sendSystemImage(
    file: Buffer,
    readyCb: Function,
    sentCb: Function
  ) {
    return this.xmodemSend(file, 'a4000', readyCb, sentCb)
  }

  /**
   * Perform upload of a Myriota user application file
   *
   * @param file the Myriota user application file
   * @param readyCb callback function called when Xmodem is ready. Return number of chunks to be sent
   * @param sentCb callback function called when Xmodem sends a chunk. Return number of chunks sent so far
   * @returns promise which will resolve when Xmodem transfer has finished or reject with error
   */
  public async sendUserApplication(
    file: Buffer,
    readyCb: Function,
    sentCb: Function
  ) {
    return this.xmodemSend(file, 's', readyCb, sentCb)
  }

  /**
   * Perform upload of a Myriota network information file
   *
   * @param file the Myriota network information file
   * @param readyCb callback function called when Xmodem is ready. Return number of chunks to be sent
   * @param sentCb callback function called when Xmodem sends a chunk. Return number of chunks sent so far
   * @returns promise which will resolve when Xmodem transfer has finished or reject with error
   */
  public async sendNetworkInformation(
    file: Buffer,
    readyCb: Function,
    sentCb: Function
  ) {
    return this.xmodemSend(file, 'o', readyCb, sentCb)
  }

  /**
   * Start Myriota application and wait until application has started or time out
   *
   * @param timeout the timeout to detect application started
   * @returns promise which will resolve when application has started or reject on timeout
   */
  public async startApplication(timeout: number = 45000) {
    return new Promise<void>(async (success, error) => {
      try {
        /* Send start application command */
        await this.write(Buffer.from('b'))

        /* Read stream until 'Starting application' if found */
        const applicationStarted = await this.readDelimiter(
          'Starting application',
          timeout
        )

        if (applicationStarted) {
          /* Application has started */
          return success()
        }

        error(new Error('Application not started!'))
      } catch (err) {
        error(err)
      }
    })
  }

  /**
   * Perform Xmodem send action to serialPortStream
   *
   * @param file the file with the data to be transfered
   * @param command the command to be run prior to the transfer
   * @param readyCb callback function called when Xmodem is ready. Return number of chunks to be sent
   * @param sentCb callback function called when Xmodem sends a chunk. Return number of chunks sent so far
   * @returns promise which will resolve when Xmodem transfer has finished or reject with error
   */
  private xmodemSend = async (
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
          await this.sleep(500)

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

  private toBytes(buffer: Buffer): number[] {
    const result = Array(buffer.length)
    for (let i = 0; i < buffer.length; ++i) {
      result[i] = buffer[i]
    }
    return result
  }

  /**
   * Sleep for ms milliseconds
   * @param ms the number of milliseconds to sleep for
   * @returns promise the will resolve in ms milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((success) => setTimeout(success, ms))
  }
}

export default MyriotaUpdater
