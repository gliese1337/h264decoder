"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const h264_wasm_1 = require("./h264.wasm");
const memcpy = (Module) => (dest, src, num) => {
    Module.HEAPU8.copyWithin(dest, src, src + num);
};
function alignUp(x, multiple) {
    const mod = x % multiple;
    return (mod > 0) ? x + multiple - mod : x;
}
const resize = (Module) => (requestedSize) => {
    const oldSize = Module.HEAPU8.length;
    const PAGE_MULTIPLE = 65536;
    const maxHeapSize = 2147483648;
    if (requestedSize > maxHeapSize) {
        return false;
    }
    const minHeapSize = 16777216;
    for (let cutDown = 1; cutDown <= 4; cutDown *= 2) {
        let overGrownHeapSize = oldSize * (1 + .2 / cutDown);
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
        const newSize = Math.min(maxHeapSize, alignUp(Math.max(minHeapSize, requestedSize, overGrownHeapSize), PAGE_MULTIPLE));
        try {
            const { memory } = Module;
            memory.grow((newSize - memory.buffer.byteLength + 65535) >>> 16);
            const { buffer } = memory;
            Module.HEAP8 = new Int8Array(buffer);
            Module.HEAPU8 = new Uint8Array(buffer);
            Module.HEAP32 = new Int32Array(buffer);
            return true;
        }
        catch (e) { }
    }
    return false;
};
const WASM_PAGE_SIZE = 65536;
const DYNAMIC_BASE = 5251792;
const DYNAMICTOP_PTR = 8752;
const INITIAL_INITIAL_MEMORY = 16777216;
/**
 * This class wraps the details of the h264 WASM module.
 * Each call to decode(nalu) will decode a single encoded element.
 * When decode(nalu) returns PIC_RDY, a picture is ready in the output buffer.
 */
class H264Decoder {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.pic = new Uint8Array(0);
        const wasmMemory = new WebAssembly.Memory({
            "initial": INITIAL_INITIAL_MEMORY / WASM_PAGE_SIZE,
            "maximum": 2147483648 / WASM_PAGE_SIZE
        });
        const memory = {
            memory: wasmMemory,
            HEAP8: new Int8Array(wasmMemory.buffer),
            HEAPU8: new Uint8Array(wasmMemory.buffer),
            HEAP32: new Int32Array(wasmMemory.buffer),
        };
        memory.HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
        const { exports: asm } = new WebAssembly.Instance(h264_wasm_1.h264Module, {
            h264: {
                memory: wasmMemory,
                memcpy: memcpy(memory),
                resize: resize(memory),
            }
        });
        this.memory = memory;
        this.asm = asm;
        this.pStorage = asm.h264alloc();
        this.pWidth = asm.malloc(4);
        this.pHeight = asm.malloc(4);
        this.pPicture = asm.malloc(4);
        this.decBuffer = asm.malloc(1024 * 1024);
        asm.init(this.pStorage, 0);
    }
    decode(nalu) {
        const { memory, asm } = this;
        memory.HEAPU8.set(nalu, this.decBuffer);
        const retCode = asm.decode(this.pStorage, this.decBuffer, nalu.byteLength, this.pPicture, this.pWidth, this.pHeight);
        if (retCode === H264Decoder.PIC_RDY) {
            const width = this.width = memory.HEAP32[this.pWidth >>> 2];
            const height = this.height = memory.HEAP32[this.pHeight >>> 2];
            const picPtr = memory.HEAP32[this.pPicture >> 2];
            const datalen = (width * height) * 3 / 2;
            this.pic = memory.HEAPU8.subarray(picPtr, picPtr + datalen);
        }
        return retCode;
    }
}
exports.H264Decoder = H264Decoder;
H264Decoder.RDY = 0;
H264Decoder.PIC_RDY = 1;
H264Decoder.HDRS_RDY = 2;
H264Decoder.ERROR = 3;
H264Decoder.PARAM_SET_ERROR = 4;
H264Decoder.MEMALLOC_ERROR = 5;
