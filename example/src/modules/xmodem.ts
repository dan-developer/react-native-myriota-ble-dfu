import EventEmitter from "events";
import { Buffer } from "buffer";
import { Duplex } from "readable-stream";

class Xmodem extends EventEmitter {
  static XMODEM_START_BLOCK = 1;
  static XMODEM_MAX_TIMEOUTS = 5;
  static XMODEM_MAX_ERRORS = 10;
  static XMODEM_CRC_ATTEMPTS = 3;
  static XMODEM_OP_MODE = "crc";
  static timeout_seconds = 10;
  static block_size = 128;


  constructor() {
    super();
  }

  send(socket: Duplex, dataBuffer: Buffer) {
    let blockNumber = Xmodem.XMODEM_START_BLOCK;
    const packagedBuffer = new Array();
    let current_block = Buffer.alloc(Xmodem.block_size);
    let sent_eof = false;
    const _self = this;

    const SOH = 0x01;
    const EOT = 0x04;
    const ACK = 0x06;
    const NAK = 0x15;
    const FILLER = 0x1a;
    const CRC_MODE = 0x43;

    console.log('Xmodem: dataBuffer.length', dataBuffer.length);

    // FILLER
    for (let i = 0; i < Xmodem.XMODEM_START_BLOCK; i++) {
      packagedBuffer.push("");
    }

    while (dataBuffer.length > 0) {
      for (let i = 0; i < Xmodem.block_size; i++) {
        current_block[i] = dataBuffer[i] === undefined ? FILLER : dataBuffer[i];
      }
      dataBuffer = dataBuffer.slice(Xmodem.block_size);
      packagedBuffer.push(current_block);
      current_block = Buffer.alloc(Xmodem.block_size);
    }

    /**
     * Ready to send event, buffer has been broken into individual blocks to be sent.
     * @event Xmodem#ready
     * @property {integer} - Indicates how many blocks are ready for transmission
     */
    _self.emit("ready", packagedBuffer.length - 1); // We don't count the filler


    const sendData = function (data: any) {
      /*
       * Here we handle the beginning of the transmission
       * The receiver initiates the transfer by either calling
       * checksum mode or CRC mode.
       */
      if (data[0] === CRC_MODE && blockNumber === Xmodem.XMODEM_START_BLOCK) {
        console.info("Xmodem: [SEND] - received C byte for CRC transfer!");
        Xmodem.XMODEM_OP_MODE = "crc";
        if (packagedBuffer.length > blockNumber) {
          /**
           * Transmission Start event. A successful start of transmission.
           * @event Xmodem#start
           * @property {string} - Indicates transmission mode 'crc' or 'normal'
           */
          _self.emit("start", Xmodem.XMODEM_OP_MODE);
          sendBlock(
            socket,
            blockNumber,
            packagedBuffer[blockNumber],
            Xmodem.XMODEM_OP_MODE
          );
          _self.emit("status", {
            action: "send",
            signal: "SOH",
            block: blockNumber,
          });
          blockNumber++;
        }
      } else if (data[0] === NAK && blockNumber === Xmodem.XMODEM_START_BLOCK) {
        console.info("Xmodem: [SEND] - received NAK byte for standard checksum transfer!");
        Xmodem.XMODEM_OP_MODE = "normal";
        if (packagedBuffer.length > blockNumber) {
          _self.emit("start", Xmodem.XMODEM_OP_MODE);
          sendBlock(
            socket,
            blockNumber,
            packagedBuffer[blockNumber],
            Xmodem.XMODEM_OP_MODE
          );
          _self.emit("status", {
            action: "send",
            signal: "SOH",
            block: blockNumber,
          });
          blockNumber++;
        }
      } else if (data[0] === ACK && blockNumber > Xmodem.XMODEM_START_BLOCK) {
        /*
         * Here we handle the actual transmission of data and
         * retransmission in case the block was not accepted.
         */
        // Woohooo we are ready to send the next block! :)
        console.info("Xmodem: ACK RECEIVED");
        _self.emit("status", { action: "recv", signal: "ACK" });
        if (packagedBuffer.length > blockNumber) {
          sendBlock(
            socket,
            blockNumber,
            packagedBuffer[blockNumber],
            Xmodem.XMODEM_OP_MODE
          );
          _self.emit("status", {
            action: "send",
            signal: "SOH",
            block: blockNumber,
          });
          blockNumber++;
        } else if (packagedBuffer.length === blockNumber) {
          // We are EOT
          if (sent_eof === false) {
            sent_eof = true;
            console.info("Xmodem: WE HAVE RUN OUT OF STUFF TO SEND, EOT EOT!");
            _self.emit("status", { action: "send", signal: "EOT" });
            socket.write(Buffer.from([EOT]));
          } else {
            // We are finished!
            console.info("Xmodem: [SEND] - Finished!");
            _self.emit("stop", 0);
            socket.removeListener("data", sendData);
          }
        }
      } else if (data[0] === NAK && blockNumber > Xmodem.XMODEM_START_BLOCK) {
        if (blockNumber === packagedBuffer.length && sent_eof) {
          console.info(
            "Xmodem: [SEND] - Resending EOT, because receiver responded with NAK."
          );
          _self.emit("status", { action: "send", signal: "EOT" });
          socket.write(Buffer.from([EOT]));
        } else {
          console.info(
            "Xmodem: [SEND] - Packet corruption detected, resending previous block."
          );
          _self.emit("status", { action: "recv", signal: "NAK" });
          blockNumber--;
          if (packagedBuffer.length > blockNumber) {
            sendBlock(
              socket,
              blockNumber,
              packagedBuffer[blockNumber],
              Xmodem.XMODEM_OP_MODE
            );
            _self.emit("status", {
              action: "send",
              signal: "SOH",
              block: blockNumber,
            });
            blockNumber++;
          }
        }
      } else {
        console.warn("Xmodem: GOT SOME UNEXPECTED DATA which was not handled properly!");
        console.warn("Xmodem: ===>", data);
        console.warn("Xmodem: <===", "blockNumber: " + blockNumber);
      }
    };




    const sendBlock = function (
      socket: Duplex,
      blockNr: number,
      blockData: any,
      mode: string
    ) {
      let crcCalc = 0;
      let sendBuffer = Buffer.concat([
        Buffer.from([SOH]),
        Buffer.from([blockNr]),
        Buffer.from([0xff - blockNr]),
        blockData,
      ]);
      console.info("Xmodem: SENDBLOCK! Data length: " + blockData.length);
      console.info('Xmodem: sendbuffer:', sendBuffer);
      if (mode === "crc") {
        let crcString = crc16xmodem(blockData).toString(16);
        // Need to avoid odd string for Buffer creation
        if (crcString.length % 2 == 1) {
          crcString = "0".concat(crcString);
        }
        // CRC must be 2 bytes of length
        if (crcString.length === 2) {
          crcString = "00".concat(crcString);
        }
        sendBuffer = Buffer.concat([sendBuffer, Buffer.from(crcString, "hex")]);
      } else {
        // Count only the blockData into the checksum
        for (let i = 3; i < sendBuffer.length; i++) {
          crcCalc = crcCalc + sendBuffer.readUInt8(i);
        }
        crcCalc = crcCalc % 256;
        let crcCalcStr = crcCalc.toString(16);
        if (crcCalcStr.length % 2 != 0) {
          // Add padding for the string to be even
          crcCalcStr = "0" + crcCalcStr;
        }
        sendBuffer = Buffer.concat([sendBuffer, Buffer.from(crcCalcStr, "hex")]);
      }
      console.info("Xmodem: Sending buffer with total length: " + sendBuffer.length);
      socket.write(sendBuffer);
    };



    socket.on("data", sendData);
  }

}
type BufferInput = string | ArrayBuffer | Buffer;

interface CRCCalculator<T = BufferInput | Uint8Array> {
  (value: T, previous?: number): number;
}

const crc16xmodem: CRCCalculator<Uint8Array> = (current, previous) => {
  let crc = typeof previous !== 'undefined' ? ~~previous : 0x0;

  for (let index = 0; index < current.length; index++) {
    let code = (crc >>> 8) & 0xff;

    code ^= current[index] & 0xff;
    code ^= code >>> 4;
    crc = (crc << 8) & 0xffff;
    crc ^= code;
    code = (code << 5) & 0xffff;
    crc ^= code;
    code = (code << 7) & 0xffff;
    crc ^= code;
  }

  return crc;
};

export default Xmodem;