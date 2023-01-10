import { Buffer } from 'buffer'

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

  public get length(): number {
    return this.buffer.length
  }

  public read(num: number): Buffer {
    // check for empty buffer
    if (this.numItems === 0) {
      return Buffer.alloc(0)
    }

    // find the distance from head to tail
    let headTailDist = 0
    if (this.tail < this.head) {
      headTailDist = this.capacity - this.head + this.tail
    } else if (this.tail === this.head) {
      headTailDist = this.capacity
    } else {
      headTailDist = this.tail - this.head
    }

    const readBuffSize = Math.min(num, headTailDist)

    // Allocate less if we hit tail before n
    const readBuff = Buffer.alloc(readBuffSize)

    // loop until we hit data length
    for (let i = 0; i < num; ++i) {
      readBuff[i] = this.buffer[this.head]
      --this.numItems
      this.head = this.incrementPtr(this.head)

      // check if we've reached the tail
      if (this.head === this.tail) {
        return readBuff
      }
    }

    return readBuff
  }

  public write(data: Buffer): void {
    for (let i = 0; i < data.length; ++i) {
      // write the data to the tail
      this.buffer[this.tail] = data[i]

      this.tail = this.incrementPtr(this.tail)

      // if the buffer is at capacity, move foward the head
      if (this.numItems === this.capacity) {
        this.head = this.incrementPtr(this.head)
      } else {
        ++this.numItems
      }
    }
  }

  private incrementPtr(ptr: number): number {
    return (ptr + 1) % this.capacity
  }
}

export default RingBuffer
