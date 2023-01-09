import BleManager, { Peripheral } from 'react-native-ble-manager'
import {
  NativeModules,
  NativeEventEmitter,
  EmitterSubscription,
} from 'react-native'
import EventEmitter from 'events'
import { Buffer } from 'buffer'

/**
 * Sleep for ms milliseconds
 * @param ms the number of milliseconds to sleep for
 * @returns promise the will resolve in ms milliseconds
 */
const sleep = (ms: number) => new Promise((success) => setTimeout(success, ms))

class RingBuffer {
  capacity: number
  buffer: Buffer
  numItems: number
  head: number
  tail: number

  constructor(capacity: number) {
    this.capacity = capacity
    this.buffer = Buffer.alloc(capacity)
    this.buffer.fill(0)
    this.numItems = 0

    // Points to the index where the next index will be read/removed
    this.head = 0
    // Points to the index where the next item will be entered
    this.tail = 0
  }

  public clear() {
    this.head = this.tail = this.numItems = 0
  }

  public available(): number {
    const delta = this.tail - this.head

    if (delta < 0) {
      return 0
    }

    return delta
  }

  public dequeue(num: number): Buffer {
    // check for empty buffer
    if (this.numItems === 0) {
      return Buffer.alloc(0)
    }

    // find the distance from head to tail
    let headTailDist = this.available()

    const readBuffSize = Math.min(num, headTailDist)

    // Allocate less if we hit tail before n
    const readBuff = Buffer.alloc(readBuffSize)

    // loop until we hit data length
    for (let i = 0; i < num; ++i) {
      readBuff[i] = this.buffer[this.head]
      --this.numItems
      this.head = this.nextIndex(this.head + 1) % this.capacity

      // check if we've reached the tail
      if (this.head === this.tail) {
        return readBuff
      }
    }
    // console.log('dequeueing:', readBuff)

    return readBuff
  }

  public enqueue(data: Buffer): void {
    // console.log('enqueueing:', data)
    for (let i = 0; i < data.length; ++i) {
      // write the data to the tail
      this.buffer[this.tail] = data[i]

      this.tail = this.nextIndex(this.tail)

      // if the buffer is at capacity, move foward the head
      if (this.numItems === this.capacity) {
        this.head = this.nextIndex(this.head)
      } else {
        ++this.numItems
      }
    }
    // console.log('buffer:', this.buffer)r
  }

  private nextIndex(ptr: number): number {
    return (ptr + 1) % this.capacity
  }
}

