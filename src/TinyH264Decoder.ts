type TinyH264Module = {
  HEAP8: Int8Array;
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  memory: WebAssembly.Memory;
  h264bsdInit(ptr: number, len: number): void;
  malloc(size: number): number;
  free(ptr: number): void;
  h264bsdDecode(
    pStorage: number, decBuffer: number, byteLength: number,
    pPicture: number, pWidth: number, pHeight: number,
  ): number;
  h264bsdShutdown(ptr: number): void;
  h264bsdAlloc(): number;
  h264bsdFree(ptr: number): void;
}

type AsmExports = {
  c(): void;
  d(ptr: number, len: number): void; // _h264bsdInit
  e(size: number): number; // _malloc
  f(ptr: number): void; // _free
  g(
    pStorage: number, decBuffer: number, byteLength: number,
    pPicture: number, pWidth: number, pHeight: number,
  ): number; // _h264bsdDecode
  h(ptr: number): void; // _h264bsdShutdown
  i(): number; // _h264bsdAlloc
  j(ptr: number): void; // _h264bsdFree
};

import { wasmBinary } from './h264.wasm';

const wasmTable = new WebAssembly.Table({
  "initial": 1,
  "maximum": 1 + 0,
  "element": "anyfunc"
});

const WASM_PAGE_SIZE = 65536;
const DYNAMIC_BASE = 5251792;
const DYNAMICTOP_PTR = 8752;
const INITIAL_INITIAL_MEMORY = 16777216;

const _emscripten_memcpy_big = (Module: TinyH264Module) =>
  (dest: number, src: number, num: number) => {
    Module.HEAPU8.copyWithin(dest, src, src + num);
  }

function alignUp(x: number, multiple: number) {
  const mod = x % multiple;
  return (mod > 0) ? x + multiple - mod : x;
}

const _emscripten_resize_heap = (Module: TinyH264Module) => (requestedSize: number) => {
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
      return true;
    } /*success*/
    catch (e) {}
  }
  return false;
}

async function createH264Module() {
  const wasmMemory = new WebAssembly.Memory({
    "initial": INITIAL_INITIAL_MEMORY / WASM_PAGE_SIZE,
    "maximum": 2147483648 / WASM_PAGE_SIZE
  });

  const Module = {
    HEAP8: new Int8Array(wasmMemory.buffer),
    HEAPU8: new Uint8Array(wasmMemory.buffer),
    HEAP32: new Int32Array(wasmMemory.buffer),
  } as TinyH264Module;
  
  Module.HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;

  const { instance } = await WebAssembly.instantiate(wasmBinary, {
    a: {
      memory: wasmMemory,
      table: wasmTable,
      a: _emscripten_memcpy_big(Module),
      b: _emscripten_resize_heap(Module),
    }
  });

  const asm = instance.exports as unknown as AsmExports;

  Module.h264bsdInit = asm.d;
  Module.malloc = asm.e;
  Module.free = asm.f;
  Module.h264bsdDecode = asm.g;
  Module.h264bsdShutdown = asm.h;
  Module.h264bsdAlloc = asm.i;
  Module.h264bsdFree = asm.j;

  return Module;
}

/**
 * This class wraps the details of the h264 WASM module.
 *
 * Each call to decode() will decode a single encoded element.
 * When decode() returns PIC_RDY, a picture is ready in the output buffer.
 * When you're done decoding, make sure to call release() to clean up internal buffers.
 */

export class TinyH264Decoder {
  private pStorage: number;
  private pWidth: number;
  private pHeight: number;
  private pPicture: number;
  private _decBuffer: number;

  public width = 0;
  public height = 0;
  public pic = new Uint8Array(0);

  static PIC_RDY: number;
  static RDY: number;
  static HDRS_RDY: number;
  static ERROR: number;
  static PARAM_SET_ERROR: number;
  static MEMALLOC_ERROR: number;

  static async create(): Promise<TinyH264Decoder> {
    const m = await createH264Module();
    return new TinyH264Decoder(m);
  }

  private constructor (private tinyH264Module: TinyH264Module) {
    this.pStorage = tinyH264Module.h264bsdAlloc();
    this.pWidth = tinyH264Module.malloc(4);
    this.pHeight = tinyH264Module.malloc(4);
    this.pPicture = tinyH264Module.malloc(4);

    this._decBuffer = tinyH264Module.malloc(1024 * 1024);

    tinyH264Module.h264bsdInit(this.pStorage, 0);
  }

  release () {
    const { pStorage, tinyH264Module } = this;

    if (pStorage !== 0) {
      tinyH264Module.h264bsdShutdown(pStorage);
      tinyH264Module.h264bsdFree(pStorage);
    }

    tinyH264Module.free(this.pWidth);
    tinyH264Module.free(this.pHeight);
    tinyH264Module.free(this.pPicture);

    this.pStorage = 0;
    this.pWidth = 0;
    this.pHeight = 0;
  }

  decode (nal: Uint8Array) {
    const { tinyH264Module } = this;
    tinyH264Module.HEAPU8.set(nal, this._decBuffer);

    const retCode = tinyH264Module.h264bsdDecode(
      this.pStorage, this._decBuffer, nal.byteLength,
      this.pPicture, this.pWidth, this.pHeight,
    );

    if (retCode === TinyH264Decoder.PIC_RDY) {
      const width = this.width = tinyH264Module.HEAP32[this.pWidth >> 2];
      const height = this.height = tinyH264Module.HEAP32[this.pHeight >> 2];
      const picPtr = tinyH264Module.HEAP32[this.pPicture >> 2];
      this.pic = tinyH264Module.HEAPU8.subarray(picPtr, picPtr + (width * height) * 3 / 2);
    }

    return retCode;
  }
}
