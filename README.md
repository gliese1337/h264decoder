# H264 Decoder

Just an H264 decoder. That's all. Usable in the browser & node.

This project is based on the WebAssembly H264 decoder from [TinyH264Decoder](https://github.com/udevbe/tinyh264). Some unnecessary WASM functions have been stripped out, and the JS wrapper simplified. The WebAssembly module is inlined as a Base64-encoded string, so now special loading provisions are necessary. Just `import { H264Decoder } from 'h264decoder';` and go. If you want to run it in a worker or a subprocess, that's up to you.

Create a new decoder with `new H264Decoder();`. 

`H264Decoder` objects have a single public method: `decoder.decode(nalu: Uint8Array): number`. Input is expected in the form of single, complete, pre-segmented H264 Network Abstraction Layer Units (NALUs). 
Input is expected to be complete NALs (access units) as Uint8Array, the output result is a yuv420 buffer as Uint8Array. The return value is a number from the set

```ts
H264Decoder.RDY = 0;
H264Decoder.PIC_RDY = 1;
H264Decoder.HDRS_RDY = 2;
H264Decoder.ERROR = 3;
H264Decoder.PARAM_SET_ERROR = 4;
H264Decoder.MEMALLOC_ERROR = 5;
```

When `decoder.decode(nalu)` returns `PIC_RDY`, an output frame can be accessed through `decoder.pic` as a `Uint8Array` of YUV420 data. You are on your own for converting that to RGB if you like. The frame dimensions can be accessed through `decoder.width` and `decoder.height`. The array returned through `decoder.pic` aliases internal data structures to minimize unnecessary data copying--treat it as read-only and don't mess with it! If you need to do any further processing on the image, write to a separate buffer.

There are no cleanup or reset operations. If you are done decoding a particular stream, it is expected that you will simply discard the entire decoder and create a new one as needed.