class MyriotaUpdater extends EventEmitter {
  private bleManagerEmitter
  private peripheral: Peripheral
  private serviceUUID: string
  private TXcharacteristicUUID: string
  private RXcharacteristicUUID: string
  private RXSubscription: EmitterSubscription | undefined
  private RXBuffer: RingBuffer

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
                // console.log('RXSubscription new value:', state.value)
                // console.log(
                //   'RXSubscription new value Buffer:',
                //   Buffer.from(state.value)
                // )
                this.RXBuffer.enqueue(Buffer.from(state.value))
                this.emit('data', Buffer.from(state.value))
              }
            }
          )
          success()
        },
        (err) => error('MyriotaUpdater startNotification: ' + err)
      )
    })
  }

  // public clear() {
  //   this.RXBuffer.clear()
  // }

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
        (err) => error
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
        (err) => {
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
    return this.RXBuffer.dequeue(1)
  }

  public readAll(): Buffer {
    return this.RXBuffer.dequeue(this.RXBuffer.available())
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

  public xmodemSend2 = async (
    data: Buffer,
    crc: boolean = true,
    maxRetries: number = 16
  ): Promise<void> => {
    return new Promise<void>(async (success) => {
      // Set up the XModem packet structure
      const SOH = 0x01
      const STX = 0x02
      const EOT = 0x04
      const ACK = 0x06
      const NAK = 0x15
      const CAN = 0x18
      const PKT_SIZE = 128
      const PKT_OVHD = crc ? 5 : 3

      // Initialize variables
      let retries = 0
      let seq = 1
      let pkt: Buffer
      let crc_hi: number
      let crc_lo: number

      const crc_ccitt = (data: Buffer): number => {
        let crc = 0x0000

        const crc_table = [
          0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7,
          0x8108, 0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad, 0xe1ce, 0xf1ef,
          0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
          0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de,
          0x2462, 0x3443, 0x0420, 0x1401, 0x64e6, 0x74c7, 0x44a4, 0x5485,
          0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
          0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4,
          0xb75b, 0xa77a, 0x9719, 0x8738, 0xf7df, 0xe7fe, 0xd79d, 0xc7bc,
          0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
          0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b,
          0x5af5, 0x4ad4, 0x7ab7, 0x6a96, 0x1a71, 0x0a50, 0x3a33, 0x2a12,
          0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
          0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41,
          0xedae, 0xfd8f, 0xcdec, 0xddcd, 0xad2a, 0xbd0b, 0x8d68, 0x9d49,
          0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
          0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78,
          0x9188, 0x81a9, 0xb1ca, 0xa1eb, 0xd10c, 0xc12d, 0xf14e, 0xe16f,
          0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
          0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e,
          0x02b1, 0x1290, 0x22f3, 0x32d2, 0x4235, 0x5214, 0x6277, 0x7256,
          0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
          0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
          0xa7db, 0xb7fa, 0x8799, 0x97b8, 0xe75f, 0xf77e, 0xc71d, 0xd73c,
          0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
          0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab,
          0x5844, 0x4865, 0x7806, 0x6827, 0x18c0, 0x08e1, 0x3882, 0x28a3,
          0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
          0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92,
          0xfd2e, 0xed0f, 0xdd6c, 0xcd4d, 0xbdaa, 0xad8b, 0x9de8, 0x8dc9,
          0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
          0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8,
          0x6e17, 0x7e36, 0x4e55, 0x5e74, 0x2e93, 0x3eb2, 0x0ed1, 0x1ef0,
        ]

        for (let i = 0; i < data.length; i++) {
          crc = ((crc << 8) ^ crc_table[((crc >> 8) ^ data[i]) & 0xff]) & 0xffff
        }
        return crc
      }

      const dataLength = Math.ceil(data.length / PKT_SIZE)

      // Send the data using the XModem protocol
      while (data.length > 0) {
        // console.log('data.length', data.length)
        // Set up the packet header
        pkt = Buffer.alloc(PKT_SIZE + PKT_OVHD)

        // console.log('pkt1:', pkt.toString('hex'))
        pkt[0] = SOH
        pkt[1] = seq
        pkt[2] = ~seq & 0xff
        // console.log('pkt2:', pkt.toString('hex'))

        // Fill the packet with data
        data.copy(pkt, PKT_OVHD - 2, 0, PKT_SIZE)
        // console.log('pkt3:', pkt.toString('hex'))

        // Calculate the CRC if necessary
        if (crc) {
          // console.log('pkt.length', pkt.length)
          // console.log('pkt', pkt.slice(3, pkt.length - 2).toString('hex'))
          const crc16 = crc_ccitt(pkt.slice(3, pkt.length - 2))
          crc_hi = (crc16 >> 8) & 0xff
          crc_lo = crc16 & 0xff
          // console.log('crc_hi', crc_hi.toString(16))
          // console.log('crc_lo', crc_lo.toString(16))
          pkt[PKT_SIZE + 3] = crc_hi
          pkt[PKT_SIZE + 4] = crc_lo
        }

        // console.log('pkt4:', pkt.toString('hex'))

        // Send the packet and wait for an ACK
        retries = 0
        while (retries < maxRetries) {
          console.log(
            'writting packet:',
            pkt[1],
            'of',
            dataLength
            // pkt.toString('hex')
          )
          await this.write(pkt)
          // await sleep(1)
          const ret = this.readAll()
          // console.log('Read:', ret.toString())
          // console.log('Read hex:', ret.toString('hex'))
          if (ret[0] === ACK) {
            break
          }
          retries++
        }

        // If we have exhausted our retries, abort the transfer
        if (retries === maxRetries) {
          await this.write(Buffer.from([CAN]))
          await this.write(Buffer.from([CAN]))
          await this.write(Buffer.from([CAN]))
          throw new Error('XModem: Too many retries')
        }

        // Update the sequence number and remove the sent data from the buffer
        seq++
        data = data.slice(PKT_SIZE)
      }

      // Send the EOT character and wait for an ACK
      retries = 0
      while (retries < maxRetries) {
        await this.write(Buffer.from([EOT]))
        // await sleep(1)
        const ret = this.readAll()
        // console.log('Read:', ret.toString())
        console.log('Read hex:', ret.toString('hex'))
        if (ret[0] === ACK) {
          break
        }
        retries++
      }

      // If we have exhausted our retries, abort the transfer
      if (retries === maxRetries) {
        await this.write(Buffer.from([CAN]))
        await this.write(Buffer.from([CAN]))
        await this.write(Buffer.from([CAN]))
        throw new Error('XModem: Too many retries')
      }
      success()
    })
  }
}
export default MyriotaUpdater
